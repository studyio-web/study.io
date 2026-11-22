import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

/**
 * Universal Key-Value Storage Helper
 * Persists small values (device_id, flags, feature toggles)
 * in Capacitor Preferences on native platforms (surviving webview recreation)
 * and localStorage on web browsers.
 */

export async function kvSet(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(key, value);
  } catch {}

  try {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value });
    }
  } catch {}
}

export async function kvGet(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    if (Capacitor.isNativePlatform()) {
      const res = await Preferences.get({ key });
      if (res && res.value !== null) {
        return res.value;
      }
    }
  } catch {}

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function kvRemove(key: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(key);
  } catch {}

  try {
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key });
    }
  } catch {}
}
