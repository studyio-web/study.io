import {
  computeElapsedSessionSeconds,
  getServerNow,
  getServerClockOffset,
  ElapsedCalculationResult,
} from './serverTime';

export type TimerMode = 'stopwatch' | 'countdown' | 'pomodoro';

export interface TimerSessionState {
  sessionId: string | null;
  mode: TimerMode;
  isStudying: boolean;
  isPaused: boolean;
  startTime: number | null; // Start of current running interval
  sessionCreatedAt: number | null; // Absolute session creation anchor
  accumulatedSeconds: number; // Seconds accumulated before current interval
  pausedTotalMs: number; // Total milliseconds paused throughout session
  lastPausedAt: number | null;
  sessionVersion: number;
}

export interface ActiveSessionRemote {
  session_id: string;
  user_id?: string;
  status: 'running' | 'paused' | 'idle';
  mode?: TimerMode;
  started_at?: string | number | null;
  session_created_at?: string | number | null;
  created_at?: string | number | null;
  accumulated_seconds?: number;
  accumulated_ms?: number;
  last_paused_at?: string | number | null;
  version: number;
}

/**
 * Authoritative Timer Session Engine
 * Implements the exact state machine and mathematical guarantees for:
 * 1. Clean starts without leftover residue
 * 2. Monotonic versioning and conflict rejection
 * 3. Exact sanity clamping across pauses, resumes, and cross-device sync
 */
export class TimerSessionEngine {
  private state: TimerSessionState = {
    sessionId: null,
    mode: 'stopwatch',
    isStudying: false,
    isPaused: false,
    startTime: null,
    sessionCreatedAt: null,
    accumulatedSeconds: 0,
    pausedTotalMs: 0,
    lastPausedAt: null,
    sessionVersion: 0,
  };

  constructor(initialState?: Partial<TimerSessionState>) {
    if (initialState) {
      this.state = { ...this.state, ...initialState };
    }
  }

  getState(): Readonly<TimerSessionState> {
    return { ...this.state };
  }

