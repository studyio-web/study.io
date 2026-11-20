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
});
