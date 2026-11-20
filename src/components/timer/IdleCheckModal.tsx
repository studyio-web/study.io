'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, ShieldAlert, Play } from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { soundFx } from '../../lib/audio';
import { triggerHaptic } from '../../lib/native-feel';

export function IdleCheckModal() {
  const { isIdleCheckActive, confirmIdleCheck } = useStudy();
  const [mounted, setMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener?.('change', listener);
      return () => mediaQuery.removeEventListener?.('change', listener);
    }
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isIdleCheckActive) {
      triggerHaptic('heavy');
      soundFx.playAlarm?.();
      interval = setInterval(() => {
        soundFx.playAlarm?.();
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isIdleCheckActive]);

  if (!isIdleCheckActive || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="4-Hour Inactivity Check"
      className="fixed inset-0 z-[150] w-screen h-dvh bg-[#05070B] text-white flex flex-col justify-between overflow-hidden select-none"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top, 1.5rem))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))',
        paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 1.5rem))',
        paddingRight: 'max(1.5rem, env(safe-area-inset-right, 1.5rem))',
      }}
    >
      <style>{`
        @keyframes idleGlowBreathe {
          0%, 100% { transform: scale(0.95); opacity: 0.30; }
          50% { transform: scale(1.15); opacity: 0.45; }
        }
        .idle-glow-breathe {
          animation: ${prefersReducedMotion ? 'none' : 'idleGlowBreathe 4s ease-in-out infinite'};
        }
      `}</style>

      {/* Soft Breathing Radial Glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div
          className="idle-glow-breathe w-[min(500px,95vw)] h-[min(500px,95vw)] rounded-full blur-[110px]"
          style={{
            background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)',
          }}
        />
      </div>

      {/* TOP BAR: Quiet Status Chip */}
      <div className="relative z-10 w-full flex items-center justify-center pt-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md shadow-sm">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-medium text-amber-300/90 tracking-wide">
            Timer auto-paused
          </span>
        </div>
      </div>

      {/* CENTER HERO: Icon & Inactivity Notice */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto px-4 max-w-md mx-auto w-full">
        {/* Amber Emblem */}
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(245,158,11,0.25)]">
          <Clock className="w-10 h-10 sm:w-12 sm:h-12 text-amber-400 stroke-[1.8]" />
        </div>

        <h1 className="font-hud text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
          Still studying?
        </h1>

        <p className="text-sm font-mono text-zinc-400 leading-relaxed max-w-sm mb-6">
          You have been studying for 4 hours continuously. The timer was paused automatically to ensure your focus stats and rank RP stay accurate.
        </p>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-zinc-300">
          <span>Tap below to confirm you are here and resume</span>
        </div>
      </div>

      {/* BOTTOM ACTION: Resume Button */}
      <div className="relative z-10 w-full max-w-md mx-auto flex flex-col items-center pb-2">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('heavy');
            confirmIdleCheck();
          }}
          className="w-full h-14 sm:h-16 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-[0.98] transition-all font-mono font-bold text-sm sm:text-base uppercase tracking-wider text-black flex items-center justify-center gap-2.5 shadow-[0_0_30px_rgba(245,158,11,0.35)] cursor-pointer"
        >
          <Play className="w-5 h-5 fill-current stroke-[2.5]" />
          <span>Yes, I'm still here! (Resume)</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
