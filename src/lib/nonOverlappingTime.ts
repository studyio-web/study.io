/**
 * Anti-Cheat & Multi-Device Time Non-Overlapping Engine
 *
 * Core Guarantee:
 * Physical wall-clock time is absolute. In any given 1-hour real-world window,
 * a user can only study for at most 1 hour.
 *
 * If multiple devices or sessions overlap in time (e.g. 2 hours of logged time in a 1-hour window),
 * overlapping time intervals are strictly merged so that each second of physical time
 * is counted at most once.
 */

export interface TimeInterval {
  startMs: number;
  endMs: number;
}

export interface SessionWithTime {
  started_at?: string | number | Date | null;
  ended_at?: string | number | Date | null;
  startTime?: string | number | Date | null;
  endTime?: string | number | Date | null;
  duration_seconds?: number | null;
  durationSeconds?: number | null;
  credited_seconds?: number | null;
  creditedSeconds?: number | null;
  duration?: number | null;
  seconds?: number | null;
  [key: string]: any;
}

/**
 * Normalizes any session-like object into a clean [startMs, endMs] interval.
 */
export function sessionToInterval(s: SessionWithTime): TimeInterval | null {
  if (!s) return null;

  const rawDuration = Number(
    s.credited_seconds ?? s.creditedSeconds ?? s.durationSeconds ?? s.duration_seconds ?? s.duration ?? s.seconds ?? 0
  );

  const rawStart = s.started_at ?? s.startTime;
  const rawEnd = s.ended_at ?? s.endTime;

  let startMs: number | null = null;
  let endMs: number | null = null;

  if (rawStart) {
    const t = new Date(rawStart).getTime();
    if (!isNaN(t)) startMs = t;
  }

  if (rawEnd) {
    const t = new Date(rawEnd).getTime();
    if (!isNaN(t)) endMs = t;
  }

  if (startMs !== null && endMs !== null) {
    if (endMs < startMs) {
      const tmp = startMs;
      startMs = endMs;
      endMs = tmp;
    }
    // If explicit duration is shorter than endMs - startMs, clamp start to end - duration
    if (rawDuration > 0 && rawDuration * 1000 < endMs - startMs) {
      startMs = endMs - rawDuration * 1000;
    }
    return { startMs, endMs };
  } else if (endMs !== null && rawDuration > 0) {
    return { startMs: endMs - rawDuration * 1000, endMs };
  } else if (startMs !== null && rawDuration > 0) {
    return { startMs, endMs: startMs + rawDuration * 1000 };
  }

  return null;
}

/**
 * Merges a list of arbitrary time intervals into disjoint, non-overlapping intervals.
 */
export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length <= 1) return intervals;

  // Filter out invalid or zero-length intervals
  const valid = intervals.filter((i) => i && i.endMs > i.startMs);
  if (valid.length <= 1) return valid;

  // Sort by start time ascending
  valid.sort((a, b) => a.startMs - b.startMs);

  const merged: TimeInterval[] = [{ startMs: valid[0].startMs, endMs: valid[0].endMs }];

  for (let i = 1; i < valid.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = valid[i];

    if (curr.startMs <= prev.endMs) {
      // Overlapping or contiguous: extend previous interval end
      prev.endMs = Math.max(prev.endMs, curr.endMs);
    } else {
      merged.push({ startMs: curr.startMs, endMs: curr.endMs });
    }
  }

  return merged;
}

/**
 * Computes the total non-overlapping focus time in seconds from an array of sessions.
 * Overlapping seconds between multiple devices or sessions are merged and counted only once.
 */
export function calculateNonOverlappingSeconds(sessions: SessionWithTime[]): number {
  if (!sessions || sessions.length === 0) return 0;

  const intervals: TimeInterval[] = [];
  let unanchoredDurationSeconds = 0;

  for (const s of sessions) {
    const interval = sessionToInterval(s);
    if (interval) {
      intervals.push(interval);
    } else {
      // Fallback for sessions with no start/end timestamps
      unanchoredDurationSeconds += Math.max(
        0,
        Number(s?.credited_seconds ?? s?.creditedSeconds ?? s?.durationSeconds ?? s?.duration_seconds ?? s?.duration ?? s?.seconds ?? 0)
      );
    }
  }

  const merged = mergeIntervals(intervals);
  const totalMergedMs = merged.reduce((acc, curr) => acc + (curr.endMs - curr.startMs), 0);
  const nonOverlappingSeconds = Math.floor(totalMergedMs / 1000);

  return nonOverlappingSeconds + unanchoredDurationSeconds;
}

/**
 * Computes how many seconds of a proposed [startMs, endMs] interval overlap
 * with a set of existing sessions.
 */
export function calculateOverlappingSeconds(
  startMs: number,
  endMs: number,
  existingSessions: SessionWithTime[]
): number {
  if (endMs <= startMs || !existingSessions || existingSessions.length === 0) return 0;

  const candidateOverlapIntervals: TimeInterval[] = [];

  for (const s of existingSessions) {
    const interval = sessionToInterval(s);
    if (!interval) continue;

    const overlapStart = Math.max(startMs, interval.startMs);
    const overlapEnd = Math.min(endMs, interval.endMs);

    if (overlapEnd > overlapStart) {
      candidateOverlapIntervals.push({ startMs: overlapStart, endMs: overlapEnd });
    }
  }

  if (candidateOverlapIntervals.length === 0) return 0;

  const merged = mergeIntervals(candidateOverlapIntervals);
  const totalOverlapMs = merged.reduce((acc, curr) => acc + (curr.endMs - curr.startMs), 0);
  return Math.floor(totalOverlapMs / 1000);
}
