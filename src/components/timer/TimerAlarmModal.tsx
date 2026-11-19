'use client';

import React, { useState, useEffect } from 'react';
import { BellOff, Coffee, Play, CheckCircle2, ShieldCheck } from 'lucide-react';
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

    // Periodic gentle haptic pulse matching acoustic chime cadence (3.2s)
    const hapticInterval = setInterval(() => {
      triggerHaptic('medium');
    }, 3200);

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
    if (isUltraStrict) return 'ULTRA LOCKDOWN PROTOCOL';
    if (mode === 'countdown') return 'COUNTDOWN TIMER';
    if (phase === 'work') return 'FOCUS SESSION';
    return 'BREAK PERIOD';
  })();

  const title = (() => {
    if (isUltraStrict) return 'Session Complete';
    if (mode === 'countdown') return 'Time is Up';
    if (phase === 'work') return 'Focus Complete';
    return 'Break Finished';
  })();

  const subtitle = (() => {
    if (isUltraStrict) {
      return 'Lockdown lifted. Your session is ready to save.';
    }
    if (mode === 'countdown') {
      return 'Your focus target has been reached.';
    }
    if (phase === 'work') {
      return 'Time for a quick break or your next focus round.';
    }
    return 'Ready to start your next focus block?';
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-modal-title"
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-[#050507]/90 backdrop-blur-2xl animate-in fade-in duration-200"
    >
      {/* Dynamic Ambient Spatial Halo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div
          className={`w-[360px] h-[360px] sm:w-[500px] sm:h-[500px] rounded-full blur-[120px] opacity-40 animate-pulse ${
            isUltraStrict ? 'bg-red-500/20' : 'bg-emerald-500/15'
          }`}
          style={{ animationDuration: '3.2s' }}
        />
      </div>

      {/* Main Glass Shell */}
      <div
        className={`relative w-full max-w-sm rounded-[32px] bg-[#0A0D14]/95 border p-7 sm:p-8 text-center animate-in zoom-in-95 duration-150 overflow-hidden ${
          isUltraStrict
            ? 'border-red-500/30 shadow-[0_20px_60px_rgba(239,68,68,0.25)]'
            : 'border-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.85)]'
        }`}
      >
        {/* Subtle Top Accent Highlight */}
        <div
          className={`absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent ${
            isUltraStrict ? 'via-red-500/50' : 'via-emerald-400/40'
          } to-transparent`}
        />

        {/* Hero Completion Ring & Dial */}
        <div className="relative w-24 h-24 mx-auto mb-5 flex items-center justify-center">
          {/* Breathing ambient ring */}
          <div
            className={`absolute inset-0 rounded-full border animate-ping opacity-30 ${
              isUltraStrict ? 'border-red-500' : 'border-emerald-400'
            }`}
            style={{ animationDuration: '3.2s' }}
          />
          {/* Static frosted ring */}
          <div
            className={`absolute -inset-2 rounded-full border ${
              isUltraStrict ? 'border-red-500/15' : 'border-emerald-500/15'
            }`}
          />
          {/* Core circular HUD emblem */}
          <div
            className={`relative w-24 h-24 rounded-full border flex flex-col items-center justify-center shadow-lg transition-transform ${
              isUltraStrict
                ? 'bg-red-500/10 border-red-500/35 text-red-400 shadow-[0_0_30px_rgba(239,68,68,0.25)]'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]'
            }`}
          >
            {isUltraStrict ? (
              <ShieldCheck className="w-10 h-10 text-red-400 stroke-[1.75]" />
            ) : (
              <CheckCircle2 className="w-10 h-10 text-emerald-400 stroke-[1.75]" />
            )}
            <span className="text-[10px] font-mono tracking-wider text-white/50 mt-0.5">00:00</span>
          </div>
        </div>

        {/* Minimalist Monospace Category Tag */}
        <div className="flex items-center justify-center gap-1.5 mb-2">
          <span
            className={`w-1.5 h-1.5 rounded-full animate-ping ${
              isUltraStrict ? 'bg-red-400' : 'bg-emerald-400'
            }`}
          />
          <p
            className={`text-[10px] font-mono uppercase tracking-[0.22em] font-semibold ${
              isUltraStrict ? 'text-red-400/90' : 'text-emerald-400/90'
            }`}
          >
            {categoryLabel}
          </p>
        </div>

        {/* Clean Modern Title */}
        <h2 id="alarm-modal-title" className="font-hud text-3xl font-bold tracking-tight text-white mb-2">
          {title}
        </h2>

        {/* Subject Badge */}
        {subjectName && (
          <div className="mb-2.5 inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-white/90">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isUltraStrict ? 'bg-red-400' : 'bg-emerald-400'
              }`}
            />
            <span className="font-medium truncate max-w-[200px]">{subjectName}</span>
          </div>
        )}

        {/* Subtitle Description */}
        <p className="text-xs text-white/60 leading-relaxed max-w-[260px] mx-auto mb-5">
          {subtitle}
        </p>

        {/* Auto-silence Countdown Indicator */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-[11px] font-mono text-white/50 mb-6">
          <span
            className={`w-1.5 h-1.5 rounded-full animate-pulse ${
              isUltraStrict ? 'bg-red-400' : 'bg-emerald-400'
            }`}
          />
          <span>Auto-silences in {formatAlarmRemaining(secondsRemaining)}</span>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-2.5">
          {/* Primary Dismiss Button */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('heavy');
              onDismiss();
            }}
            className={`w-full h-13 rounded-2xl font-hud font-bold text-sm uppercase tracking-wider active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer ${
              isUltraStrict
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.4)]'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_28px_rgba(16,185,129,0.35)]'
            }`}
          >
            <BellOff className="w-4 h-4 stroke-[2.5]" />
            <span>Stop Alarm</span>
          </button>

          {/* Pomodoro Transitions */}
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
