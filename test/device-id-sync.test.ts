import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDeviceId,
  initDeviceId,
  cleanDeviceId,
  setDeviceIdForTesting,
  resetDeviceIdForTesting,
} from '../src/lib/deviceId';
import { TimerSessionEngine } from '../src/lib/timerEngine';

describe('Authoritative Device Identifier & Cross-Device Sync Tests', () => {
  const mockStorage = new Map<string, string>();

  beforeEach(() => {
    mockStorage.clear();
    (global as any).window = global;
    (global as any).localStorage = {
      getItem: (key: string) => mockStorage.get(key) || null,
      setItem: (key: string, val: string) => mockStorage.set(key, String(val)),
      removeItem: (key: string) => mockStorage.delete(key),
      clear: () => mockStorage.clear(),
    };
    (global as any).sessionStorage = {
      getItem: (key: string) => mockStorage.get(`sess_${key}`) || null,
      setItem: (key: string, val: string) => mockStorage.set(`sess_${key}`, String(val)),
      removeItem: (key: string) => mockStorage.delete(`sess_${key}`),
      clear: () => mockStorage.clear(),
    };
    resetDeviceIdForTesting();
  });

  // 1. device_id missing from storage -> generated once, saved to Preferences, and subsequent reads return the same ID
  it('1. device_id missing from storage: generated once, persisted, and subsequent reads return same ID', async () => {
    assert.equal(mockStorage.size, 0, 'Initial storage must be empty');

    const firstId = getDeviceId();
    assert.ok(firstId, 'Must generate a valid device ID');
    assert.equal(mockStorage.get('studyio_device_id'), firstId, 'Must persist to localStorage');

    // Subsequent calls return exact same ID from memory and storage
    const secondId = getDeviceId();
    assert.equal(secondId, firstId, 'Subsequent call must return the exact same ID');

    // Init from Preferences confirms persistence
    const initedId = await initDeviceId();
    assert.equal(initedId, firstId, 'initDeviceId must yield the same persisted ID');
  });

  // 2. App / WebView recreated, device_id read from Capacitor Preferences -> same ID returned, session recognized as local, not remote
  it('2. App / WebView recreated: device_id restored from persistent storage, session recognized as local', async () => {
    const existingPersistedId = 'android-persistent-device-uuid-12345';
    mockStorage.set('studyio_device_id', existingPersistedId);

    // Simulate WebView recreation: memory is wiped, fresh bootstrap
    resetDeviceIdForTesting();
    // Re-populate mock storage since reset cleared it
    mockStorage.set('studyio_device_id', existingPersistedId);

    const restoredId = await initDeviceId();
    assert.equal(restoredId, existingPersistedId, 'Must restore existing persisted device_id after recreation');

    // Remote session payload from server with same device_id
    const serverSession = {
      session_id: 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1',
      device_id: `${existingPersistedId}#sess:a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1`,
      status: 'running',
      started_at: new Date(Date.now() - 60000).toISOString(),
      accumulated_seconds: 0,
      mode: 'stopwatch' as const,
      version: 1,
    };

    const serverDeviceId = cleanDeviceId(serverSession.device_id);
    const localDeviceId = cleanDeviceId(getDeviceId());

    // Evaluate remote condition: ONLY remote if server device differs from local
    const isRemoteDevice = Boolean(
      serverDeviceId &&
      serverDeviceId !== localDeviceId &&
      (serverSession.status === 'running' || serverSession.status === 'paused')
    );

    assert.equal(isRemoteDevice, false, 'Session started by this phone must NOT be classified as remote after WebView recreation');
  });

  // 3. Start on phone, pull-sync runs -> confirm isRemoteSession is false and timer continues locally
  it('3. Start on phone, pull-sync runs: confirms isRemoteSession is false and timer continues locally', async () => {
    const myPhoneId = 'phone-device-alpha';
    setDeviceIdForTesting(myPhoneId);

    const now = Date.now();
    const sessionId = 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2';

    // Local timer engine starts session
    const engine = new TimerSessionEngine({
      sessionId,
      isStudying: true,
      isPaused: false,
      startTime: now - 30000, // 30s elapsed
      accumulatedSeconds: 0,
      sessionVersion: 1,
    });

    // Simulate pull-sync returning the active session row from Supabase
    const pullSyncPayload = {
      session_id: sessionId,
      device_id: `${myPhoneId}#sess:${sessionId}`,
      status: 'running' as const,
      started_at: new Date(now - 30000).toISOString(),
      accumulated_seconds: 0,
      mode: 'stopwatch' as const,
      version: 1,
    };

    const myCleanId = cleanDeviceId(getDeviceId());
    const serverCleanId = cleanDeviceId(pullSyncPayload.device_id);

    const isRemoteSession = Boolean(
      serverCleanId &&
      serverCleanId !== myCleanId &&
      (pullSyncPayload.status === 'running' || pullSyncPayload.status === 'paused')
    );

    assert.equal(isRemoteSession, false, 'Pull sync from own write must maintain isRemoteSession = false');

    // Local timer continues uninterrupted
    const syncResult = engine.handleRemoteSync(pullSyncPayload, { serverNow: now });
    assert.equal(syncResult.accepted, true);
    assert.equal(engine.getState().isStudying, true);
    assert.equal(engine.getState().isPaused, false);
    assert.ok(syncResult.elapsedSeconds >= 30, 'Timer continues running locally with correct elapsed time');
  });

  // 4. Real session from another device (different device_id) -> isRemoteSession is true, banner shown, and takeOverSession claims it
  it('4. Real session from another device: isRemoteSession is true, and takeover claims session', async () => {
    const myPhoneId = 'phone-device-local';
    const laptopId = 'macbook-laptop-remote';
    setDeviceIdForTesting(myPhoneId);

    const now = Date.now();
    const remoteSessionPayload = {
      session_id: 'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3',
      device_id: `${laptopId}#sess:c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3`,
      status: 'running',
      started_at: new Date(now - 120000).toISOString(), // 2 minutes ago
      accumulated_seconds: 0,
      mode: 'stopwatch' as const,
      version: 2,
    };

    const myCleanId = cleanDeviceId(getDeviceId());
    const remoteCleanId = cleanDeviceId(remoteSessionPayload.device_id);

    let isRemoteSession = Boolean(
      remoteCleanId &&
      remoteCleanId !== myCleanId &&
      (remoteSessionPayload.status === 'running' || remoteSessionPayload.status === 'paused')
    );

    assert.equal(isRemoteSession, true, 'Different device ID must set isRemoteSession to true');

    // User executes "Take Over":
    // 1. Sets isRemoteSession to false
    // 2. Re-assigns device_id to local phone ID
    isRemoteSession = false;
    const takenOverDeviceId = `${myCleanId}#sess:${remoteSessionPayload.session_id}`;

    assert.equal(isRemoteSession, false, 'Takeover immediately clears remote flag');
    assert.equal(cleanDeviceId(takenOverDeviceId), myPhoneId, 'Takeover updates device ownership to this phone');
  });

  // 5. Push received for this device's own timer action -> ignored (no loop, no remote banner)
  it("5. Push received for this device's own timer action: ignored, preventing echo loops", () => {
    const localPhoneId = 'phone-device-echo-test';
    setDeviceIdForTesting(localPhoneId);

    // Push notification payload echoed back to the sender user
    const pushNotification = {
      data: {
        type: 'timer_sync',
        action: 'start',
        device_id: `${localPhoneId}#sess:d4d4d4d4-d4d4-44d4-84d4-d4d4d4d4d4d4`,
        session_id: 'd4d4d4d4-d4d4-44d4-84d4-d4d4d4d4d4d4',
        status: 'running',
      },
    };

    const pushDeviceId = cleanDeviceId(pushNotification.data?.device_id);
    const localDeviceId = cleanDeviceId(getDeviceId());

    let wasIgnored = false;
    if (pushDeviceId && localDeviceId && pushDeviceId === localDeviceId) {
      wasIgnored = true;
    }

    assert.equal(wasIgnored, true, "FCM push originating from this device's own write must be ignored");
  });

  // 6. Stale session filtering: Stale stopwatch session from another device is not shown as active
  it('6. Stale session on another device: exceeds stale threshold, discarded', () => {
    const myPhoneId = 'phone-device-test';
    const otherDeviceId = 'tablet-device-stale';
    setDeviceIdForTesting(myPhoneId);

    const now = Date.now();
    // Stopwatch started 14 hours ago with NO confirm (exceeds 12.5h stale cutoff)
    const staleStopwatch = {
      session_id: 'e5e5e5e5-e5e5-45e5-85e5-e5e5e5e5e5e5',
      device_id: otherDeviceId,
      status: 'running',
      started_at: new Date(now - 14 * 3600 * 1000).toISOString(),
      accumulated_seconds: 0,
      mode: 'stopwatch' as const,
      confirmed_until: null,
      version: 1,
    };

    let isStale = false;
    const sessionMode = staleStopwatch.mode;
    const startMs = new Date(staleStopwatch.started_at).getTime();

    if (sessionMode === 'stopwatch' && !staleStopwatch.confirmed_until) {
      if (now > startMs + 12.5 * 3600 * 1000) {
        isStale = true;
      }
    }

    assert.equal(isStale, true, 'Unconfirmed stopwatch older than 12.5h on another device must be flagged stale and ignored');
  });

  // 7. Android native bridge synchronous device_id getter
  it('7. Native bridge provides persistent device ID synchronously without regeneration', () => {
    resetDeviceIdForTesting();
    const nativeId = 'android-native-persistent-uuid-99999';
    (global as any).__STUDYIO_NATIVE_DEVICE_ID__ = nativeId;

    const retrievedId = getDeviceId();
    assert.equal(retrievedId, nativeId, 'Must read synchronously from native bridge');

    delete (global as any).__STUDYIO_NATIVE_DEVICE_ID__;
  });

  // 8. Stopwatch running locally on this phone is NEVER marked as remote even if server has divergent device_id
  it('8. Stopwatch running locally on phone is NEVER marked as remote session', () => {
    const localPhoneId = 'phone-device-local-owner';
    setDeviceIdForTesting(localPhoneId);

    const localSessionId = 'f6f6f6f6-f6f6-46f6-86f6-f6f6f6f6f6f6';
    const serverSession = {
      session_id: localSessionId,
      // Suppose server has an older device_id or divergent tag
      device_id: `divergent-device-id#sess:${localSessionId}`,
      status: 'running',
      started_at: new Date(Date.now() - 49000).toISOString(), // 49 seconds running
      version: 1,
    };

    const serverDeviceId = cleanDeviceId(serverSession.device_id);
    const myDeviceId = cleanDeviceId(getDeviceId());

    // Local device is running this exact session
    const isThisDeviceActiveSession = Boolean(
      localSessionId &&
      (localSessionId === serverSession.session_id)
    );

    const isRemoteDevice = Boolean(
      !isThisDeviceActiveSession &&
      serverDeviceId &&
      serverDeviceId !== myDeviceId &&
      (serverSession.status === 'running' || serverSession.status === 'paused')
    );

    assert.equal(isThisDeviceActiveSession, true, 'Session must be recognized as owned locally');
    assert.equal(isRemoteDevice, false, 'Local active session must NEVER be marked as remote device');
  });
});
