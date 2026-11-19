import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNonOverlappingSeconds,
  calculateOverlappingSeconds,
  mergeIntervals,
  sessionToInterval,
} from '../src/lib/nonOverlappingTime';

describe('Anti-Cheat Non-Overlapping Focus Time Engine', () => {
  it('deduplicates 2 hours of concurrent focus time in 1 physical hour to exactly 1 hour', () => {
    // Scenario: User runs timer on Phone and PC from 14:00 to 15:00 (1 hour each)
    const baseDate = new Date('2026-11-19T14:00:00.000Z').getTime();
    const phoneSession = {
      started_at: new Date(baseDate).toISOString(),
      ended_at: new Date(baseDate + 3600 * 1000).toISOString(),
      duration_seconds: 3600,
    };
    const pcSession = {
      started_at: new Date(baseDate).toISOString(),
      ended_at: new Date(baseDate + 3600 * 1000).toISOString(),
      duration_seconds: 3600,
    };

    const totalSeconds = calculateNonOverlappingSeconds([phoneSession, pcSession]);
    assert.equal(
      totalSeconds,
      3600,
      'Two 1-hour sessions logged in the same 1-hour window must yield exactly 3600s (1 hour), not 7200s (2 hours)'
    );
  });

  it('correctly handles partial overlapping sessions (e.g. 14:00-15:00 and 14:30-15:30)', () => {
    const baseDate = new Date('2026-11-19T14:00:00.000Z').getTime();
    const sessionA = {
      started_at: new Date(baseDate).toISOString(),
      ended_at: new Date(baseDate + 3600 * 1000).toISOString(), // 14:00 - 15:00 (60 min)
      duration_seconds: 3600,
    };
    const sessionB = {
      started_at: new Date(baseDate + 1800 * 1000).toISOString(), // 14:30 - 15:30 (60 min)
      ended_at: new Date(baseDate + 5400 * 1000).toISOString(),
      duration_seconds: 3600,
    };

    const totalSeconds = calculateNonOverlappingSeconds([sessionA, sessionB]);
    assert.equal(
      totalSeconds,
      5400,
      'Overlapping 30 minutes must only be counted once: 14:00 to 15:30 is 5400s (1.5h)'
    );
  });

  it('preserves full duration for non-overlapping disjoint sessions without false deductions', () => {
    const morning = new Date('2026-11-19T09:00:00.000Z').getTime();
    const noon = new Date('2026-11-19T12:00:00.000Z').getTime();
    const evening = new Date('2026-11-19T17:00:00.000Z').getTime();

    const sessions = [
      { started_at: new Date(morning).toISOString(), ended_at: new Date(morning + 3600 * 1000).toISOString(), durationSeconds: 3600 },
      { started_at: new Date(noon).toISOString(), ended_at: new Date(noon + 1800 * 1000).toISOString(), durationSeconds: 1800 },
      { started_at: new Date(evening).toISOString(), ended_at: new Date(evening + 7200 * 1000).toISOString(), durationSeconds: 7200 },
    ];

    const total = calculateNonOverlappingSeconds(sessions);
    assert.equal(total, 3600 + 1800 + 7200, 'Non-overlapping sessions must equal the sum (12,600s)');
  });

  it('correctly calculates overlapping seconds between a new session and existing sessions', () => {
    const base = new Date('2026-11-19T10:00:00.000Z').getTime();
    const existing = [
      {
        started_at: new Date(base).toISOString(),
        ended_at: new Date(base + 1800 * 1000).toISOString(), // 10:00 - 10:30 (1800s)
        duration_seconds: 1800,
      },
    ];

    // New session from 10:15 to 10:45 (overlap is 10:15 to 10:30 = 900s)
    const newStart = base + 900 * 1000;
    const newEnd = base + 2700 * 1000;

    const overlap = calculateOverlappingSeconds(newStart, newEnd, existing);
    assert.equal(overlap, 900, 'Overlapping seconds must be 900s (15 minutes)');
  });

  it('handles nested sessions where one session completely encapsulates another', () => {
    const base = new Date('2026-11-19T10:00:00.000Z').getTime();
    const outerSession = {
      started_at: new Date(base).toISOString(),
      ended_at: new Date(base + 7200 * 1000).toISOString(), // 10:00 - 12:00 (2 hours)
      duration_seconds: 7200,
    };
    const innerSession = {
      started_at: new Date(base + 1800 * 1000).toISOString(), // 10:30 - 11:30 (1 hour)
      ended_at: new Date(base + 5400 * 1000).toISOString(),
      duration_seconds: 3600,
    };

    const total = calculateNonOverlappingSeconds([outerSession, innerSession]);
    assert.equal(total, 7200, 'Nested session must not inflate total focus time beyond the 2h window');
  });

  it('gracefully handles empty, null, or malformed session inputs without crashing', () => {
    assert.equal(calculateNonOverlappingSeconds([]), 0);
    assert.equal(calculateNonOverlappingSeconds(null as any), 0);
    assert.equal(calculateNonOverlappingSeconds([{ duration_seconds: 0 }]), 0);
    assert.equal(calculateNonOverlappingSeconds([{ durationSeconds: 600 }]), 600);
  });

  it('guarantees double save retries (e.g. internet lag pressing stop twice) do not double Sector focus time', () => {
    // Exact user scenario: 8m 8s (488s) session clicked twice during network lag
    const now = new Date('2026-11-19T21:40:00.000Z').getTime();
    const session1 = {
      id: 'sess-1',
      subjectName: 'IoT',
      startTime: new Date(now - 488 * 1000).toISOString(),
      endTime: new Date(now).toISOString(),
      durationSeconds: 488,
    };
    const session2 = {
      id: 'sess-2',
      subjectName: 'IoT',
      startTime: new Date(now - 488 * 1000 + 1000).toISOString(), // 1 second later due to retry
      endTime: new Date(now + 1000).toISOString(),
      durationSeconds: 488,
    };

    const sectorSeconds = calculateNonOverlappingSeconds([session1, session2]);
    assert.equal(
      sectorSeconds <= 489,
      true,
      `Duplicate sessions must be merged to ~488s (~8m), not doubled to 976s (16m). Actual: ${sectorSeconds}s`
    );
  });
});
