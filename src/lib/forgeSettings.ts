'use client';

import { useState, useEffect, useCallback } from 'react';

export const FORGE_BADGE_STORAGE_KEY = 'studyio_forge_badge_enabled';
export const FORGE_BADGE_EVENT = 'studyio_forge_badge_changed';

/**
 * Loads whether the Forge Badge animation is enabled (defaulting to true).
 */
export function loadForgeBadgeEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem(FORGE_BADGE_STORAGE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

/**
 * Persists whether the Forge Badge animation is enabled.
 */
export function saveForgeBadgeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FORGE_BADGE_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(FORGE_BADGE_EVENT, { detail: { enabled } }));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook to read and toggle Forge Badge setting reactively across components.
 */
export function useForgeBadgeSetting(): [boolean, (val: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(loadForgeBadgeEnabled);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === FORGE_BADGE_STORAGE_KEY) {
        setEnabledState(e.newValue === null ? true : e.newValue === 'true');
      }
    };

    const handleCustom = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.enabled === 'boolean') {
        setEnabledState(customEvent.detail.enabled);
      } else {
        setEnabledState(loadForgeBadgeEnabled());
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(FORGE_BADGE_EVENT, handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(FORGE_BADGE_EVENT, handleCustom);
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    saveForgeBadgeEnabled(next);
  }, []);

  return [enabled, setEnabled];
}
