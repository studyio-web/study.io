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

export type BackButtonHandler = () => boolean | Promise<boolean>;

const backButtonHandlers: BackButtonHandler[] = [];

/**
 * Registers a hardware back-button interceptor.
 * Handlers run in LIFO order (last registered runs first).
 * If a handler returns `true`, the back action is considered consumed and halts further processing.
 */
export function registerBackButtonHandler(handler: BackButtonHandler): () => void {
  backButtonHandlers.push(handler);
  return () => {
    const idx = backButtonHandlers.indexOf(handler);
    if (idx !== -1) {
      backButtonHandlers.splice(idx, 1);
    }
  };
}

/**
 * Triggers native haptic feedback on mobile devices via Capacitor Haptics,
 * falls back to navigator.vibrate on mobile browsers, and degrades silently on desktop.
 */
export async function triggerHaptic(type: HapticType = 'light'): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isHapticsEnabled()) return;

  // 1. Highest priority: Native Android system haptic tick (CLOCK_TICK) for small, crisp, pleasant feedback
  try {
    if ((window as any).AndroidFullscreenBridge?.performSmallHaptic) {
      (window as any).AndroidFullscreenBridge.performSmallHaptic();
      return;
    }
  } catch {}

  try {
    if (Capacitor.isNativePlatform() || Capacitor.isPluginAvailable('Haptics')) {
      switch (type) {
        case 'light':
        case 'selection':
          try {
            await Haptics.vibrate({ duration: 8 });
          } catch {
            await Haptics.selectionChanged();
          }
          break;
        case 'medium':
        case 'heavy':
        case 'warning':
        case 'error':
        case 'success':
          try {
            await Haptics.vibrate({ duration: 12 });
          } catch {
            await Haptics.impact({ style: ImpactStyle.Light });
          }
          break;
      }
      return;
    }

    // Gentle web vibration fallback for Android mobile browsers (Chrome on Android)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      switch (type) {
        case 'light':
        case 'selection':
          navigator.vibrate(4);
          break;
        case 'medium':
        case 'heavy':
        case 'warning':
        case 'error':
          navigator.vibrate(6);
          break;
        case 'success':
          navigator.vibrate([4, 18, 4]);
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
        const handle = await App.addListener('backButton', async ({ canGoBack }) => {
          // 1. Run custom registered handlers in LIFO order (latest registered runs first)
          for (let i = backButtonHandlers.length - 1; i >= 0; i--) {
            try {
              const handled = await backButtonHandlers[i]();
              if (handled) {
                triggerHaptic('light');
                return;
              }
            } catch (err) {
              console.warn('Native Android back button handler error:', err);
            }
          }

          // 2. Check for any open modal / dialog in DOM
          const openDialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
          if (openDialog) {
            // Priority: Click existing close button or fire Escape
            const closeBtn = openDialog.querySelector<HTMLElement>(
              'button[aria-label*="close" i], button[title*="close" i], button.modal-close, button[aria-label*="dismiss" i]'
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

          // 3. Fallback: check if active tab from URL query is not timer (always return to timer first)
          try {
            const params = new URLSearchParams(window.location.search);
            const currentTab = params.get('tab');
            if (currentTab && currentTab !== 'timer') {
              window.dispatchEvent(new CustomEvent('studyio:navigate-tab', { detail: { tab: 'timer' } }));
              triggerHaptic('light');
              return;
            }
          } catch {}

          // 4. Check if we are on the primary dashboard root (/ or /dashboard)
          const isDashboardOrHome =
            typeof window !== 'undefined' &&
            (window.location.pathname === '/' ||
              window.location.pathname === '/dashboard' ||
              window.location.pathname.startsWith('/dashboard'));

          if (isDashboardOrHome) {
            // All custom handlers and root timer checks have resolved without intercepting.
            // This guarantees the user is at the root timer tab with zero open modals.
            // Exit the app directly rather than oscillating between internal pushState history items.
            App.exitApp();
            return;
          }

          // 5. If on a secondary subpage (e.g. /premium, /recap) and history can go back, navigate back
          if (canGoBack && window.history.length > 1) {
            window.history.back();
            triggerHaptic('light');
          } else {
            // Exit app at root
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

