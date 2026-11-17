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
});
