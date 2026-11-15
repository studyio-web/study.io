'use client';

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App } from '@capacitor/app';
import { isHapticsEnabled } from './haptics';

export type HapticType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error';

/**
 * Triggers native haptic feedback on mobile devices via Capacitor Haptics,
 * falls back to navigator.vibrate on mobile browsers, and degrades silently on desktop.
 */
export async function triggerHaptic(type: HapticType = 'light'): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isHapticsEnabled()) return;

  try {
    if (Capacitor.isNativePlatform() || Capacitor.isPluginAvailable('Haptics')) {
      switch (type) {
        case 'light':
        case 'selection':
        case 'medium':
        case 'heavy':
        case 'warning':
        case 'error':
          await Haptics.impact({ style: ImpactStyle.Light });
          break;
        case 'success':
          await Haptics.impact({ style: ImpactStyle.Light });
          break;
      }
      return;
    }

    // Gentle web vibration fallback for Android mobile browsers (Chrome on Android)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      switch (type) {
        case 'light':
        case 'selection':
          navigator.vibrate(5);
          break;
        case 'medium':
        case 'heavy':
        case 'warning':
        case 'error':
          navigator.vibrate(8);
          break;
        case 'success':
          navigator.vibrate([5, 25, 5]);
          break;
      }
    }
  } catch {
    // Silent degradation on unsupported platforms or permission restrictions
  }
}

/**
 * Updates the native Android Status Bar color to match the current theme.
 */
export async function updateNativeStatusBar(color = '#050507', isDark = true): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('StatusBar')) {
      await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
      try {
        await StatusBar.setOverlaysWebView({ overlay: true });
      } catch {
        // Ignored on edge-to-edge Android releases
      }
    }
  } catch {
    // Graceful fallback
  }
}

/**
 * Registers native Android system bar and hardware back-button listener.
 * - Closes active modals/dialogs first if open.
 * - Navigates browser history if canGoBack is true.
 * - Otherwise exits or minimizes the app cleanly.
 */
export async function initNativeAndroidBridge(defaultColor = '#050507'): Promise<() => void> {
  if (typeof window === 'undefined') return () => {};

  let backListenerHandle: { remove: () => void } | null = null;

  try {
    if (Capacitor.isNativePlatform()) {
      // 1. Initial Status Bar sync
      await updateNativeStatusBar(defaultColor, true);

      // 2. Hardware Back Button handler
      if (Capacitor.isPluginAvailable('App')) {
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          // Check for any open modal / dialog
          const openDialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
          if (openDialog) {
            // Priority: Click existing close button or fire Escape
            const closeBtn = openDialog.querySelector<HTMLElement>(
              'button[aria-label*="close" i], button[title*="close" i], button.modal-close'
            );
            if (closeBtn) {
              closeBtn.click();
              triggerHaptic('light');
              return;
            }
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            triggerHaptic('light');
            return;
          }

          // If history can go back, navigate back
          if (canGoBack && window.history.length > 1) {
            window.history.back();
            triggerHaptic('light');
          } else {
            // Exit app at root view
            App.exitApp();
          }
        });

        backListenerHandle = handle;
      }
    }
  } catch (err) {
    console.warn('Native Android bridge notice:', err);
  }

  return () => {
    if (backListenerHandle) {
      backListenerHandle.remove();
    }
  };
}

