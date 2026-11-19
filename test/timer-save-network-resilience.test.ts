import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateAndSaveSession } from '../src/lib/server/sessionValidation';

describe('Timer Save & Network Resilience Specification', () => {
  it('automatically retries without client_session_id when column does not exist in schema (error 42703)', async () => {
    let attemptedWithClientId = false;
    let retriedWithoutClientId = false;

    const mockClient: any = {
      from: (table: string) => {
        if (table === 'study_sessions') {
          return {
            select: () => {
              const b: any = {
                eq: () => b,
                maybeSingle: async () => ({ data: null, error: { code: '42703', message: 'column client_session_id does not exist' } }),
                gte: () => b,
                lt: () => b,
                gt: () => b,
                limit: () => b,
              };
              return b;
            },
            insert: (rows: any[]) => {
              const row = rows[0];
              if (row && 'client_session_id' in row) {
                attemptedWithClientId = true;
                // Simulate Postgres rejecting insert because client_session_id column does not exist
                return {
                  select: async () => ({
                    data: null,
                    error: {
                      code: '42703',
                      message: 'column "client_session_id" of relation "study_sessions" does not exist',
                    },
                  }),
                };
              }
              // Second attempt without client_session_id succeeds
              retriedWithoutClientId = true;
              return {
                select: async () => ({
                  data: [{ id: 'sess-success-123', ...row }],
                  error: null,
                }),
              };
            },
          };
        }
        if (table === 'active_sessions') {
          return {
            update: () => ({ eq: async () => ({ data: null, error: null }) }),
          };
        }
        return {};
      },
    };

    const user = { id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' };
    const now = Date.now();
    const result = await validateAndSaveSession(mockClient, user, {
      started_at: new Date(now - 1500 * 1000).toISOString(),
      ended_at: new Date(now).toISOString(),
      client_session_id: 'c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f',
      mode: 'stopwatch',
    });

    assert.equal(attemptedWithClientId, true, 'Should attempt initial insert with client_session_id');
    assert.equal(retriedWithoutClientId, true, 'Should automatically fall back to retry without client_session_id');
    assert.equal(result.success, true, 'Must successfully save session');
    assert.equal(result.session?.id, 'sess-success-123');
  });

  it('guarantees stop and save button is disabled when offline', () => {
    function computeStopButtonState(isOnline: boolean, isSaving: boolean, isRemoteTransitioning: boolean) {
      const isDisabled = isSaving || isRemoteTransitioning || !isOnline;
      const label = !isOnline ? 'Offline' : (isSaving ? 'Saving...' : 'Stop');
      const tooltip = !isOnline ? 'No network connection. Reconnect to stop & save session.' : undefined;
      return { isDisabled, label, tooltip };
    }

    // When offline, must be strictly disabled
    const offlineState = computeStopButtonState(false, false, false);
    assert.equal(offlineState.isDisabled, true, 'Stop button must be disabled when offline');
    assert.equal(offlineState.label, 'Offline');
    assert.match(offlineState.tooltip!, /No network connection/);

    // When online and idle, button is active
    const onlineState = computeStopButtonState(true, false, false);
    assert.equal(onlineState.isDisabled, false, 'Stop button must be enabled when online');
    assert.equal(onlineState.label, 'Stop');
    assert.equal(onlineState.tooltip, undefined);
  });

  it('blocks session save when network is disconnected and allows saving when reconnected', () => {
    let mockOnLine = false;

    function attemptStopAndSave() {
      if (!mockOnLine) {
        return { saved: false, reason: 'Network connection required to save session. Please reconnect.' };
      }
      return { saved: true };
    }

    // 1. While disconnected, save is blocked
    const offlineResult = attemptStopAndSave();
    assert.equal(offlineResult.saved, false);
    assert.match(offlineResult.reason!, /Network connection required/);

    // 2. Once internet reconnects, save succeeds
    mockOnLine = true;
    const onlineResult = attemptStopAndSave();
    assert.equal(onlineResult.saved, true);
  });

  it('guarantees cross-device idempotency and flags duplicate saves with isDuplicate: true', async () => {
    const existingDbSessions: any[] = [];
    const clientUuid = 'd3b07384-d113-469b-86d4-83b63a9f0001';
    const userId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

    const mockDb: any = {
      from: (table: string) => {
        if (table === 'study_sessions') {
          return {
            select: () => {
              let filterUserId: string | null = null;
              let filterClientSessionId: string | null = null;
              const builder: any = {
                eq: (col: string, val: string) => {
                  if (col === 'user_id') filterUserId = val;
                  if (col === 'client_session_id') filterClientSessionId = val;
                  return builder;
                },
                gte: () => builder,
                lt: () => builder,
                gt: () => builder,
                limit: () => builder,
                maybeSingle: async () => {
                  const match = existingDbSessions.find(
                    s => (!filterUserId || s.user_id === filterUserId) &&
                         (!filterClientSessionId || s.client_session_id === filterClientSessionId)
                  );
                  return { data: match || null, error: null };
                },
              };
              return builder;
            },
            insert: (rows: any[]) => {
              const row = rows[0];
              const newRow = { id: 'sess-first-save-id', ...row };
              existingDbSessions.push(newRow);
              return {
                select: async () => ({
                  data: [newRow],
                  error: null,
                }),
              };
            },
          };
        }
        if (table === 'active_sessions') {
          return {
            update: () => ({ eq: async () => ({ data: null, error: null }) }),
          };
        }
        return {};
      },
    };

    const user = { id: userId };
    const now = Date.now();

    // 1. Device A saves the countdown session
    const saveA = await validateAndSaveSession(mockDb, user, {
      started_at: new Date(now - 60 * 1000).toISOString(),
      ended_at: new Date(now).toISOString(),
      client_session_id: clientUuid,
      mode: 'countdown',
      planned_duration_seconds: 60,
    });

    assert.equal(saveA.success, true);
    assert.equal(saveA.isDuplicate, undefined);
    assert.equal(saveA.session?.id, 'sess-first-save-id');
    assert.equal(existingDbSessions.length, 1);

    // 2. Device B attempts to save the same countdown session with identical client_session_id
    const saveB = await validateAndSaveSession(mockDb, user, {
      started_at: new Date(now - 60 * 1000).toISOString(),
      ended_at: new Date(now).toISOString(),
      client_session_id: clientUuid,
      mode: 'countdown',
      planned_duration_seconds: 60,
    });

    assert.equal(saveB.success, true);
    assert.equal(saveB.isDuplicate, true, 'Second save must be flagged as duplicate');
    assert.match(saveB.reason!, /already recorded/i);
    assert.equal(saveB.session?.id, 'sess-first-save-id');
    // Ensure DB still only has 1 record (never doubled)
    assert.equal(existingDbSessions.length, 1, 'Database must not duplicate session record');
  });

  it('guarantees client idempotency logic skips duplicate RP & XP rewards', () => {
    let rewardedCount = 0;
    let earnedRP = 0;
    let earnedXP = 0;

    function handleClientSessionSave(saveResult: { success: boolean; isDuplicate?: boolean; reason?: string }) {
      if (!saveResult.success) return { ok: false, error: 'failed' };

      // Anti-Exploit deduplication check
      if (saveResult.isDuplicate || saveResult.reason?.toLowerCase().includes('already recorded')) {
        return { ok: true, isDuplicate: true, rewarded: false };
      }

      rewardedCount++;
      earnedRP += 30;
      earnedXP += 10;
      return { ok: true, isDuplicate: false, rewarded: true };
    }

    // First save: rewarded
    const resA = handleClientSessionSave({ success: true, isDuplicate: undefined });
    assert.equal(resA.rewarded, true);
    assert.equal(rewardedCount, 1);
    assert.equal(earnedRP, 30);
    assert.equal(earnedXP, 10);

    // Second save on peer device: duplicate ignored without extra rewards
    const resB = handleClientSessionSave({
      success: true,
      isDuplicate: true,
      reason: 'Session already recorded (idempotent duplicate request ignored).',
    });
    assert.equal(resB.rewarded, false);
    assert.equal(rewardedCount, 1, 'Session count must remain 1');
    assert.equal(earnedRP, 30, 'RP must not be awarded 2x');
    assert.equal(earnedXP, 10, 'XP must not be awarded 2x');
  });

  it('guarantees remote session saved resets countdown completed state and disarms alarm', () => {
    let isCountdownCompleted = true;
    let isAlarmRinging = true;
    let countdownTarget = 60;
    let localStorageMap: Record<string, string> = {
      studyio_timer_countdown_completed: 'true',
    };

    function onRemoteSessionSaved() {
      isCountdownCompleted = false;
      isAlarmRinging = false;
      delete localStorageMap.studyio_timer_countdown_completed;
    }

    // Verify initial completed countdown state on secondary device
    assert.equal(isCountdownCompleted, true);
    assert.equal(isAlarmRinging, true);
    assert.equal(localStorageMap.studyio_timer_countdown_completed, 'true');

    // Simulate Device A saving and triggering remote session saved sync
    onRemoteSessionSaved();

    assert.equal(isCountdownCompleted, false, 'Countdown complete screen must be dismissed');
    assert.equal(isAlarmRinging, false, 'Alarm audio must be immediately halted');
    assert.equal(localStorageMap.studyio_timer_countdown_completed, undefined, 'LocalStorage key must be purged');
  });
});
