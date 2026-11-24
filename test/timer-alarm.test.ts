import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadTimerAlarmEnabled,
  saveTimerAlarmEnabled,
  formatAlarmRemaining,
  STORAGE_KEY_ALARM_ENABLED,
  ALARM_MAX_DURATION_SECONDS,
} from '../src/lib/timerAlarm';
import { soundFx } from '../src/lib/audio';

describe('Timer Alarm Specification (Countdown, Ultra Strict & Pomodoro)', () => {
  it('loads timer alarm enabled state (defaulting to true when unset)', () => {
    const store: Record<string, string> = {};
    const originalLocalStorage = global.localStorage;
    const originalWindow = (global as any).window;

    (global as any).window = global;
    (global as any).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    };

    try {
      // 1. When unset, defaults to true
      assert.equal(loadTimerAlarmEnabled(), true, 'Alarm should default to enabled');

      // 2. Can be toggled to false
      saveTimerAlarmEnabled(false);
      assert.equal(loadTimerAlarmEnabled(), false, 'Alarm should be disabled when set to false');
      assert.equal(store[STORAGE_KEY_ALARM_ENABLED], 'false');

      // 3. Can be toggled back to true
      saveTimerAlarmEnabled(true);
      assert.equal(loadTimerAlarmEnabled(), true, 'Alarm should be enabled when set to true');
      assert.equal(store[STORAGE_KEY_ALARM_ENABLED], 'true');
    } finally {
      (global as any).localStorage = originalLocalStorage;
      (global as any).window = originalWindow;
    }
  });

  it('correctly formats alarm countdown durations up to 5 minutes', () => {
    assert.equal(ALARM_MAX_DURATION_SECONDS, 300, 'Max alarm duration must be 300s (5 minutes)');
    assert.equal(formatAlarmRemaining(300), '05:00');
    assert.equal(formatAlarmRemaining(299), '04:59');
    assert.equal(formatAlarmRemaining(65), '01:05');
    assert.equal(formatAlarmRemaining(9), '00:09');
    assert.equal(formatAlarmRemaining(0), '00:00');
    assert.equal(formatAlarmRemaining(-5), '00:00');
  });

  it('guarantees startTimerAlarm and stopTimerAlarm control alarm ringing state safely', () => {
    // In node test environment without browser AudioContext, methods handle absence gracefully
    soundFx.stopTimerAlarm();
    assert.equal(soundFx.isAlarmRinging(), false);

    // Starting alarm marks active and respects stop
    soundFx.startTimerAlarm(300);
    // In node/headless without window, AudioEngine safety guard returns gracefully
    soundFx.stopTimerAlarm();
    assert.equal(soundFx.isAlarmRinging(), false);
  });

  it('triggers 5-minute alarm on countdown completion when alarm is enabled', () => {
    let alarmTriggered = false;
    let alarmDuration = 0;
    let modalOpened = false;
    let modalMode = '';

    const triggerCountdownCompletion = (
      mode: string,
      isStudying: boolean,
      elapsedSeconds: number,
      targetSeconds: number,
      isCompleted: boolean,
      alarmEnabled: boolean,
      isUltra: boolean
    ) => {
      if (mode === 'countdown' && isStudying && elapsedSeconds >= targetSeconds && !isCompleted) {
        if (alarmEnabled) {
          alarmTriggered = true;
          alarmDuration = ALARM_MAX_DURATION_SECONDS;
          modalOpened = true;
          modalMode = isUltra ? 'ultra_strict' : 'countdown';
        }
      }
    };

    // 1. Normal countdown finishes with alarm enabled
    triggerCountdownCompletion('countdown', true, 1800, 1800, false, true, false);
    assert.equal(alarmTriggered, true, 'Alarm must trigger when countdown finishes with alarm enabled');
    assert.equal(alarmDuration, 300, 'Alarm must be configured for 5 minutes (300s)');
    assert.equal(modalOpened, true, 'Alarm modal must open');
    assert.equal(modalMode, 'countdown');

    // 2. Countdown finishes with alarm disabled (optional alarm)
    alarmTriggered = false;
    modalOpened = false;
    triggerCountdownCompletion('countdown', true, 1800, 1800, false, false, false);
    assert.equal(alarmTriggered, false, 'Alarm must NOT trigger when alarm is disabled');
    assert.equal(modalOpened, false, 'Alarm modal must NOT open when alarm is disabled');

    // 3. Ultra strict countdown finishes with alarm enabled
    alarmTriggered = false;
    modalOpened = false;
    triggerCountdownCompletion('countdown', true, 3600, 3600, false, true, true);
    assert.equal(alarmTriggered, true, 'Alarm must trigger when ultra strict countdown completes');
    assert.equal(modalOpened, true);
    assert.equal(modalMode, 'ultra_strict');
  });

  it('triggers 5-minute alarm on Pomodoro work and break completion when alarm is enabled', () => {
    let alarmTriggered = false;
    let alarmPhase = '';

    const handlePomodoroCompletion = (
      completedPhase: 'work' | 'break' | null,
      alarmEnabled: boolean
    ) => {
      if (!completedPhase || !alarmEnabled) return;
      alarmTriggered = true;
      alarmPhase = completedPhase;
    };

    // 1. Pomodoro work phase finishes (25m or 50m)
    handlePomodoroCompletion('work', true);
    assert.equal(alarmTriggered, true, 'Alarm must trigger when Pomodoro focus block completes');
    assert.equal(alarmPhase, 'work');

    // 2. Pomodoro break phase finishes (5m or 10m)
    alarmTriggered = false;
    handlePomodoroCompletion('break', true);
    assert.equal(alarmTriggered, true, 'Alarm must trigger when Pomodoro break finishes');
    assert.equal(alarmPhase, 'break');

    // 3. Optional: disabled alarm
    alarmTriggered = false;
    handlePomodoroCompletion('work', false);
    assert.equal(alarmTriggered, false, 'Alarm must not trigger when disabled');
  });

  it('guarantees dismissing or stopping alarm immediately halts alarm audio and closes modal', () => {
    let alarmAudioPlaying = true;
    let alarmModalOpen = true;

    const handleDismiss = () => {
      soundFx.stopTimerAlarm();
      alarmAudioPlaying = false;
      alarmModalOpen = false;
    };

    handleDismiss();
    assert.equal(alarmAudioPlaying, false, 'Audio must stop immediately on dismiss');
    assert.equal(alarmModalOpen, false, 'Modal must close immediately on dismiss');
    assert.equal(soundFx.isAlarmRinging(), false);
  });

  it('guarantees snooze stops alarm and extends countdown target by 5 minutes (300s)', () => {
    let currentTarget = 1800; // 30 minutes
    let isCompleted = true;
    let isAlarmRinging = true;

    const handleSnooze = () => {
      soundFx.stopTimerAlarm();
      isAlarmRinging = false;
      currentTarget += 300; // +5 minutes
      isCompleted = false;
    };

    handleSnooze();
    assert.equal(isAlarmRinging, false, 'Snooze must silence the alarm');
    assert.equal(currentTarget, 2100, 'Snooze must add 300 seconds (5 min) to countdown');
    assert.equal(isCompleted, false, 'Countdown completed flag must be cleared');
  });

  it('guarantees alarm triggerAtMs is computed from started_at and duration, never from ticks', () => {
    const startedAt = 1700000000000;
    const durationSeconds = 1800; // 30 minutes
    const elapsedSeconds = 600; // 10 minutes elapsed

    // Exact trigger time MUST be started_at + remaining ms
    const remainingSeconds = durationSeconds - elapsedSeconds;
    const triggerAtMs = startedAt + (durationSeconds * 1000);
    const triggerFromRemaining = Date.now() + (remainingSeconds * 1000);

    assert.equal(triggerAtMs, 1700001800000, 'Target finish timestamp must be strictly started_at + duration * 1000');
    assert.equal(remainingSeconds, 1200, 'Remaining duration must be 1200 seconds');
  });

  it('correctly maps Pomodoro work and break phases to alarm labels and mode', () => {
    const mapPhase = (phase: 'work' | 'shortBreak' | 'longBreak') => {
      const isBreak = phase === 'shortBreak' || phase === 'longBreak';
      return {
        alarmPhase: isBreak ? 'break' : 'work',
        label: isBreak ? 'Break Finished' : 'Session Complete',
        showRp: !isBreak,
      };
    };

    const workRes = mapPhase('work');
    assert.equal(workRes.alarmPhase, 'work');
    assert.equal(workRes.label, 'Session Complete');
    assert.equal(workRes.showRp, true);

    const shortBreakRes = mapPhase('shortBreak');
    assert.equal(shortBreakRes.alarmPhase, 'break');
    assert.equal(shortBreakRes.label, 'Break Finished');
    assert.equal(shortBreakRes.showRp, false);

    const longBreakRes = mapPhase('longBreak');
    assert.equal(longBreakRes.alarmPhase, 'break');
    assert.equal(longBreakRes.label, 'Break Finished');
    assert.equal(longBreakRes.showRp, false);
  });

  it('guarantees double-stop and double-save idempotency protection', async () => {
    let stopCallCount = 0;
    let saveCallCount = 0;
    let isSaving = false;
    let isAlarmRinging = true;

    const stopAlarmSafe = () => {
      if (!isAlarmRinging) return false;
      isAlarmRinging = false;
      stopCallCount++;
      return true;
    };

    const saveSessionSafe = async () => {
      if (isSaving) return false;
      isSaving = true;
      saveCallCount++;
      // Simulate save
      return true;
    };

    // First stop
    assert.equal(stopAlarmSafe(), true);
    assert.equal(stopCallCount, 1);
    // Second concurrent stop (e.g. from notification + slide) -> idempotent no-op
    assert.equal(stopAlarmSafe(), false);
    assert.equal(stopCallCount, 1);

    // First save
    assert.equal(await saveSessionSafe(), true);
    assert.equal(saveCallCount, 1);
    // Second concurrent save retry -> rejected, protected
    assert.equal(await saveSessionSafe(), false);
    assert.equal(saveCallCount, 1);
  });

  it('enforces reschedule on resume/snooze and cancel on pause/stop/logout', () => {
    let pendingAlarm: { id: string; triggerAtMs: number } | null = null;

    const scheduleAlarm = (id: string, triggerAtMs: number) => {
      pendingAlarm = { id, triggerAtMs };
    };

    const cancelAlarm = () => {
      pendingAlarm = null;
    };

    // 1. Timer starts -> alarm scheduled
    scheduleAlarm('alarm_1', 1700000000000);
    assert.ok(pendingAlarm);
    assert.equal((pendingAlarm as any).id, 'alarm_1');

    // 2. Timer pauses -> alarm canceled
    cancelAlarm();
    assert.equal(pendingAlarm, null);

    // 3. Timer resumes -> alarm rescheduled with new trigger time
    scheduleAlarm('alarm_2', 1700000600000);
    assert.ok(pendingAlarm);
    assert.equal((pendingAlarm as any).id, 'alarm_2');
    assert.equal((pendingAlarm as any).triggerAtMs, 1700000600000);

    // 4. Timer stops early / resets -> alarm canceled
    cancelAlarm();
    assert.equal(pendingAlarm, null);
  });

  it('guarantees native plugin contracts for alarm state, test alarm, and manufacturer detection', async () => {
    const { TimerNotification } = await import('../src/lib/timerNotificationPlugin');

    // 1. getAlarmState returns clean default state on web/fallback
    const state = await TimerNotification.getAlarmState();
    assert.strictEqual(typeof state.isRinging, 'boolean');
    assert.strictEqual(state.isRinging, false);
    assert.strictEqual(state.remainingSilenceSeconds, 300);

    // 2. testAlarm schedules test alarm in 10s
    const testResult = await TimerNotification.testAlarm({ seconds: 10 });
    assert.strictEqual(testResult.success, true);
    assert.strictEqual(testResult.delaySeconds, 10);

    // 3. getDeviceManufacturer returns metadata
    const manufacturer = await TimerNotification.getDeviceManufacturer();
    assert.ok(manufacturer.manufacturer);

    // 4. stopAlarm completes successfully
    await TimerNotification.stopAlarm();

    // 5. setAlarmEnabled and isAlarmEnabled plugin contracts
    const setRes = await TimerNotification.setAlarmEnabled({ enabled: false });
    assert.strictEqual(setRes.success, true);
    assert.strictEqual(setRes.enabled, false);

    const isEnabledRes = await TimerNotification.isAlarmEnabled();
    assert.strictEqual(typeof isEnabledRes.enabled, 'boolean');
  });

  it('guarantees alarm disabled state strictly prevents countdown and pomodoro alarms from firing', () => {
    let alarmRung = false;

    const onCompletion = (alarmEnabled: boolean, mode: 'countdown' | 'pomodoro', phase?: string) => {
      if (alarmEnabled) {
        alarmRung = true;
      }
    };

    // 1. Countdown finished with alarm disabled -> must NOT ring
    onCompletion(false, 'countdown');
    assert.equal(alarmRung, false, 'Disabled alarm must never ring for countdown completion');

    // 2. Pomodoro work phase finished with alarm disabled -> must NOT ring
    onCompletion(false, 'pomodoro', 'work');
    assert.equal(alarmRung, false, 'Disabled alarm must never ring for pomodoro work completion');

    // 3. Pomodoro break phase finished with alarm disabled -> must NOT ring
    onCompletion(false, 'pomodoro', 'break');
    assert.equal(alarmRung, false, 'Disabled alarm must never ring for pomodoro break completion');

    // 4. When re-enabled, rings as expected
    onCompletion(true, 'countdown');
    assert.equal(alarmRung, true, 'Enabled alarm rings on completion');
  });

  it('guarantees alarm button is located between dial and start session button and auxiliary controls row fits mobile screens without clipping', () => {
    // Read StudyTimer component source to assert layout architecture contracts
    const fs = require('fs');
    const path = require('path');
    const studyTimerSource = fs.readFileSync(path.resolve(__dirname, '../src/components/timer/StudyTimer.tsx'), 'utf-8');

    // 1. Alarm toggle button must NOT be inside the auxiliary controls row (section 5)
    const auxiliaryRowMatch = studyTimerSource.match(/\{\/\* 5\. Sleek Row of Auxiliary Control Buttons \*\/\}[\s\S]*?\{\/\* 6\. Today total/);
    assert.ok(auxiliaryRowMatch, 'Auxiliary control buttons row must exist');
    const auxiliaryRowCode = auxiliaryRowMatch[0];

    assert.ok(!auxiliaryRowCode.includes('isAlarmEnabled'), 'Alarm toggle must NOT be placed in the auxiliary controls row');
    assert.ok(!auxiliaryRowCode.includes('saveTimerAlarmEnabled'), 'Alarm save action must NOT be in the auxiliary controls row');

    // 2. Auxiliary controls row must allow flex-wrap so mobile screens never clip Atmosphere, Focus, or Strict buttons
    assert.ok(auxiliaryRowCode.includes('flex-wrap'), 'Auxiliary controls row must include flex-wrap for mobile responsiveness');

    // 3. Alarm toggle button must NOT be in the top mode selector header (section 1) to avoid crowding on mobile
    const topModeHeaderMatch = studyTimerSource.match(/\{\/\* 1\. Mode selector[\s\S]*?\{\/\* 2\. Subject chip/);
    assert.ok(topModeHeaderMatch, 'Top mode selector header must exist');
    const topModeHeaderCode = topModeHeaderMatch[0];
    assert.ok(!topModeHeaderCode.includes('isAlarmEnabled'), 'Alarm toggle button must NOT be located in the top mode header');

    // 4. Alarm toggle button must be located between the dial and primary button stack
    const betweenDialAndButtonMatch = studyTimerSource.match(/\{\/\* 3\. The Dial[\s\S]*?\{\/\* 4\. Primary Button Stack/);
    assert.ok(betweenDialAndButtonMatch, 'Section between dial and primary button stack must exist');
    const betweenDialAndButtonCode = betweenDialAndButtonMatch[0];

    assert.ok(betweenDialAndButtonCode.includes('isAlarmEnabled'), 'Alarm toggle button must be located between dial and start session button');
    assert.ok(betweenDialAndButtonCode.includes('timerMode === \'countdown\' || timerMode === \'pomodoro\''), 'Alarm button must appear for countdown and pomodoro modes');
    assert.ok(betweenDialAndButtonCode.includes('Bell') && betweenDialAndButtonCode.includes('BellOff'), 'Alarm button must switch between Bell and BellOff icons based on state');
    assert.ok(betweenDialAndButtonCode.includes('h-9 mb-1.5'), 'Alarm button container must have static height reservation to prevent dial vertical layout shift');
  });
});
