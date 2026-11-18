import { registerPlugin } from '@capacitor/core';

export interface AccessibilityBlockerPluginInterface {
  /**
   * Enable blocking of Instagram Reels and YouTube Shorts.
   */
  enable(): Promise<{ enabled: boolean }>;

  /**
   * Disable blocking mode.
   */
  disable(): Promise<{ enabled: boolean }>;

  /**
   * Check whether blocking mode is currently enabled in settings/session.
   */
  isEnabled(): Promise<{ enabled: boolean }>;

  /**
   * Check whether the Android system Accessibility Service has been granted by the user.
   */
  isServiceEnabled(): Promise<{ isServiceEnabled: boolean; isRunning: boolean }>;

  /**
   * Open the Android system Accessibility settings screen so the user can enable the service.
   */
  openSettings(): Promise<{ success: boolean }>;
}

let mockBlockerActive = false;

const NativeAccessibilityBlocker = registerPlugin<AccessibilityBlockerPluginInterface>('AccessibilityBlocker', {
  web: () => ({
    async enable() {
      mockBlockerActive = true;
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('studyio_accessibility_blocker_active', 'true');
        } catch {}
      }
      return { enabled: true };
    },
    async disable() {
      mockBlockerActive = false;
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('studyio_accessibility_blocker_active', 'false');
        } catch {}
      }
      return { enabled: false };
    },
    async isEnabled() {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
          const val = localStorage.getItem('studyio_accessibility_blocker_active');
          if (val !== null) return { enabled: val === 'true' };
        } catch {}
      }
      return { enabled: mockBlockerActive };
    },
    async isServiceEnabled() {
      return { isServiceEnabled: false, isRunning: false };
    },
    async openSettings() {
      console.log('[AccessibilityBlocker] openSettings invoked (web mock)');
      return { success: true };
    },
  }),
});

export const AccessibilityBlocker = {
  /**
   * Enable blocking mode for Instagram Reels and YouTube Shorts.
   * Call this when starting or resuming a focus session in the timer component.
   */
  async enable(): Promise<boolean> {
    try {
      const res = await NativeAccessibilityBlocker.enable();
      return res.enabled;
    } catch (err) {
      console.warn('[AccessibilityBlocker] Failed to enable blocker:', err);
      return false;
    }
  },

  /**
   * Disable blocking mode for Instagram Reels and YouTube Shorts.
   * Call this when pausing, stopping, or finishing a focus session in the timer component.
   */
  async disable(): Promise<boolean> {
    try {
      const res = await NativeAccessibilityBlocker.disable();
      return res.enabled;
    } catch (err) {
      console.warn('[AccessibilityBlocker] Failed to disable blocker:', err);
      return false;
    }
  },

  /**
   * Check whether blocking mode is currently toggled ON.
   */
  async isEnabled(): Promise<boolean> {
    try {
      const res = await NativeAccessibilityBlocker.isEnabled();
      return res.enabled;
    } catch {
      return false;
    }
  },

  /**
   * Check whether the user has enabled the Accessibility Service in Android Settings.
   */
  async isServiceEnabled(): Promise<boolean> {
    try {
      const res = await NativeAccessibilityBlocker.isServiceEnabled();
      return res.isServiceEnabled;
    } catch {
      return false;
    }
  },

  /**
   * Direct the user to Android Settings > Accessibility to enable the service.
   */
  async openSettings(): Promise<boolean> {
    try {
      const res = await NativeAccessibilityBlocker.openSettings();
      return res.success;
    } catch (err) {
      console.warn('[AccessibilityBlocker] Failed to open accessibility settings:', err);
      return false;
    }
  },
};
