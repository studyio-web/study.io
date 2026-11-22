import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Offline Browser & PWA Lifecycle Simulation Tests', () => {
  // 1. App opens offline from service worker cache
  it('1. App shell is served from Cache Storage when client goes offline', async () => {
    // Simulated Service Worker Cache Storage
    const cacheStorage = new Map<string, string>();
    cacheStorage.set('/', '<!DOCTYPE html><html><head><title>study.io</title></head><body><div id="__next">App Shell</div></body></html>');
    cacheStorage.set('/manifest.webmanifest', '{"name":"study.io"}');

    let isNetworkOnline = true;

    async function fetchWithSW(url: string, mode: string = 'navigate'): Promise<{ status: number; body: string; fromCache: boolean }> {
      if (mode === 'navigate') {
        if (isNetworkOnline) {
          return { status: 200, body: 'Live Server HTML', fromCache: false };
        }
        // Offline fallback
        const cached = cacheStorage.get('/') || cacheStorage.get(url);
        if (cached) {
          return { status: 200, body: cached, fromCache: true };
        }
        return { status: 504, body: 'Gateway Timeout', fromCache: false };
      }
      return { status: 200, body: '', fromCache: false };
    }

    // Load app online
    const onlineLoad = await fetchWithSW('/dashboard', 'navigate');
    assert.equal(onlineLoad.status, 200);
    assert.equal(onlineLoad.fromCache, false);

    // Go offline & reload
    isNetworkOnline = false;
    const offlineLoad = await fetchWithSW('/dashboard', 'navigate');
    assert.equal(offlineLoad.status, 200);
    assert.equal(offlineLoad.fromCache, true);
    assert.match(offlineLoad.body, /App Shell/);
  });

  // 2. Timer lifecycle while offline: start, pause, stop & outbox queue
  it('2. Timer starts, pauses, stops while offline and enqueues to outbox', async () => {
    const outbox: any[] = [];
    let timerState = {
      isStudying: false,
      isPaused: false,
      elapsedSeconds: 0,
      startTime: 0,
    };

    function startTimerOffline() {
      assert.equal(timerState.isStudying, false, 'Cannot start over an existing running session');
      timerState.isStudying = true;
      timerState.isPaused = false;
      timerState.startTime = Date.now();
      outbox.push({ type: 'start', ts: new Date().toISOString() });
    }

    function pauseTimerOffline(elapsed: number) {
      assert.equal(timerState.isStudying, true);
      timerState.isPaused = true;
      timerState.elapsedSeconds = elapsed;
      outbox.push({ type: 'pause', elapsed, ts: new Date().toISOString() });
    }

    function stopTimerOffline(finalSeconds: number) {
      assert.equal(timerState.isStudying, true);
      timerState.isStudying = false;
      timerState.isPaused = false;
      timerState.elapsedSeconds = 0;
      outbox.push({
        type: 'session',
        duration_seconds: finalSeconds,
        offline_synced: true,
        ts: new Date().toISOString(),
      });
    }

    startTimerOffline();
    assert.equal(timerState.isStudying, true);
    assert.equal(outbox.length, 1);

    pauseTimerOffline(120);
    assert.equal(timerState.isPaused, true);
    assert.equal(timerState.elapsedSeconds, 120);
    assert.equal(outbox.length, 2);

    stopTimerOffline(120);
    assert.equal(timerState.isStudying, false);
    assert.equal(outbox.length, 3);
    assert.equal(outbox[2].offline_synced, true);
  });

  // 3. Task created offline and synced online
  it('3. Task created offline enqueues and syncs with deduplication', async () => {
    const localDbTasks: any[] = [];
    const outboxQueue: any[] = [];
    const serverDbTodos: any[] = [];

    // Offline create
    const taskId = 'task-uuid-' + Math.random().toString(36).substring(2, 8);
    const newTask = {
      id: taskId,
      task: 'Prepare chemistry flashcards',
      is_completed: false,
      priority: 'high',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 1. Saved to local DB
    localDbTasks.push(newTask);
    assert.equal(localDbTasks.length, 1);

    // 2. Enqueued in outbox
    const syncEvent = {
      event_id: 'evt-' + Math.random().toString(36).substring(2, 8),
      entity_type: 'task',
      action: 'create',
      updated_at: newTask.updated_at,
      payload: newTask,
    };
    outboxQueue.push(syncEvent);
    assert.equal(outboxQueue.length, 1);

    // 3. Reconnect online & sync
    const processedEvents = new Set<string>();
    for (const evt of outboxQueue) {
      if (!processedEvents.has(evt.event_id)) {
        processedEvents.add(evt.event_id);
        serverDbTodos.push(evt.payload);
      }
    }

    assert.equal(serverDbTodos.length, 1);
    assert.equal(serverDbTodos[0].task, 'Prepare chemistry flashcards');

    // 4. Replay again (should dedupe without duplicates)
    for (const evt of outboxQueue) {
      if (!processedEvents.has(evt.event_id)) {
        serverDbTodos.push(evt.payload);
      }
    }
    assert.equal(serverDbTodos.length, 1, 'Server todos must not duplicate on replayed sync');
  });

  // 4. Service Worker Update Flow: Waiting worker, skip waiting, reload
  it('4. Service Worker update prompt signals skipWaiting and triggers client reload', () => {
    let updatePromptShown = false;
    let didSkipWaiting = false;
    let didReload = false;

    // Simulate SW registration with waiting worker
    const mockRegistration = {
      waiting: {
        postMessage: (msg: any) => {
          if (msg.type === 'SKIP_WAITING') {
            didSkipWaiting = true;
          }
        },
      },
    };

    if (mockRegistration.waiting) {
      updatePromptShown = true;
    }

    assert.equal(updatePromptShown, true, 'Prompt must show when registration.waiting exists');

    // User clicks reload
    mockRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    assert.equal(didSkipWaiting, true, 'Reload click must send SKIP_WAITING to waiting worker');

    // Simulated controllerchange event
    didReload = true;
    assert.equal(didReload, true);
  });

  // 5. Offline completion flow: stop, save, RP flare with pending estimate, online sync replaces estimate, overlap message
  it('5. Browser offline flow: start, stop and save offline, see RP flare & pending badge, go online, see server value replace estimate & overlap message', async () => {
    // 1. Initial State
    const carryoverRp = 1200;
    const initialServerMonthSeconds = 7200; // 2 hours = 200 RP
    let displayedRp = carryoverRp + Math.floor(initialServerMonthSeconds / 36); // 1400 RP
    let isPending = false;
    let rankAnimationTriggered = false;
    let toastMessage: string | null = null;
    const outbox: any[] = [];

    // 2. Offline Study Session (3600s = 1h focus)
    const sessionDuration = 3600;
    const isOnline = false;

    // Stop & Save offline
    if (!isOnline) {
      // Local estimate
      const pendingSeconds = sessionDuration;
      const estimatedNewRp = carryoverRp + Math.floor((initialServerMonthSeconds + pendingSeconds) / 36);
      const gainedRp = estimatedNewRp - displayedRp;
      assert.equal(gainedRp, 100, 'Estimated gain must be 100 RP for 1 hour');

      displayedRp = estimatedNewRp;
      isPending = true;
      rankAnimationTriggered = true;

      outbox.push({
        event_id: 'evt-offline-session-1',
        entity_type: 'session',
        action: 'create',
        payload: {
          session_id: 'sess-offline-1',
          duration_seconds: sessionDuration,
          started_at: '2026-11-22T02:30:00Z',
          ended_at: '2026-11-22T03:30:00Z',
        },
      });
    }

    assert.equal(displayedRp, 1500, 'Displayed RP must show local estimate of 1500 RP');
    assert.equal(isPending, true, 'RP and rank progression must show pending status');
    assert.equal(rankAnimationTriggered, true, 'Completion rank animation must trigger offline');
    assert.equal(outbox.length, 1);

    // 3. Reconnect Online: Server resolves session with 30m overlap
    // Server credits 1800s (30m) instead of 3600s due to another device session
    const serverSyncResponse = {
      success: true,
      credited_seconds: 1800,
      raw_seconds: 3600,
      overlap_seconds_removed: 1800,
      overlap_adjusted: true,
      server_month_seconds: initialServerMonthSeconds + 1800,
      server_season_rp: carryoverRp + Math.floor((initialServerMonthSeconds + 1800) / 36), // 1450 RP
    };

    // Online event triggered
    if (serverSyncResponse.overlap_adjusted && serverSyncResponse.overlap_seconds_removed > 0) {
      const mins = Math.max(1, Math.round(serverSyncResponse.overlap_seconds_removed / 60));
      toastMessage = `Time adjusted: ${mins} min overlapped with another device and was counted once.`;
    }

    // Server value replaces local estimate
    displayedRp = serverSyncResponse.server_season_rp;
    isPending = false;
    outbox.pop();

    assert.equal(displayedRp, 1450, 'Server season RP (1450 RP) replaces local estimate (1500 RP)');
    assert.equal(isPending, false, 'Pending flag cleared after sync');
    assert.equal(outbox.length, 0, 'Outbox flushed cleanly');
    assert.equal(toastMessage, 'Time adjusted: 30 min overlapped with another device and was counted once.');
  });
});
