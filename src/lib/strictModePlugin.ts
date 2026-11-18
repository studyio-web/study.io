import { registerPlugin, Capacitor } from '@capacitor/core';

export interface InstalledApp {
  packageName: string;
  name: string;
  icon?: string;
}

export interface ForegroundAppInfo {
  packageName: string | null;
  name: string | null;
  isSystemOrLauncher?: boolean;
}

export interface StrictModePlugin {
  hasUsagePermission(): Promise<{ granted: boolean }>;
  requestUsagePermission(): Promise<void>;
  getInstalledApps(): Promise<{ apps: InstalledApp[] }>;
  getForegroundApp(): Promise<ForegroundAppInfo>;
}

const NativeStrictMode = registerPlugin<StrictModePlugin>('StrictMode', {
  web: {
    hasUsagePermission: async () => ({ granted: false }),
    requestUsagePermission: async () => {},
    getInstalledApps: async () => ({ apps: [] }),
    getForegroundApp: async () => ({
      packageName: null,
      name: null,
      isSystemOrLauncher: false,
    }),
  },
});

export const StrictMode = NativeStrictMode;

/**
 * Strict Mode is strictly supported ONLY on native Android devices.
 * Always returns false on PC / Desktop Browser / Web.
 */
export function isStrictModeSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

const STRICT_MODE_STORAGE_KEY = 'studyio_strict_mode_enabled';
const ALLOWED_APPS_STORAGE_KEY = 'studyio_strict_mode_allowed_apps';

export function loadStrictModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STRICT_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveStrictModeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STRICT_MODE_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {}
}

export function loadAllowedApps(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ALLOWED_APPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAllowedApps(apps: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ALLOWED_APPS_STORAGE_KEY, JSON.stringify(apps));
  } catch {}
}
