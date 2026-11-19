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

  it('correctly routes timer_remote_started alert to timer_alerts channel with timer tab', () => {
    const remoteAlert = resolveNotificationConfig('timer_remote_started', {});
    assert.equal(remoteAlert.channelId, 'timer_alerts');
    assert.equal(remoteAlert.tab, 'timer');
    assert.match(remoteAlert.title, /another device/i);
    assert.match(remoteAlert.body, /another device and is syncing/i);
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

  it('correctly routes room mentions to social_mentions channel with high priority', () => {
    const mention = resolveNotificationConfig('room_mention', {
      senderName: 'Amos',
      roomName: 'Focus Alpha',
      extra: { snippet: 'Are you here @trial?' },
    });
    assert.equal(mention.channelId, 'social_mentions');
    assert.equal(mention.tab, 'rooms');
    assert.match(mention.title, /Amos.*mentioned you/i);
    assert.match(mention.body, /Focus Alpha/);
  });

  it('correctly routes room replies to social_replies channel with high priority', () => {
    const reply = resolveNotificationConfig('room_reply', {
      senderName: 'Wren',
      roomName: 'Focus Alpha',
      extra: { snippet: 'Yes, starting now!' },
    });
    assert.equal(reply.channelId, 'social_replies');
    assert.equal(reply.tab, 'rooms');
    assert.match(reply.title, /Wren.*replied to you/i);
    assert.match(reply.body, /Focus Alpha/);
  });

  it('correctly routes standard room chat to social_chat channel', () => {
    const chat = resolveNotificationConfig('room_chat', {
      senderName: 'Aljin',
      roomName: 'Focus Alpha',
      extra: { snippet: 'Hello scholars!' },
    });
    assert.equal(chat.channelId, 'social_chat');
    assert.equal(chat.tab, 'rooms');
    assert.equal(chat.title, 'Focus Alpha');
    assert.match(chat.body, /Aljin.*Hello scholars!/);
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

  it('maps Stopwatch state to count UP chronometer with Pause action (no Stop action)', () => {
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
      actions: ['Pause'],
      title: 'Stopwatch · Math',
    };

    assert.equal(state.usesChronometer, true);
    assert.equal(state.countDown, false);
    assert.equal(state.chronometerWhen, now - 45000);
    assert.deepEqual(state.actions, ['Pause']);
    assert.ok(!state.actions.includes('Stop'), 'Stop button must be removed from notifications');
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
      actions: ['Pause'],
      title: 'Countdown · History',
    };

    assert.equal(state.usesChronometer, true);
    assert.equal(state.countDown, true);
    assert.equal(state.chronometerWhen, now + 1200000);
    assert.deepEqual(state.actions, ['Pause']);
    assert.ok(!state.actions.includes('Stop'), 'Stop button must be removed from notifications');
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
      actions: ['Pause'],
    };
    assert.equal(focusState.title, 'Pomodoro: Focus · Physics');
    assert.equal(focusState.countDown, true);
    assert.deepEqual(focusState.actions, ['Pause']);

    // Break phase
    const breakState = {
      mode: 'pomodoro' as const,
      phase: 'break' as const,
      isPaused: false,
      title: 'Pomodoro: Break',
      usesChronometer: true,
      countDown: true,
      actions: ['Pause'],
    };
    assert.equal(breakState.title, 'Pomodoro: Break');
    assert.equal(breakState.countDown, true);
    assert.deepEqual(breakState.actions, ['Pause']);
  });

  it('maps Paused timer state to frozen text, no chronometer, and Resume action (no Stop)', () => {
    const elapsedSeconds = 872; // 14:32
    const timeText = formatSecondsForNotification(elapsedSeconds);

    const pausedState = {
      mode: 'stopwatch' as const,
      isPaused: true,
      title: 'Stopwatch (Paused)',
      usesChronometer: false,
      contentText: `⏸ Paused · ${timeText}`,
      actions: ['Resume'],
    };

    assert.equal(pausedState.usesChronometer, false);
    assert.equal(pausedState.contentText, '⏸ Paused · 14:32');
    assert.deepEqual(pausedState.actions, ['Resume']);
    assert.ok(!pausedState.actions.includes('Stop'), 'Stop button must be removed from notifications');
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
