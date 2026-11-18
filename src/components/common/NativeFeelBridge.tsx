'use client';

import { useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { initNativeAndroidBridge, updateNativeStatusBar } from '../../lib/native-feel';
import { useTheme, DEFAULT_THEME } from '../../context/ThemeContext';

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

    // Dismiss any previously queued app update notifications
    if (Capacitor.isNativePlatform()) {
      LocalNotifications.cancel({ notifications: [{ id: 7777 }] }).catch(() => {});
    }

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

  return null;
}
