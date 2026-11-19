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
  hasOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<void>;
  getInstalledApps(): Promise<{ apps: InstalledApp[] }>;
  getForegroundApp(): Promise<ForegroundAppInfo>;
  isDeviceAdminActive(): Promise<{ active: boolean }>;
  requestDeviceAdmin(): Promise<void>;
  deactivateDeviceAdmin(): Promise<{ success: boolean }>;
  isUninstallProtectionEnabled(): Promise<{ enabled: boolean }>;
  setUninstallProtectionEnabled(options: { enabled: boolean }): Promise<void>;
  syncStrictConfig(options: {
    enabled: boolean;
    allowedPackages: string[];
    isUltraStrict?: boolean;
    uninstallProtection?: boolean;
  }): Promise<void>;
  blockAppDirect(options: {
    packageName: string;
    name: string;
    isUltraStrict?: boolean;
  }): Promise<void>;
}

const NativeStrictMode = registerPlugin<StrictModePlugin>('StrictMode', {
  web: {
    hasUsagePermission: async () => ({ granted: false }),
    requestUsagePermission: async () => {},
    hasOverlayPermission: async () => ({ granted: false }),
    requestOverlayPermission: async () => {},
    getInstalledApps: async () => ({ apps: [] }),
    getForegroundApp: async () => ({
      packageName: null,
      name: null,
      isSystemOrLauncher: false,
    }),
    isDeviceAdminActive: async () => ({ active: false }),
    requestDeviceAdmin: async () => {},
    deactivateDeviceAdmin: async () => ({ success: true }),
    isUninstallProtectionEnabled: async () => ({ enabled: true }),
    setUninstallProtectionEnabled: async () => {},
    syncStrictConfig: async () => {},
    blockAppDirect: async () => {},
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
const ULTRA_STRICT_STORAGE_KEY = 'studyio_ultra_strict_enabled';
const UNINSTALL_PROTECTION_STORAGE_KEY = 'studyio_uninstall_protection_enabled';
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

export function loadUltraStrictEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(ULTRA_STRICT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveUltraStrictEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ULTRA_STRICT_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {}
}

export function loadUninstallProtectionEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem(UNINSTALL_PROTECTION_STORAGE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function saveUninstallProtectionEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(UNINSTALL_PROTECTION_STORAGE_KEY, enabled ? 'true' : 'false');
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
