'use client';

import React, { useState, useEffect } from 'react';
import { BellRing, BellOff, Coffee, Play, ShieldAlert } from 'lucide-react';
import { triggerHaptic } from '../../lib/native-feel';
import { ALARM_MAX_DURATION_SECONDS, formatAlarmRemaining } from '../../lib/timerAlarm';

interface TimerAlarmModalProps {
  isOpen: boolean;
  mode: 'countdown' | 'pomodoro';
  phase?: 'work' | 'break';
  isUltraStrict?: boolean;
  subjectName?: string;
  onDismiss: () => void;
  onSnooze?: () => void;
  onStartBreak?: () => void;
  onStartFocus?: () => void;
}

export function TimerAlarmModal({
  isOpen,
  mode,
  phase = 'work',
  isUltraStrict = false,
  subjectName,
  onDismiss,
  onStartBreak,
  onStartFocus,
}: TimerAlarmModalProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(ALARM_MAX_DURATION_SECONDS);

  // Reset timer on open & tick down until auto-silence (5 minutes)
  useEffect(() => {
    if (!isOpen) {
      setSecondsRemaining(ALARM_MAX_DURATION_SECONDS);
      return;
    }

    setSecondsRemaining(ALARM_MAX_DURATION_SECONDS);

    // Periodic gentle haptic pulse every 2.8s matching acoustic chime cadence
    const hapticInterval = setInterval(() => {
      triggerHaptic('medium');
    }, 2800);

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      clearInterval(hapticInterval);
    };
  }, [isOpen, onDismiss]);

  if (!isOpen) return null;

  const categoryLabel = (() => {
    if (isUltraStrict) return 'LOCKDOWN COMPLETE';
    if (mode === 'countdown') return 'COUNTDOWN FINISHED';
    if (phase === 'work') return 'FOCUS SESSION COMPLETED';
    return 'BREAK PERIOD COMPLETED';
  })();

  const title = (() => {
    if (isUltraStrict) return 'ULTRA LOCKDOWN COMPLETE';
    if (mode === 'countdown') return "TIME'S UP!";
    if (phase === 'work') return 'FOCUS BLOCK COMPLETE!';
    return 'BREAK TIME OVER!';
  })();

  const subtitle = (() => {
    if (isUltraStrict) {
      return 'Lockdown lifted. All blocked apps are now unlocked.';
    }
    if (mode === 'countdown') {
      return 'Your scheduled countdown session has finished.';
    }
    if (phase === 'work') {
      return 'Great focus! Take a break or start your next round.';
    }
    return 'Break finished! Ready to jump into your next focus block?';
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-modal-title"
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-200"
    >
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[320px] h-[320px] sm:w-[440px] sm:h-[440px] rounded-full bg-emerald-500/10 blur-[100px] animate-pulse" />
      </div>

      <div className="relative w-full max-w-sm rounded-[32px] bg-[#0E121A]/95 border border-white/[0.08] p-7 shadow-[0_25px_60px_rgba(0,0,0,0.85)] text-white text-center animate-in zoom-in-95 duration-150 overflow-hidden">
        {/* Subtle top highlight gradient border */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

        {/* Pulsing Concentric Radar Alarm Orb */}
        <div className="relative w-20 h-20 mx-auto mb-4 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border border-emerald-500/25 animate-ping opacity-60"
            style={{ animationDuration: '2.8s' }}
          />
          <div className="absolute -inset-1.5 rounded-full border border-emerald-500/20" />
          <div className="relative w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.2)]">
            {isUltraStrict ? (
              <ShieldAlert className="w-9 h-9 text-emerald-400" />
            ) : (
              <BellRing className="w-8 h-8 text-emerald-400 animate-pulse" />
            )}
          </div>
        </div>

        {/* Category tracker overline badge */}
        <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-emerald-400/90 font-semibold mb-1.5">
          {categoryLabel}
        </p>

        {/* Main Title */}
        <h2 id="alarm-modal-title" className="font-hud text-2xl font-bold tracking-tight text-white mb-2">
          {title}
        </h2>

        {/* Clean Subject Chip (No sparkle symbol) */}
        {subjectName && (
          <div className="mb-2.5 inline-flex items-center px-3.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-white/85 font-medium">
            <span className="truncate max-w-[200px]">{subjectName}</span>
          </div>
        )}

        {/* Subtitle Description */}
        <p className="text-xs text-white/60 leading-relaxed max-w-[260px] mx-auto mb-4">
          {subtitle}
        </p>

        {/* Auto-silence countdown badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[11px] font-mono text-white/50 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Auto-silences in {formatAlarmRemaining(secondsRemaining)}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          {/* Primary Action Button: STOP ALARM */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('heavy');
              onDismiss();
            }}
            className="w-full h-13 rounded-2xl bg-white hover:bg-slate-100 text-black font-hud font-bold text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(255,255,255,0.15)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <BellOff className="w-4 h-4 stroke-[2.5]" />
            <span>Stop Alarm</span>
          </button>

          {/* Pomodoro Action Buttons (if in pomodoro mode) */}
          {mode === 'pomodoro' && phase === 'work' && onStartBreak && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onStartBreak();
              }}
              className="w-full h-11 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-emerald-400 font-mono text-xs uppercase tracking-wider active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>Start Break</span>
            </button>
          )}

          {mode === 'pomodoro' && phase === 'break' && onStartFocus && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onStartFocus();
              }}
              className="w-full h-11 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-emerald-400 font-mono text-xs uppercase tracking-wider active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Focus Round</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
