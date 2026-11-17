'use client';

import { Haptics, ImpactStyle } from '@capacitor/haptics';
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
 * Uses small, gentle micro-haptics (ImpactStyle.Light) to prevent harsh motor buzzes.
 */
async function runHaptic(
  nativeAction: () => Promise<void>,
  webPattern: number | number[]
): Promise<void> {
  if (!isHapticsEnabled()) return;
  if (typeof window === 'undefined') return;

  // Throttle to prevent rapid-fire buzzing
  const now = Date.now();
  if (now - lastHapticTime < 60) return;
  lastHapticTime = now;

  // 1. Highest priority: Native Android system haptic tick (CLOCK_TICK) for small, crisp, pleasant feedback
  try {
    if ((window as any).AndroidFullscreenBridge?.performSmallHaptic) {
      (window as any).AndroidFullscreenBridge.performSmallHaptic();
      return;
    }
  } catch {}

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
 * Very brief 5ms micro-pulse that feels like a subtle click.
 */
export async function hapticTick(): Promise<void> {
  await runHaptic(
    async () => {
      try {
        await Haptics.vibrate({ duration: 8 });
      } catch {
        await Haptics.selectionChanged();
      }
    },
    4
  );
}

/**
 * Medium tactile feedback: for primary actions like Start/Pause/Reset timer, Add Task, Join Room.
 * Short 8ms crisp tap.
 */
export async function hapticMedium(): Promise<void> {
  await runHaptic(
    async () => {
      try {
        await Haptics.vibrate({ duration: 12 });
      } catch {
        await Haptics.impact({ style: ImpactStyle.Light });
      }
    },
    6
  );
}

/**
 * Success notification feedback: for completing a Pomodoro session or checking off a task.
 * Subtle double micro-tap [5, 25, 5].
 */
export async function hapticSuccess(): Promise<void> {
  await runHaptic(
    () => Haptics.impact({ style: ImpactStyle.Light }),
    [5, 25, 5]
  );
}

/**
 * Warning / error feedback: for deleting a task or error state.
 * Gentle 10ms tap.
 */
export async function hapticWarning(): Promise<void> {
  await runHaptic(
    () => Haptics.impact({ style: ImpactStyle.Light }),
    10
  );
}