  /**
   * Start a new timer session.
   * Unconditionally discards any prior accumulated time or paused state.
   */
  startTimer(options?: { mode?: TimerMode; serverNow?: number; sessionId?: string }): {
    sessionId: string;
    startTime: number;
    sessionCreatedAt: number;
    accumulatedSeconds: number;
    version: number;
  } {
    const serverNow = options?.serverNow ?? getServerNow();
    const sessionId =
      options?.sessionId ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sess-${Date.now()}`);

    // Anti-Tamper & Clean State: Unconditionally reset prior session data
    this.state = {
      sessionId,
      mode: options?.mode || 'stopwatch',
      isStudying: true,
      isPaused: false,
      startTime: serverNow,
      sessionCreatedAt: serverNow,
      accumulatedSeconds: 0,
      pausedTotalMs: 0,
      lastPausedAt: null,
      sessionVersion: 1,
    };

    return {
      sessionId,
      startTime: serverNow,
      sessionCreatedAt: serverNow,
      accumulatedSeconds: 0,
      version: 1,
    };
  }

  /**
   * Pause the active timer session.
   * Freezes accumulated elapsed time up to this exact server timestamp.
   */
  pauseTimer(options?: { serverNow?: number }): {
    accumulatedSeconds: number;
    version: number;
    lastPausedAt: number;
  } {
    if (!this.state.isStudying || this.state.isPaused) {
      return {
        accumulatedSeconds: this.state.accumulatedSeconds,
        version: this.state.sessionVersion,
        lastPausedAt: this.state.lastPausedAt || 0,
      };
    }

    const serverNow = options?.serverNow ?? getServerNow();
    const elapsed = this.getElapsedSeconds(serverNow);

    this.state.accumulatedSeconds = elapsed;
    this.state.startTime = null;
    this.state.isPaused = true;
    this.state.lastPausedAt = serverNow;
    this.state.sessionVersion += 1;

    return {
      accumulatedSeconds: elapsed,
      version: this.state.sessionVersion,
      lastPausedAt: serverNow,
    };
  }

  /**
   * Resume a paused timer session.
   * Re-anchors current interval start to serverNow and tracks paused interval.
   */
  resumeTimer(options?: { serverNow?: number }): {
    startTime: number;
    accumulatedSeconds: number;
    version: number;
  } {
    if (!this.state.isStudying || !this.state.isPaused) {
      return {
        startTime: this.state.startTime || 0,
        accumulatedSeconds: this.state.accumulatedSeconds,
        version: this.state.sessionVersion,
      };
    }

    const serverNow = options?.serverNow ?? getServerNow();

    if (this.state.lastPausedAt !== null && serverNow > this.state.lastPausedAt) {
      this.state.pausedTotalMs += serverNow - this.state.lastPausedAt;
    }

    this.state.startTime = serverNow;
    this.state.isPaused = false;
    this.state.lastPausedAt = null;
    this.state.sessionVersion += 1;

    return {
      startTime: serverNow,
      accumulatedSeconds: this.state.accumulatedSeconds,
      version: this.state.sessionVersion,
    };
  }

  /**
   * Calculates live elapsed seconds using the single authoritative formula and sanity guard.
   */
  getElapsedSeconds(serverNow?: number): number {
    if (!this.state.isStudying) {
      return 0;
    }

    if (this.state.isPaused) {
      return this.state.accumulatedSeconds;
    }

    const now = serverNow ?? getServerNow();
    const res = computeElapsedSessionSeconds({
      startedAt: this.state.startTime,
      serverNow: now,
      accumulatedMs: this.state.accumulatedSeconds * 1000,
      pausedTotalMs: this.state.pausedTotalMs,
      sessionCreatedAt: this.state.sessionCreatedAt,
      status: 'running',
    });

    return res.elapsedSeconds;
  }

  /**
   * Stop the timer session and return recorded duration.
   */
  stopTimer(options?: { serverNow?: number }): {
    sessionId: string | null;
    durationSeconds: number;
  } {
    const serverNow = options?.serverNow ?? getServerNow();
    const duration = this.getElapsedSeconds(serverNow);
    const completedSessionId = this.state.sessionId;

    // Reset to idle
    this.state = {
      sessionId: null,
      mode: 'stopwatch',
      isStudying: false,
      isPaused: false,
      startTime: null,
      sessionCreatedAt: null,
      accumulatedSeconds: 0,
      pausedTotalMs: 0,
      lastPausedAt: null,
      sessionVersion: 0,
    };

    return {
      sessionId: completedSessionId,
      durationSeconds: duration,
    };
  }

  /**
   * Restores state from remote active_sessions query or push.
   * Rejects stale versions (remote.version < sessionVersion).
   */
  handleRemoteSync(
    remote: ActiveSessionRemote,
    options?: { serverNow?: number }
  ): {
    accepted: boolean;
    reason?: string;
    elapsedSeconds: number;
  } {
    // 1. Version Guard
    if (typeof remote.version === 'number' && remote.version < this.state.sessionVersion) {
      return {
        accepted: false,
        reason: `Remote version ${remote.version} is older than local version ${this.state.sessionVersion}`,
        elapsedSeconds: this.getElapsedSeconds(options?.serverNow),
      };
    }

    const serverNow = options?.serverNow ?? getServerNow();
    const baseAccumulated = Number(remote.accumulated_seconds || 0);

    // Resolve creation anchor
    const remoteCreatedAt = remote.session_created_at || remote.created_at || remote.started_at;
    const createdAtMs = remoteCreatedAt ? new Date(remoteCreatedAt).getTime() : serverNow;

    if (remote.status === 'running') {
      const startedAtMs = remote.started_at ? new Date(remote.started_at).getTime() : serverNow;
      const res = computeElapsedSessionSeconds({
        startedAt: startedAtMs,
        serverNow,
        accumulatedMs: baseAccumulated * 1000,
        sessionCreatedAt: createdAtMs,
        status: 'running',
      });

      this.state = {
        sessionId: remote.session_id,
        mode: remote.mode || 'stopwatch',
        isStudying: true,
        isPaused: false,
        startTime: startedAtMs,
        sessionCreatedAt: createdAtMs,
        accumulatedSeconds: baseAccumulated,
        pausedTotalMs: Math.max(0, startedAtMs - createdAtMs - (baseAccumulated * 1000)),
        lastPausedAt: null,
        sessionVersion: remote.version,
      };

      return {
        accepted: true,
        elapsedSeconds: res.elapsedSeconds,
      };
    } else if (remote.status === 'paused') {
      this.state = {
        sessionId: remote.session_id,
        mode: remote.mode || 'stopwatch',
        isStudying: true,
        isPaused: true,
        startTime: null,
        sessionCreatedAt: createdAtMs,
        accumulatedSeconds: baseAccumulated,
        pausedTotalMs: remote.last_paused_at
          ? Math.max(0, new Date(remote.last_paused_at).getTime() - createdAtMs - (baseAccumulated * 1000))
          : 0,
        lastPausedAt: remote.last_paused_at ? new Date(remote.last_paused_at).getTime() : serverNow,
        sessionVersion: remote.version,
      };

      return {
        accepted: true,
        elapsedSeconds: baseAccumulated,
      };
    } else {
      // Stopped / idle
      this.state = {
        sessionId: null,
        mode: 'stopwatch',
        isStudying: false,
        isPaused: false,
        startTime: null,
        sessionCreatedAt: null,
        accumulatedSeconds: 0,
        pausedTotalMs: 0,
        lastPausedAt: null,
        sessionVersion: remote.version,
      };
      return {
        accepted: true,
        elapsedSeconds: 0,
      };
    }
  }

  /**
   * Reload / Restart serialization: Saves state snapshot to persist across reloads.
   */
  exportSnapshot(): string {
    return JSON.stringify(this.state);
  }

  /**
   * Reload / Restart deserialization: Reconstructs state seamlessly.
   */
  restoreSnapshot(json: string): void {
    try {
      const parsed = JSON.parse(json);
      this.state = { ...this.state, ...parsed };
    } catch {}
  }
}
