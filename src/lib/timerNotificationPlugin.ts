import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

export type PluginPomodoroPhase = 'work' | 'break' | 'shortBreak' | 'longBreak';

export interface TimerStartOptions {
  mode: 'stopwatch' | 'countdown' | 'pomodoro';
  phase?: PluginPomodoroPhase;
  startTime?: number; // epoch ms
  elapsedSeconds?: number;
  targetSeconds?: number;
  subject?: string;
}

export interface TimerUpdateOptions {
  mode?: 'stopwatch' | 'countdown' | 'pomodoro';
  phase?: PluginPomodoroPhase;
  startTime?: number;
  elapsedSeconds?: number;
  targetSeconds?: number;
  subject?: string;
}

export interface ScheduleAlarmOptions {
  id: string;
  triggerAtMs: number;
  label?: string;
  mode?: 'countdown' | 'pomodoro';
  phase?: 'work' | 'break';
  subject?: string;
  durationSeconds?: number;
}

export interface AlarmPermissionsResult {
  exactAlarm: boolean;
  fullScreen: boolean;
  notifications: boolean;
  batteryOptimized: boolean;
}

export interface ServiceTimerState {
  isServiceActive: boolean;
  isRunning: boolean;
  isPaused: boolean;
  mode: string;
  phase: string;
  startTime: number;
  elapsedSeconds: number;
  targetSeconds: number;
  subject: string;
}

export interface TimerNotificationPlugin {
  start(options: TimerStartOptions): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  update(options: TimerUpdateOptions): Promise<void>;
  isServiceRunning(): Promise<{ isRunning: boolean }>;
  getServiceTimerState(): Promise<ServiceTimerState>;
  isBatteryOptimized(): Promise<{ isIgnoringBatteryOptimizations: boolean }>;
  requestIgnoreBatteryOptimization(): Promise<void>;

  // Real Native Android Alarm Methods
  scheduleAlarm(options: ScheduleAlarmOptions): Promise<{ success: boolean }>;
  cancelAlarm(options?: { id?: string }): Promise<void>;
  stopAlarm(): Promise<void>;
  snooze(options?: { minutes?: number }): Promise<void>;
  checkAlarmPermissions(): Promise<AlarmPermissionsResult>;
  requestExactAlarmPermission(): Promise<void>;
  requestFullScreenPermission(): Promise<void>;
  testAlarm(): Promise<{ success: boolean }>;

  addListener(
    eventName: 'onTimerAction',
    listenerFunc: (data: { action: 'pause' | 'resume' | 'stop' }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'onAlarmAction',
    listenerFunc: (data: { action: 'stop' | 'snooze' | 'save' }) => void
  ): Promise<PluginListenerHandle>;
}

const NativeTimerNotification = registerPlugin<TimerNotificationPlugin>('TimerNotification', {
  web: {
    start: async () => {},
    pause: async () => {},
    resume: async () => {},
    stop: async () => {},
    update: async () => {},
    isServiceRunning: async () => ({ isRunning: false }),
    getServiceTimerState: async () => ({
      isServiceActive: false,
      isRunning: false,
      isPaused: false,
      mode: 'stopwatch',
      phase: 'work',
      startTime: 0,
      elapsedSeconds: 0,
      targetSeconds: 0,
      subject: '',
    }),
    isBatteryOptimized: async () => ({ isIgnoringBatteryOptimizations: true }),
    requestIgnoreBatteryOptimization: async () => {},
    scheduleAlarm: async () => ({ success: true }),
    cancelAlarm: async () => {},
    stopAlarm: async () => {},
    snooze: async () => {},
    checkAlarmPermissions: async () => ({
      exactAlarm: true,
      fullScreen: true,
      notifications: true,
      batteryOptimized: false,
    }),
    requestExactAlarmPermission: async () => {},
    requestFullScreenPermission: async () => {},
    testAlarm: async () => ({ success: true }),
    addListener: async () => ({
      remove: async () => {},
    }),
  },
});

export const TimerNotification = NativeTimerNotification;

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
