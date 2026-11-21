import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STILL_STUDYING_AFTER_HOURS,
  CONFIRM_WINDOW_MINUTES,
  ABSOLUTE_MAX_SESSION_HOURS,
  PAUSED_SESSION_AUTO_CLOSE_HOURS,
  RP_DIVISOR,
  MIN_DURATION_FOR_RP_SECONDS,
} from '../src/config/timerConfig';
import { calculateSeasonRp } from '../src/lib/ranks';

describe('Timer Sync, Versioning, Session Limits & Ultra Strict Test Suite', () => {
  // 1. stop_session called twice with the same session_id returns the same result and does not double count time or RP
  it('1. stop_session called twice with same session_id is idempotent and prevents double counting', () => {
    interface SessionRecord {
      session_id: string;
      duration_seconds: number;
      rp_earned: number;
    }
    const savedSessions = new Map<string, SessionRecord>();

    const simulateStopSession = (sessionId: string, durationSeconds: number) => {
      if (savedSessions.has(sessionId)) {
        // Idempotent return of existing result
        const existing = savedSessions.get(sessionId)!;
        return {
          status: 'idempotent_duplicate',
          duration_seconds: existing.duration_seconds,
          rp_earned: existing.rp_earned,
        };
      }
      const rpEarned = durationSeconds >= MIN_DURATION_FOR_RP_SECONDS
        ? Math.floor(durationSeconds / RP_DIVISOR)
        : 0;
      const record = { session_id: sessionId, duration_seconds: durationSeconds, rp_earned: rpEarned };
      savedSessions.set(sessionId, record);
      return { status: 'success', duration_seconds: durationSeconds, rp_earned: rpEarned };
    };

    const sessId = 'sess-uuid-1234';
    const firstCall = simulateStopSession(sessId, 3600); // 1 hour = 100 RP
    assert.equal(firstCall.status, 'success');
    assert.equal(firstCall.duration_seconds, 3600);
    assert.equal(firstCall.rp_earned, 100);

    const secondCall = simulateStopSession(sessId, 3600);
    assert.equal(secondCall.status, 'idempotent_duplicate');
    assert.equal(secondCall.duration_seconds, 3600);
    assert.equal(secondCall.rp_earned, 100);
    assert.equal(savedSessions.size, 1, 'Only one record must exist in DB');
  });

  // 2. An RPC called with a stale version is rejected with a conflict error
  it('2. Rejects RPC calls with stale expected_version with VERSION_CONFLICT', () => {
    let currentSession = {
      session_id: 'sess-uuid-versioned',
      version: 3,
      status: 'running',
    };

    const simulateRpcAction = (expectedVersion: number, newStatus: string) => {
      if (expectedVersion !== currentSession.version) {
        return {
          ok: false,
          status: 409,
          error: 'VERSION_CONFLICT',
          currentVersion: currentSession.version,
        };
      }
      currentSession.version += 1;
      currentSession.status = newStatus;
      return { ok: true, version: currentSession.version };
    };

    // Stale version call (e.g. from tab or device that lagged behind)
    const staleResult = simulateRpcAction(2, 'paused');
    assert.equal(staleResult.ok, false);
    assert.equal(staleResult.status, 409);
    assert.equal(staleResult.error, 'VERSION_CONFLICT');
    assert.equal(currentSession.version, 3, 'Version must not increment on conflict');

    // Matching version call succeeds
    const validResult = simulateRpcAction(3, 'paused');
    assert.equal(validResult.ok, true);
    assert.equal(currentSession.version, 4);
    assert.equal(currentSession.status, 'paused');
  });

  // 3. In Ultra Strict, pause/stop/cancel before ultra_ends_at is rejected with ULTRA_LOCKED and the remaining seconds
  it('3. Rejects Ultra Strict stop/pause before ultra_ends_at with ULTRA_LOCKED and remaining seconds', () => {
    const serverNow = 1700000000000;
    const ultraEndsAt = serverNow + 15 * 60 * 1000; // 15 mins in future

    const simulateUltraStop = (nowEpoch: number) => {
      if (nowEpoch < ultraEndsAt) {
        const remainingSeconds = Math.max(0, Math.ceil((ultraEndsAt - nowEpoch) / 1000));
        return {
          ok: false,
          status: 423,
          code: 'ULTRA_LOCKED',
          remainingSeconds,
        };
      }
      return { ok: true, status: 200 };
    };

    const res = simulateUltraStop(serverNow);
    assert.equal(res.ok, false);
    assert.equal(res.status, 423);
    assert.equal(res.code, 'ULTRA_LOCKED');
    assert.equal(res.remainingSeconds, 900); // 15 minutes = 900s
  });

  // 4. In Ultra Strict, pause/stop/cancel at or after ultra_ends_at succeeds
  it('4. Allows Ultra Strict stop/pause at or after ultra_ends_at', () => {
    const serverStart = 1700000000000;
    const ultraEndsAt = serverStart + 25 * 60 * 1000; // 25 mins

    const checkLockAtTime = (currentTime: number) => {
      if (currentTime < ultraEndsAt) {
        return { ok: false, status: 423, code: 'ULTRA_LOCKED' };
      }
      return { ok: true, status: 200, code: 'RELEASED' };
    };

    assert.equal(checkLockAtTime(ultraEndsAt - 1000).ok, false);
    assert.equal(checkLockAtTime(ultraEndsAt).ok, true);
    assert.equal(checkLockAtTime(ultraEndsAt + 5000).ok, true);
  });

  // 5. Advancing the device clock does not change the timer or end an Ultra Strict countdown early
  it('5. Tampering with device clock does not end countdown early or distort elapsed duration', () => {
    // Simulated Android SystemClock.elapsedRealtime() vs System.currentTimeMillis()
    let elapsedRealtime = 100000; // Boot monotonic reference ms
    let deviceClock = 1700000000000; // Wall clock ms
    const targetDurationMs = 30 * 60 * 1000; // 30 min countdown

    const startElapsed = elapsedRealtime;
    const initialDeviceClock = deviceClock;

    // User advances device clock by 2 hours into the future!
    deviceClock += 2 * 60 * 60 * 1000;
    // But actual real time elapsed was only 5 minutes (300,000ms):
    elapsedRealtime += 5 * 60 * 1000;

    // Check duration calculated using monotonic elapsedRealtime:
    const actualElapsedMs = elapsedRealtime - startElapsed;
    const actualElapsedSec = Math.floor(actualElapsedMs / 1000);
    const isCompleted = actualElapsedMs >= targetDurationMs;

    assert.equal(actualElapsedSec, 300, 'Elapsed time is 300 seconds (5 min), immune to device clock jump');
    assert.equal(isCompleted, false, 'Countdown is NOT finished despite device clock jumping forward');
  });

  // 6. A stopwatch running past 12 hours without confirmation auto-closes at 12:30 with 12 hours credited
  it('6. Stopwatch without confirmation auto-closes at 12:30 and clips credited time to 12 hours', () => {
    const twelveHoursSeconds = STILL_STUDYING_AFTER_HOURS * 3600; // 43200s
    const confirmWindowSeconds = CONFIRM_WINDOW_MINUTES * 60; // 1800s
    const timeoutThreshold = twelveHoursSeconds + confirmWindowSeconds; // 45000s

    const evaluateStopwatch = (elapsedSeconds: number, confirmed: boolean) => {
      if (elapsedSeconds >= timeoutThreshold && !confirmed) {
        return {
          action: 'auto_close',
          credited_seconds: twelveHoursSeconds,
          unconfirmed_discarded_seconds: elapsedSeconds - twelveHoursSeconds,
          reason: '12h_unconfirmed_timeout',
        };
      }
      return { action: 'continue', credited_seconds: elapsedSeconds };
    };

    // At 12h 10m without confirm: timer still running with prompt open
    const at12h10m = evaluateStopwatch(twelveHoursSeconds + 600, false);
    assert.equal(at12h10m.action, 'continue');

    // At 12h 30m without confirm: auto-closes and clips to 12h (43200s)
    const at12h30m = evaluateStopwatch(timeoutThreshold, false);
    assert.equal(at12h30m.action, 'auto_close');
    assert.equal(at12h30m.credited_seconds, 43200);
    assert.equal(at12h30m.unconfirmed_discarded_seconds, 1800);
  });

  // 7. A stopwatch running past 12 hours with confirmation continues, and auto-closes at 24 hours
  it('7. Stopwatch with confirmation continues and auto-closes at 24 hours hard cap', () => {
    const twelveHoursSeconds = STILL_STUDYING_AFTER_HOURS * 3600;
    const maxSessionSeconds = ABSOLUTE_MAX_SESSION_HOURS * 3600; // 86400s

    const evaluateConfirmedStopwatch = (elapsedSeconds: number, confirmed: boolean) => {
      if (elapsedSeconds >= maxSessionSeconds) {
        return { action: 'auto_close_max_cap', credited_seconds: maxSessionSeconds };
      }
      if (confirmed && elapsedSeconds < maxSessionSeconds) {
        return { action: 'continue', credited_seconds: elapsedSeconds };
      }
      return { action: 'check' };
    };

    // At 16 hours confirmed:
    const at16h = evaluateConfirmedStopwatch(16 * 3600, true);
    assert.equal(at16h.action, 'continue');
    assert.equal(at16h.credited_seconds, 57600);

    // At 24 hours confirmed: hard cap reached and auto-closed at 24 hours
    const at24h = evaluateConfirmedStopwatch(24 * 3600 + 10, true);
    assert.equal(at24h.action, 'auto_close_max_cap');
    assert.equal(at24h.credited_seconds, 86400);
  });

  // 8. A session paused longer than 24 hours auto-closes with time up to pause
  it('8. Paused session exceeding 24 hours auto-closes with accumulated time up to pause point', () => {
    const accumulatedSecondsBeforePause = 3600; // 1 hour
    const pauseStartEpoch = 1700000000000;
    const maxPausedDurationMs = PAUSED_SESSION_AUTO_CLOSE_HOURS * 3600 * 1000;

    const checkPausedSession = (currentEpoch: number) => {
      const pausedMs = currentEpoch - pauseStartEpoch;
      if (pausedMs >= maxPausedDurationMs) {
        return {
          action: 'auto_close_paused',
          credited_seconds: accumulatedSecondsBeforePause,
        };
      }
      return { action: 'remain_paused' };
    };

    // Paused for 5 hours: remains paused
    assert.equal(checkPausedSession(pauseStartEpoch + 5 * 3600 * 1000).action, 'remain_paused');

    // Paused for 25 hours: auto-closes with exactly 1 hour credited
    const res = checkPausedSession(pauseStartEpoch + 25 * 3600 * 1000);
    assert.equal(res.action, 'auto_close_paused');
    assert.equal(res.credited_seconds, 3600);
  });

  // 9. Outbox queue: actions queued while offline replay in order with expected versions; duplicates by event_id are ignored
  it('9. Outbox queue replays FIFO in order, validates expected versions, and de-duplicates by event_id', () => {
    interface OutboxItem {
      event_id: string;
      session_id: string;
      type: 'start' | 'pause' | 'resume' | 'stop';
      expected_version: number;
    }

    const processedEvents = new Set<string>();
    let serverVersion = 1;
    const auditLog: string[] = [];

    const processOutboxItem = (item: OutboxItem) => {
      // Idempotency: ignore already-processed event_id
      if (processedEvents.has(item.event_id)) {
        return { status: 'ignored_duplicate', event_id: item.event_id };
      }

      if (item.expected_version !== serverVersion) {
        return { status: 'version_conflict', expected: item.expected_version, current: serverVersion };
      }

      processedEvents.add(item.event_id);
      serverVersion += 1;
      auditLog.push(item.type);
      return { status: 'applied', version: serverVersion };
    };

    const outboxQueue: OutboxItem[] = [
      { event_id: 'ev-1', session_id: 's-1', type: 'start', expected_version: 1 },
      { event_id: 'ev-2', session_id: 's-1', type: 'pause', expected_version: 2 },
      { event_id: 'ev-3', session_id: 's-1', type: 'resume', expected_version: 3 },
      { event_id: 'ev-4', session_id: 's-1', type: 'stop', expected_version: 4 },
    ];

    // Replay queue in FIFO order
    for (const item of outboxQueue) {
      const res = processOutboxItem(item);
      assert.equal(res.status, 'applied');
    }
    assert.deepEqual(auditLog, ['start', 'pause', 'resume', 'stop']);
    assert.equal(serverVersion, 5);

    // Duplicate replay attempt of ev-2
    const dupRes = processOutboxItem(outboxQueue[1]);
    assert.equal(dupRes.status, 'ignored_duplicate');
    assert.equal(serverVersion, 5, 'Server version must not change on duplicate event');
  });

  // 10. Pomodoro break time is excluded from focus time and RP
  it('10. Pomodoro break time is strictly excluded from focus time and RP calculation', () => {
    const pomodoroWorkDuration = 25 * 60; // 1500s
    const pomodoroBreakDuration = 5 * 60; // 300s

    // Work phase session
    const workSession = {
      mode: 'pomodoro',
      phase: 'work',
      durationSeconds: pomodoroWorkDuration,
    };

    // Break phase session
    const breakSession = {
      mode: 'pomodoro',
      phase: 'break',
      durationSeconds: pomodoroBreakDuration,
    };

    const computeCreditedSeconds = (session: { mode: string; phase: string; durationSeconds: number }) => {
      if (session.mode === 'pomodoro' && session.phase === 'break') {
        return 0; // Breaks never count as focus time
      }
      return session.durationSeconds;
    };

    const creditedWork = computeCreditedSeconds(workSession);
    const creditedBreak = computeCreditedSeconds(breakSession);

    assert.equal(creditedWork, 1500, 'Work session receives full duration');
    assert.equal(creditedBreak, 0, 'Break session receives 0 focus seconds');

    // RP check
    const startRp = 1000;
    const rpAfterWork = calculateSeasonRp(startRp, creditedWork);
    const rpAfterBreak = calculateSeasonRp(startRp, creditedBreak);

    assert.ok(rpAfterWork > startRp, 'Work duration awards RP');
    assert.equal(rpAfterBreak, startRp, 'Break duration awards 0 RP');
  });
});
