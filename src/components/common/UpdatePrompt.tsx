'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

export function UpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setShowPrompt(true);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setShowPrompt(true);
          }
        });
      });
    });
  }, []);

  const handleReload = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  if (!showPrompt) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full bg-[var(--surface,#18181b)] border border-emerald-500/30 text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-xs font-medium text-white/90">Update available</span>
      </div>
      <button
        type="button"
        onClick={handleReload}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold cursor-pointer active:scale-95 transition-all"
      >
        <RefreshCw className="w-3 h-3 animate-spin" />
        <span>Reload</span>
      </button>
    </div>
  );
}
