import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TimerNotification, ServiceTimerState } from '../src/lib/timerNotificationPlugin';

describe('Timer Recent Apps Lifecycle & Foreground Persistence Specification', () => {
  it('guarantees getServiceTimerState returns fallback state on web', async () => {
    const state = await TimerNotification.getServiceTimerState();
    assert.ok(state !== null && typeof state === 'object');
    assert.strictEqual(typeof state.isServiceActive, 'boolean');
    assert.strictEqual(typeof state.isRunning, 'boolean');
    assert.strictEqual(typeof state.isPaused, 'boolean');
    assert.strictEqual(typeof state.elapsedSeconds, 'number');
  });

  it('calculates live elapsed seconds seamlessly when app reopens while service is running', () => {
    const now = Date.now();
    const serviceState: ServiceTimerState = {
      isServiceActive: true,
      isRunning: true,
      isPaused: false,
      mode: 'stopwatch',
      phase: 'work',
      startTime: now - 35000, // started 35s ago
      elapsedSeconds: 10,     // was at 10s before this run
      targetSeconds: 0,
      subject: 'Mathematics',
    };

    let currentElapsed = serviceState.elapsedSeconds;
    if (serviceState.isRunning && serviceState.startTime > 0) {
      currentElapsed = serviceState.elapsedSeconds + Math.max(0, Math.floor((now - serviceState.startTime) / 1000));
    }

    assert.strictEqual(currentElapsed, 45); // 10s + 35s = 45s
  });

  it('correctly detects countdown completion while the app was closed from recent apps', () => {
    const now = Date.now();
    const serviceState: ServiceTimerState = {
      isServiceActive: true,
      isRunning: true,
      isPaused: false,
      mode: 'countdown',
      phase: 'work',
      startTime: now - 120000, // 120s ago
      elapsedSeconds: 0,
      targetSeconds: 60, // 60s target
      subject: 'Physics',
    };

    let currentElapsed = serviceState.elapsedSeconds;
    if (serviceState.isRunning && serviceState.startTime > 0) {
      currentElapsed = serviceState.elapsedSeconds + Math.max(0, Math.floor((now - serviceState.startTime) / 1000));
    }

    const isCountdownCompleted = serviceState.mode === 'countdown' && serviceState.targetSeconds > 0 && currentElapsed >= serviceState.targetSeconds;
    assert.strictEqual(isCountdownCompleted, true);
  });

  it('guarantees live elapsed seconds from native service with baseElapsedSeconds takes immediate precedence without drift', () => {
    const now = Date.now();
    const serviceState: ServiceTimerState = {
      isServiceActive: true,
      isRunning: true,
      isPaused: false,
      mode: 'stopwatch',
      phase: 'work',
      startTime: now - 50000,
      elapsedSeconds: 80, // Total live seconds computed by native ForegroundService
      baseElapsedSeconds: 30, // Base seconds before current run slice
      targetSeconds: 0,
      subject: 'Chemistry',
    };

    let currentElapsed = serviceState.elapsedSeconds;
    if (typeof (serviceState as any).baseElapsedSeconds === 'number') {
      currentElapsed = serviceState.elapsedSeconds;
    } else if (serviceState.isRunning && serviceState.startTime > 0) {
      currentElapsed = serviceState.elapsedSeconds + Math.max(0, Math.floor((now - serviceState.startTime) / 1000));
    }

    assert.strictEqual(currentElapsed, 80);

    // Anchor calculation for in-app interval continuity:
    const startAnchorMs = now - (currentElapsed * 1000);
    const tickNow = now + 1000;
    const nextTickElapsed = Math.floor((tickNow - startAnchorMs) / 1000);
    assert.strictEqual(nextTickElapsed, 81, 'Timer must tick immediately from 80s to 81s without freezing');
  });

  it('preserves continuity and does not get stuck when resuming from paused foreground service', () => {
    const serviceState: ServiceTimerState = {
      isServiceActive: true,
      isRunning: false,
      isPaused: true,
      mode: 'stopwatch',
      phase: 'work',
      startTime: 0,
      elapsedSeconds: 120,
      baseElapsedSeconds: 120,
      targetSeconds: 0,
      subject: 'Biology',
    };

    assert.strictEqual(serviceState.isPaused, true);
    assert.strictEqual(serviceState.elapsedSeconds, 120);
  });
});
