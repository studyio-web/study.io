'use client';

import { useEffect } from 'react';

/**
 * Global Fullscreen Enforcer:
 * Listens for the user's pointerdown / touchstart interactions anywhere in the app
 * and triggers document.documentElement.requestFullscreen({ navigationUI: 'hide' })
 * whenever !document.fullscreenElement (wrapped in a silent try/catch).
 */
export function FullscreenEnforcer() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const requestFullscreenSafe = async () => {
      if (document.fullscreenElement) return;

      try {
        const docEl = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
          mozRequestFullScreen?: () => Promise<void>;
          msRequestFullscreen?: () => Promise<void>;
        };

        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          await docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
        }
      } catch {
        // Silently swallow errors on unsupported browsers or permission policies
      }
    };

    const handleInteraction = () => {
      if (!document.fullscreenElement) {
        requestFullscreenSafe();
      }
    };

    window.addEventListener('pointerdown', handleInteraction, { passive: true });
    window.addEventListener('touchstart', handleInteraction, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  return null;
}
