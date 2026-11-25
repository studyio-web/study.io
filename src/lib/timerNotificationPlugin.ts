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
  isCompleted?: boolean;
  mode: string;
  phase: string;
  startTime: number;
  elapsedSeconds: number;
  baseElapsedSeconds?: number;
  targetSeconds: number;
  subject: string;
}

export interface NativeAlarmState {
  isRinging: boolean;
  remainingSilenceSeconds: number;
  mode: string;
  phase: string;
  subject: string;
  durationSeconds: number;
}

export interface DeviceManufacturerResult {
  manufacturer: string;
  model: string;
  sdkInt: number;
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
  setAlarmEnabled(options: { enabled: boolean }): Promise<{ success: boolean; enabled: boolean }>;
  isAlarmEnabled(): Promise<{ enabled: boolean }>;
  snooze(options?: { minutes?: number }): Promise<void>;
  getAlarmState(): Promise<NativeAlarmState>;
  getDeviceManufacturer(): Promise<DeviceManufacturerResult>;
  openNotificationSettings(): Promise<void>;
  checkAlarmPermissions(): Promise<AlarmPermissionsResult>;
  requestExactAlarmPermission(): Promise<void>;
  requestFullScreenPermission(): Promise<void>;
  testAlarm(options?: { seconds?: number }): Promise<{ success: boolean; delaySeconds?: number }>;

  addListener(
    eventName: 'onTimerAction',
    listenerFunc: (data: { action: 'pause' | 'resume' | 'stop' | 'confirm_still_studying' }) => void
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
      baseElapsedSeconds: 0,
      targetSeconds: 0,
      subject: '',
    }),
    isBatteryOptimized: async () => ({ isIgnoringBatteryOptimizations: true }),
    requestIgnoreBatteryOptimization: async () => {},
    scheduleAlarm: async () => ({ success: true }),
    cancelAlarm: async () => {},
    stopAlarm: async () => {},
    setAlarmEnabled: async ({ enabled }: { enabled: boolean }) => ({ success: true, enabled }),
    isAlarmEnabled: async () => ({ enabled: true }),
    snooze: async () => {},
    getAlarmState: async () => ({
      isRinging: false,
      remainingSilenceSeconds: 300,
      mode: 'countdown',
      phase: 'work',
      subject: '',
      durationSeconds: 0,
    }),
    getDeviceManufacturer: async () => ({
      manufacturer: 'Web Browser',
      model: 'Standard Web',
      sdkInt: 0,
    }),
    openNotificationSettings: async () => {},
    checkAlarmPermissions: async () => ({
      exactAlarm: true,
      fullScreen: true,
      notifications: true,
      batteryOptimized: false,
    }),
    requestExactAlarmPermission: async () => {},
    requestFullScreenPermission: async () => {},
    testAlarm: async () => ({ success: true, delaySeconds: 10 }),
    addListener: async () => ({
      remove: async () => {},
    }),
  },
});

export const TimerNotification = NativeTimerNotification;

export function isNativeAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const isCapacitorNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const isUserAgentNative = Boolean(typeof navigator !== 'undefined' && navigator?.userAgent && /StudyIoNativeApp/i.test(navigator.userAgent));
  return isCapacitorNative || isUserAgentNative;
}
