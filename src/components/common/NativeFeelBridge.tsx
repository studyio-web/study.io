'use client';

import { useEffect, useMemo } from 'react';
import { initNativeAndroidBridge, updateNativeStatusBar } from '../../lib/native-feel';
import { useTheme, DEFAULT_THEME } from '../../context/ThemeContext';
import { hapticTick, isHapticsEnabled, getLastHapticTime } from '../../lib/haptics';

export function NativeFeelBridge() {
  const { theme, themes } = useTheme();

  const currentTheme = useMemo(() => {
    return themes.find((t) => t.id === theme) || DEFAULT_THEME;
  }, [theme, themes]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    initNativeAndroidBridge(currentTheme.themeColor).then((unsub) => {
      cleanup = unsub;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // Update status bar dynamically when user changes theme
  useEffect(() => {
    if (currentTheme?.themeColor) {
      updateNativeStatusBar(currentTheme.themeColor, currentTheme.scheme !== 'light');
    }
  }, [currentTheme]);

  // Global button feel listener: triggers hapticTick on interactive buttons unless custom haptic handled
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePointerDown = (e: PointerEvent) => {
      // Only handle primary touches and clicks
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (!isHapticsEnabled()) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const interactive = target.closest<HTMLElement>('button, [role="button"]');
      if (!interactive) return;

      // Skip disabled, aria-disabled, or custom haptic opted-out buttons
      if (
        interactive.hasAttribute('disabled') ||
        interactive.getAttribute('aria-disabled') === 'true' ||
        interactive.closest('[data-no-haptic]') ||
        interactive.closest('[data-haptic="custom"]')
      ) {
        return;
      }

      // Check if a specific haptic already fired recently (within 120ms)
      if (Date.now() - getLastHapticTime() < 120) {
        return;
      }

      hapticTick();
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  return null;
}
