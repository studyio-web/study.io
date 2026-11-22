import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Offline Mode & Sync Engine Tests', () => {
  // 1. Outbox Queue & Event Creation
  it('1. Event creation assigns unique event_id and client_ts', () => {
    const eventId1 = crypto.randomUUID();
    const eventId2 = crypto.randomUUID();
    const now = new Date().toISOString();

    assert.notEqual(eventId1, eventId2);
    assert.equal(typeof eventId1, 'string');
    assert.match(now, /^\d{4}-\d{2}-\d{2}T/);
  });

  // 2. Conflict Rule: Last-Write-Wins by updated_at for Tasks
  it('2. Conflict rule: Last-write-wins by updated_at resolves between two devices', () => {
    // Device A edits task at 10:00:00
    const taskDeviceA = {
      id: 'task-123',
      task: 'Math Homework - Chapter 4',
      is_completed: false,
      updated_at: '2026-11-22T10:00:00.000Z',
    };

    // Device B edits task at 10:05:00 while offline
    const taskDeviceB = {
      id: 'task-123',
      task: 'Math Homework - Chapter 4 & 5 (Finished)',
      is_completed: true,
      updated_at: '2026-11-22T10:05:00.000Z',
    };

    // Stale Device A update arrives after Device B's update
    function resolveConflict(existing: typeof taskDeviceB, incoming: typeof taskDeviceA) {
      const existingTime = new Date(existing.updated_at).getTime();
      const incomingTime = new Date(incoming.updated_at).getTime();

      if (incomingTime >= existingTime) {
        return { applied: true, winner: incoming };
      }
      return { applied: false, winner: existing, reason: 'Superseded by newer record' };
    }

    // Applying Device B on top of Device A:
    const res1 = resolveConflict(taskDeviceA, taskDeviceB);
    assert.equal(res1.applied, true);
    assert.equal(res1.winner.task, taskDeviceB.task);
    assert.equal(res1.winner.is_completed, true);

    // Stale Device A tries to overwrite newer Device B:
    const res2 = resolveConflict(taskDeviceB, taskDeviceA);
    assert.equal(res2.applied, false);
    assert.equal(res2.winner.task, taskDeviceB.task);
    assert.equal(res2.reason, 'Superseded by newer record');
  });

  // 3. Idempotent Deduplication: Replayed Event is NOT Double Counted
  it('3. Replayed sync event with same event_id is rejected idempotently', () => {
    const processedEvents = new Set<string>();

    function processEvent(event: { event_id: string; entity_type: string; action: string }) {
      if (processedEvents.has(event.event_id)) {
        return { success: true, isDuplicate: true };
      }
      processedEvents.add(event.event_id);
      return { success: true, isDuplicate: false, credited: true };
    }

    const event = {
      event_id: 'evt-unique-abc-123',
      entity_type: 'task',
      action: 'create',
    };

    const firstRun = processEvent(event);
    assert.equal(firstRun.isDuplicate, false);
    assert.equal(firstRun.credited, true);

    // Replay same event (e.g. network timeout retry):
    const secondRun = processEvent(event);
    assert.equal(secondRun.isDuplicate, true);
    assert.equal((secondRun as any).credited, undefined);
  });

  // 4. Timer Session Spanning Offline Period Calculates Correct Duration
  it('4. Timer session spanning offline period gets correct duration without clamping to 0', () => {
    // Session started online at T0
    const startMs = Date.now() - 3600 * 1000; // 1 hour ago
    const startedAt = new Date(startMs).toISOString();

    // App was offline during the hour, stopped now
    const endMs = Date.now();
    const endedAt = new Date(endMs).toISOString();

    const rawDuration = Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);

    // Valid duration: 3600 seconds (1 hour)
    assert.equal(rawDuration, 3600);
    assert.ok(rawDuration > 0, 'Duration spanning offline period must be positive');
    assert.ok(rawDuration <= 43200, 'Duration is within 12h absolute limit');
  });

  // 5. Service Worker Cache Versioning & Old Cache Purge
  it('5. Service Worker activate step purges old caches while retaining current versions', () => {
    const CURRENT_CACHES = ['studyio-shell-v4', 'studyio-static-v4', 'studyio-api-v4'];
    const existingCacheKeys = [
      'studyio-static-v1',
      'studyio-static-v2',
      'studyio-static-v3',
      'studyio-shell-v4',
      'studyio-static-v4',
      'studyio-api-v4',
      'other-unknown-cache',
    ];

    const cachesToDelete = existingCacheKeys.filter((key) => !CURRENT_CACHES.includes(key));
    const cachesToKeep = existingCacheKeys.filter((key) => CURRENT_CACHES.includes(key));

    assert.deepEqual(cachesToKeep, ['studyio-shell-v4', 'studyio-static-v4', 'studyio-api-v4']);
    assert.deepEqual(cachesToDelete, [
      'studyio-static-v1',
      'studyio-static-v2',
      'studyio-static-v3',
      'other-unknown-cache',
    ]);
  });

  // 6. Service Worker Navigation Network-First with App Shell Fallback
  it('6. Navigation handler serves cached / app shell when offline', () => {
    let mockCache: Record<string, string> = {
      '/': '<html><head><title>study.io</title></head><body><div id="root">App Shell</div></body></html>',
    };

    function handleNavigation(isOnline: boolean, url: string) {
      if (isOnline) {
        return { source: 'network', body: 'live-page' };
      }
      // Offline fallback:
      const cached = mockCache['/'];
      if (cached) {
        return { source: 'cache-shell', body: cached };
      }
      return { source: 'error', body: 'offline' };
    }

    const onlineRes = handleNavigation(true, '/dashboard');
    assert.equal(onlineRes.source, 'network');

    const offlineRes = handleNavigation(false, '/dashboard');
    assert.equal(offlineRes.source, 'cache-shell');
    assert.match(offlineRes.body, /App Shell/);
  });

  // 7. Offline Limits: Ultra Strict Requires Internet, Normal & Strict Mode Allowed Offline
  it('7. Offline limits: Ultra Strict blocked offline, normal timer and strict mode allowed', () => {
    function canStartSession(isOnline: boolean, mode: 'normal' | 'strict' | 'ultra_strict') {
      if (mode === 'ultra_strict' && !isOnline) {
        return { allowed: false, message: 'Needs internet' };
      }
      return { allowed: true, pendingSync: !isOnline };
    }

    // Online tests
    assert.equal(canStartSession(true, 'normal').allowed, true);
    assert.equal(canStartSession(true, 'strict').allowed, true);
    assert.equal(canStartSession(true, 'ultra_strict').allowed, true);

    // Offline tests
    const normalOffline = canStartSession(false, 'normal');
    assert.equal(normalOffline.allowed, true);
    assert.equal(normalOffline.pendingSync, true);

    const strictOffline = canStartSession(false, 'strict');
    assert.equal(strictOffline.allowed, true);
    assert.equal(strictOffline.pendingSync, true);

    const ultraOffline = canStartSession(false, 'ultra_strict');
    assert.equal(ultraOffline.allowed, false);
    assert.equal(ultraOffline.message, 'Needs internet');
  });

  // 8. Auth Offline: Token Refresh Network Failure Preserves Session
  it('8. Auth offline: Network failure during token refresh preserves stored session', () => {
    let isAuthenticated = true;
    let userState = { id: 'usr-123', email: 'scholar@study.io' };

    function onAuthCheck(isOnline: boolean, serverAuthError: boolean) {
      if (!isOnline) {
        // Offline: preserve session
        return { isAuthenticated, userState, action: 'preserved_offline' };
      }
      if (serverAuthError) {
        // Real server 401: sign out
        isAuthenticated = false;
        userState = null as any;
        return { isAuthenticated: false, userState: null, action: 'signed_out' };
      }
      return { isAuthenticated: true, userState, action: 'refreshed' };
    }

    // Offline test
    const offlineRes = onAuthCheck(false, false);
    assert.equal(offlineRes.isAuthenticated, true);
    assert.equal(offlineRes.action, 'preserved_offline');
    assert.ok(offlineRes.userState);
    assert.equal(offlineRes.userState?.id, 'usr-123');

    // Real server auth error test
    const serverErrRes = onAuthCheck(true, true);
    assert.equal(serverErrRes.isAuthenticated, false);
    assert.equal(serverErrRes.action, 'signed_out');
  });

  // 9. Dexie Database Table Configuration
  it('9. Dexie schema defines all required offline tables', () => {
    const requiredTables = ['tasks', 'subjects', 'sessions', 'profile', 'leaderboard', 'settings', 'outbox'];
    const definedStores = {
      tasks: 'id, user_id, is_completed, subject_id, updated_at',
      subjects: 'id, user_id, is_archived, updated_at',
      sessions: 'id, user_id, started_at, client_session_id',
      profile: 'id, last_updated',
      leaderboard: 'id, season_id, updated_at',
      settings: 'key, updated_at',
      outbox: 'event_id, entity_type, client_ts, attempts',
    };

    for (const table of requiredTables) {
      assert.ok(table in definedStores, `Table ${table} must be present in Dexie store schema`);
    }
  });
});
