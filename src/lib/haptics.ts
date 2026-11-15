'use client';

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'hapticsEnabled';
const LEGACY_STORAGE_KEY = 'studyio_haptics_enabled';

let lastHapticTime = 0;

/**
 * Returns the epoch timestamp of the most recent haptic vibration triggered.
 */
export function getLastHapticTime(): number {
  return lastHapticTime;
}

/**
 * Returns whether haptic touch vibration is enabled.
 * Defaults to true if no preference has been saved yet.
 */
export function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (val === null) return true;
    return val === 'true';
  } catch {
    return true;
  }
}

/**
 * Persists the user's haptics preference in localStorage and notifies
 * any active components via a CustomEvent.
 */
export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    localStorage.setItem(LEGACY_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('studyio_haptics_changed', { detail: enabled }));
  } catch {}
}

/**
 * Internal execution runner with try/catch wrapping so unsupported
 * desktop browsers or environments never throw unhandled errors.
 */
async function runHaptic(
  nativeAction: () => Promise<void>,
  webPattern: number | number[]
): Promise<void> {
  if (!isHapticsEnabled()) return;
  if (typeof window === 'undefined') return;

  lastHapticTime = Date.now();

  try {
    if (Capacitor.isNativePlatform() || Capacitor.isPluginAvailable('Haptics')) {
      await nativeAction();
      return;
    }
  } catch {
    // Graceful fallback to web vibration
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(webPattern);
    }
  } catch {}
}

/**
 * Light tap feedback: for tab switches, filter pills, dropdowns, and button clicks.
 * Calls Haptics.impact({ style: ImpactStyle.Light }) with fallback to navigator.vibrate?.(8)
 */
export async function hapticTick(): Promise<void> {
  await runHaptic(
    () => Haptics.impact({ style: ImpactStyle.Light }),
    8
  );
}

/**
 * Medium tactile feedback: for primary actions like Start/Pause/Reset timer, Add Task, Join Room.
 * Calls Haptics.impact({ style: ImpactStyle.Medium }) with fallback to navigator.vibrate?.(18)
 */
export async function hapticMedium(): Promise<void> {
  await runHaptic(
    () => Haptics.impact({ style: ImpactStyle.Medium }),
    18
  );
}

/**
 * Success notification feedback: for completing a Pomodoro session or checking off a task.
 * Calls Haptics.notification({ type: NotificationType.Success }) with fallback to navigator.vibrate?.([15, 40, 25])
 */
export async function hapticSuccess(): Promise<void> {
  await runHaptic(
    () => Haptics.notification({ type: NotificationType.Success }),
    [15, 40, 25]
  );
}

/**
 * Warning / error feedback: for deleting a task or error state.
 * Calls Haptics.notification({ type: NotificationType.Warning }) with fallback to navigator.vibrate?.([30, 30, 30])
 */
export async function hapticWarning(): Promise<void> {
  await runHaptic(
    () => Haptics.notification({ type: NotificationType.Warning }),
    [30, 30, 30]
  );
}
