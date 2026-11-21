import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TimerSessionEngine } from '../src/lib/timerEngine';
import { computeElapsedSessionSeconds, getServerNow } from '../src/lib/serverTime';

describe('Timer Session Recovery, Resume & Remote Sync Resilience Specification', () => {
  it('1. TimerSessionEngine.restoreSession properly initializes running state and preserves elapsed time', () => {
    const engine = new TimerSessionEngine();
    const now = getServerNow();
    const elapsedSeconds = 1500; // 25 minutes
    const startAnchor = now - (elapsedSeconds * 1000);

    engine.restoreSession({
      sessionId: 'test-restored-session-1',
      mode: 'stopwatch',
      isStudying: true,
      isPaused: false,
      accumulatedSeconds: elapsedSeconds,
      startTime: startAnchor,
      sessionCreatedAt: startAnchor,
      serverNow: now,
      version: 2,
    });

    const state = engine.getState();
    assert.equal(state.isStudying, true, 'Engine must be studying');
    assert.equal(state.isPaused, false, 'Engine must not be paused');
    assert.equal(state.accumulatedSeconds, 1500, 'Accumulated seconds must match restored duration');
    assert.equal(state.sessionId, 'test-restored-session-1', 'Session ID must be preserved');

    // Live elapsed seconds should be at least 1500
    const liveElapsed = engine.getElapsedSeconds(now);
    assert.ok(liveElapsed >= 1500, `Live elapsed should be >= 1500, got ${liveElapsed}`);
  });

  it('2. Pausing a restored timer does NOT reset elapsed time to 0', () => {
    const engine = new TimerSessionEngine();
    const now = getServerNow();
    const initialElapsed = 2400; // 40 minutes

    engine.restoreSession({
      sessionId: 'test-restored-session-2',
      mode: 'stopwatch',
      isStudying: true,
      isPaused: false,
      accumulatedSeconds: initialElapsed,
      startTime: now - (initialElapsed * 1000),
      serverNow: now,
      version: 1,
    });

    // Advance 10 seconds and pause
    const pauseTime = now + 10000;
    const pauseResult = engine.pauseTimer({ serverNow: pauseTime });

    assert.ok(pauseResult.accumulatedSeconds >= 2410, `Paused accumulated seconds should be >= 2410, got ${pauseResult.accumulatedSeconds}`);
    assert.equal(engine.getState().isPaused, true, 'Engine must be marked paused');

    // Elapsed seconds while paused must remain at paused total
    const elapsedWhilePaused = engine.getElapsedSeconds(pauseTime + 50000);
    assert.equal(elapsedWhilePaused, pauseResult.accumulatedSeconds, 'Elapsed while paused must not inflate or reset');
  });

  it('3. Resuming a paused timer preserves continuity without resetting to 0', () => {
    const engine = new TimerSessionEngine();
    const start = getServerNow();

    // Start timer and accumulate 600s
    engine.startTimer({ mode: 'stopwatch', serverNow: start });
    const pauseTime = start + 600000;
    const pauseRes = engine.pauseTimer({ serverNow: pauseTime });
    assert.equal(pauseRes.accumulatedSeconds, 600);

    // Resume 5 minutes later
    const resumeTime = pauseTime + 300000;
    const resumeRes = engine.resumeTimer({ serverNow: resumeTime });

    assert.equal(resumeRes.accumulatedSeconds, 600, 'Accumulated seconds before resume must be 600');
    assert.equal(engine.getState().isPaused, false, 'Must be unpaused');

    // 30 seconds after resume
    const checkTime = resumeTime + 30000;
    const liveElapsed = engine.getElapsedSeconds(checkTime);
    assert.equal(liveElapsed, 630, `Total elapsed must be 630s (600 + 30), got ${liveElapsed}`);
  });

  it('4. Virtual start anchor formula (serverNow - accumulated * 1000) maintains interval tick continuity', () => {
    const serverNow = 1700000000000;
    const accumulatedSeconds = 1800; // 30 minutes

    // When resumed, start anchor is:
    const virtualAnchor = serverNow - (accumulatedSeconds * 1000);

    // After 15 seconds:
    const currentTickTime = serverNow + 15000;
    const tickElapsed = Math.floor((currentTickTime - virtualAnchor) / 1000);

    assert.equal(tickElapsed, 1815, `Tick calculation should yield 1815 seconds, got ${tickElapsed}`);
    assert.ok(tickElapsed > 0, 'Tick calculation must never be 0');
  });

  it('5. Null remoteSession does not stop an active local session', () => {
    // Simulate handleRemoteSync decision logic
    let localTimerStopped = false;
    let syncedBackToDb = false;

    const isStudying = true;
    const isRemoteSession = false;

    const simulateHandleRemoteSync = (remoteSession: any) => {
      if (!remoteSession) {
        if (isStudying && !isRemoteSession) {
          // Self-heal: re-sync local state to DB instead of terminating!
          syncedBackToDb = true;
          return;
        }
        if (isRemoteSession) {
          localTimerStopped = true;
        }
        return;
      }
    };

    simulateHandleRemoteSync(null);

    assert.equal(localTimerStopped, false, 'Local timer must NOT be stopped when remoteSession is null');
    assert.equal(syncedBackToDb, true, 'Local active session must trigger re-sync to database');
  });

  it('6. Recovery grace period prevents stale remote stopped rows from killing restored session', () => {
    let localTimerStopped = false;
    const recoveryGraceUntil = Date.now() + 10000; // 10s grace

    const simulateRemoteSyncStopped = (remoteSession: any) => {
      if (remoteSession.status === 'stopped') {
        if (Date.now() < recoveryGraceUntil) {
          // Grace period active - ignore!
          return;
        }
        localTimerStopped = true;
      }
    };

    simulateRemoteSyncStopped({ status: 'stopped', device_id: 'other-device' });

    assert.equal(localTimerStopped, false, 'Stale remote stopped row must be ignored during recovery grace period');
  });

  it('7. Stale same-device stopped echoes are ignored when timer is running locally', () => {
    let localTimerStopped = false;
    const myDeviceId = 'device-123';
    const isStudying = true;
    const isRemoteSession = false;

    const simulateRemoteSyncEcho = (remoteSession: any) => {
      if (remoteSession.status === 'stopped') {
        if (isStudying && !isRemoteSession && remoteSession.device_id === myDeviceId) {
          // Ignore echo of previous stop
          return;
        }
        localTimerStopped = true;
      }
    };

    simulateRemoteSyncEcho({ status: 'stopped', device_id: myDeviceId });

    assert.equal(localTimerStopped, false, 'Same-device stopped echo must not stop the active local timer');
  });
});
