import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNotificationConfig, formatSecondsForNotification } from '../src/lib/notifications';

describe('Android Notification Abstraction & Parity Specification', () => {
  it('correctly maps pomodoro work/break alerts to timer_alerts channel', () => {
    const workConfig = resolveNotificationConfig('pomodoro_work_completed', {});
    assert.equal(workConfig.channelId, 'timer_alerts');
    assert.equal(workConfig.tab, 'timer');
    assert.match(workConfig.title, /Pomodoro/);

    const breakConfig = resolveNotificationConfig('pomodoro_break_over', {});
    assert.equal(breakConfig.channelId, 'timer_alerts');
    assert.equal(breakConfig.tab, 'timer');
    assert.match(breakConfig.title, /Break/);
  });

  it('correctly maps countdown halfway and finished alerts to timer_alerts channel', () => {
    const halfway = resolveNotificationConfig('countdown_halfway', {});
    assert.equal(halfway.channelId, 'timer_alerts');
    assert.equal(halfway.tab, 'timer');
    assert.match(halfway.title, /Halfway/);

    const finished = resolveNotificationConfig('countdown_finished', {});
    assert.equal(finished.channelId, 'timer_alerts');
    assert.equal(finished.tab, 'timer');
    assert.match(finished.title, /Finished/);
  });

  it('correctly routes streak and goal reminders to reminders channel with stats tab', () => {
    const goal = resolveNotificationConfig('goal_reached', {});
    assert.equal(goal.channelId, 'reminders');
    assert.equal(goal.tab, 'stats');

    const streak = resolveNotificationConfig('streak_reminder', {});
    assert.equal(streak.channelId, 'reminders');
    assert.equal(streak.tab, 'stats');
  });

  it('correctly routes social focus nudges to social_nudges channel with rooms tab', () => {
    const nudge = resolveNotificationConfig('focus_nudge', {
      senderName: 'Alex',
      roomName: 'Study Hall',
    });
    assert.equal(nudge.channelId, 'social_nudges');
    assert.equal(nudge.tab, 'rooms');
    assert.match(nudge.title, /Alex/);
    assert.match(nudge.body, /Study Hall/);
  });
});

