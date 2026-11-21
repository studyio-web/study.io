import { TimerNotification } from './timerNotificationPlugin';
import { soundFx } from './audio';

/**
 * Timer Alarm Helper & Preference Management
 * Supports optional 5-minute alarm for Countdown, Ultra Strict, and Pomodoro modes.
 */

export const STORAGE_KEY_ALARM_ENABLED = 'studyio_timer_alarm_enabled';
export const ALARM_MAX_DURATION_SECONDS = 300; // 5 minutes

export function loadTimerAlarmEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem(STORAGE_KEY_ALARM_ENABLED);
    if (val === null) return true; // Enabled by default
    return val === 'true';
  } catch {
    return true;
  }
}

export function saveTimerAlarmEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_ALARM_ENABLED, enabled ? 'true' : 'false');
    window.dispatchEvent(
      new CustomEvent('studyio_timer_alarm_changed', { detail: { enabled } })
    );

    // Sync state directly to native Android plugin and SharedPreferences
    TimerNotification.setAlarmEnabled({ enabled }).catch(() => {});

    if (!enabled) {
      soundFx.stopTimerAlarm();
      TimerNotification.cancelAlarm().catch(() => {});
      TimerNotification.stopAlarm().catch(() => {});
    }
  } catch {
    // ignore
  }
}

export function formatAlarmRemaining(seconds: number): string {
  const safeSec = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
