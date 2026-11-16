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

export interface TimerNotificationPlugin {
  start(options: TimerStartOptions): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  update(options: TimerUpdateOptions): Promise<void>;
  isServiceRunning(): Promise<{ isRunning: boolean }>;
  isBatteryOptimized(): Promise<{ isIgnoringBatteryOptimizations: boolean }>;
  requestIgnoreBatteryOptimization(): Promise<void>;
  addListener(
    eventName: 'onTimerAction',
    listenerFunc: (data: { action: 'pause' | 'resume' | 'stop' }) => void
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
    isBatteryOptimized: async () => ({ isIgnoringBatteryOptimizations: true }),
    requestIgnoreBatteryOptimization: async () => {},
    addListener: async () => ({
      remove: async () => {},
    }),
  },
});

export const TimerNotification = NativeTimerNotification;

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