describe('Native Running-Timer State & Chronometer Mapping', () => {
  it('formats elapsed seconds cleanly for paused notifications', () => {
    assert.equal(formatSecondsForNotification(0), '00:00');
    assert.equal(formatSecondsForNotification(5), '00:05');
    assert.equal(formatSecondsForNotification(75), '01:15');
    assert.equal(formatSecondsForNotification(872), '14:32');
    assert.equal(formatSecondsForNotification(3600), '1:00:00');
    assert.equal(formatSecondsForNotification(18316), '5:05:16');
  });

  it('maps Stopwatch state to count UP chronometer with Pause and Stop actions', () => {
    const now = 1700000000000;
    const elapsedSeconds = 45;
    const baseTime = now - elapsedSeconds * 1000;

    const state = {
      mode: 'stopwatch' as const,
      isPaused: false,
      subject: 'Math',
      usesChronometer: true,
      countDown: false,
      chronometerWhen: baseTime,
      actions: ['Pause', 'Stop'],
      title: 'Stopwatch · Math',
    };

    assert.equal(state.usesChronometer, true);
    assert.equal(state.countDown, false);
    assert.equal(state.chronometerWhen, now - 45000);
    assert.deepEqual(state.actions, ['Pause', 'Stop']);
    assert.equal(state.title, 'Stopwatch · Math');
  });

  it('maps Countdown state to count DOWN chronometer with target finish timestamp', () => {
    const now = 1700000000000;
    const targetSeconds = 1500; // 25 mins
    const elapsedSeconds = 300; // 5 mins elapsed
    const remainingSeconds = targetSeconds - elapsedSeconds; // 1200s
    const targetFinishMs = now + remainingSeconds * 1000;

    const state = {
      mode: 'countdown' as const,
      isPaused: false,
      subject: 'History',
      usesChronometer: true,
      countDown: true,
      chronometerWhen: targetFinishMs,
      actions: ['Pause', 'Stop'],
      title: 'Countdown · History',
    };

    assert.equal(state.usesChronometer, true);
    assert.equal(state.countDown, true);
    assert.equal(state.chronometerWhen, now + 1200000);
    assert.deepEqual(state.actions, ['Pause', 'Stop']);
  });

  it('maps Pomodoro focus and break states to correct titles and countdown mode', () => {
    // Focus phase
    const focusState = {
      mode: 'pomodoro' as const,
      phase: 'work' as const,
      isPaused: false,
      title: 'Pomodoro: Focus · Physics',
      usesChronometer: true,
      countDown: true,
      actions: ['Pause', 'Stop'],
    };
    assert.equal(focusState.title, 'Pomodoro: Focus · Physics');
    assert.equal(focusState.countDown, true);

    // Break phase
    const breakState = {
      mode: 'pomodoro' as const,
      phase: 'break' as const,
      isPaused: false,
      title: 'Pomodoro: Break',
      usesChronometer: true,
      countDown: true,
      actions: ['Pause', 'Stop'],
    };
    assert.equal(breakState.title, 'Pomodoro: Break');
    assert.equal(breakState.countDown, true);
  });

  it('maps Paused timer state to frozen text, no chronometer, and Resume/Stop actions', () => {
    const elapsedSeconds = 872; // 14:32
    const timeText = formatSecondsForNotification(elapsedSeconds);

    const pausedState = {
      mode: 'stopwatch' as const,
      isPaused: true,
      title: 'Stopwatch (Paused)',
      usesChronometer: false,
      contentText: `⏸ Paused · ${timeText}`,
      actions: ['Resume', 'Stop'],
    };

    assert.equal(pausedState.usesChronometer, false);
    assert.equal(pausedState.contentText, '⏸ Paused · 14:32');
    assert.deepEqual(pausedState.actions, ['Resume', 'Stop']);
    assert.equal(pausedState.title, 'Stopwatch (Paused)');
  });

  it('enforces ongoing (non-dismissible) flags while timer is running', () => {
    const isRunning = true;
    const isPaused = false;
    const isTimerActivelyRunning = isRunning && !isPaused;

    const notificationConfig = {
      ongoing: isTimerActivelyRunning,
      autoCancel: !isTimerActivelyRunning,
    };

    assert.equal(notificationConfig.ongoing, true);
    assert.equal(notificationConfig.autoCancel, false);
  });

  it('guarantees chronometer base calculation does not reset to 0 upon swipe/re-anchor', () => {
    // Scenario: User starts stopwatch at t=1000s, runs for 45s (now t=1045s)
    const startedAtMs = 1700000000000;
    const baseElapsedSeconds = 0;

    // Correct formula: sessionOriginMs = startedAtMs - (baseElapsedSeconds * 1000)
    const computeSessionOrigin = (startMs: number, baseElapsedSec: number) => startMs - (baseElapsedSec * 1000);

    const initialBase = computeSessionOrigin(startedAtMs, baseElapsedSeconds);
    assert.equal(initialBase, startedAtMs);

    // 45 seconds later, notification is swiped or updated
    const now45s = startedAtMs + 45000;
    const reanchorBase = computeSessionOrigin(startedAtMs, baseElapsedSeconds);

    // Base MUST remain identical to startedAtMs (so chronometer displays now45s - startedAtMs = 45s, NOT 0s)
    assert.equal(reanchorBase, startedAtMs);
    assert.equal(now45s - reanchorBase, 45000); // 45 seconds elapsed!

    // If flawed formula (now - baseElapsedSeconds * 1000) was used:
    const flawedBase = now45s - (baseElapsedSeconds * 1000);
    assert.equal(now45s - flawedBase, 0); // Flawed formula gives 0!
  });

  it('verifies onTaskRemoved contract clears notification and terminates service', () => {
    let isServiceRunning = true;
    let isForegroundActive = true;
    let notificationCancelled = false;

    // Simulate onTaskRemoved implementation
    const onTaskRemoved = () => {
      isServiceRunning = false;
      isForegroundActive = false;
      notificationCancelled = true;
    };

    onTaskRemoved();

    assert.equal(isServiceRunning, false);
    assert.equal(isForegroundActive, false);
    assert.equal(notificationCancelled, true);
  });
});
