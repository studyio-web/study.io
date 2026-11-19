'use client';

import React, { useState, useEffect } from 'react';
import { BellRing, BellOff, Clock, Coffee, Play, Sparkles, ShieldAlert } from 'lucide-react';
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
  onSnooze,
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

    // Periodic haptic vibration every 2.5 seconds to simulate real alarm
    const hapticInterval = setInterval(() => {
      triggerHaptic('heavy');
    }, 2500);

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

  const title = (() => {
    if (isUltraStrict) return 'ULTRA LOCKDOWN COMPLETE';
    if (mode === 'countdown') return "TIME'S UP!";
    if (phase === 'work') return 'FOCUS BLOCK COMPLETE!';
    return 'BREAK TIME OVER!';
  })();

  const subtitle = (() => {
    if (isUltraStrict) {
      return 'Lockdown ended. All blocked apps have been unlocked.';
    }
    if (mode === 'countdown') {
      return 'Your scheduled countdown session has finished.';
    }
    if (phase === 'work') {
      return 'Great focus! Ready to take a well-deserved break?';
    }
    return 'Break finished! Ready to jump into your next focus block?';
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-modal-title"
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200"
    >
      {/* Background ambient glow pulse */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[320px] h-[320px] sm:w-[420px] sm:h-[420px] rounded-full bg-amber-500/15 blur-3xl animate-pulse" />
      </div>

      <div className="relative w-full max-w-sm rounded-3xl bg-[var(--surface,#121214)] border border-amber-500/35 p-6 shadow-[0_0_50px_rgba(245,158,11,0.25)] text-[var(--text,#fff)] text-center animate-in zoom-in-95 duration-150">
        {/* Pulsing Alarm Icon Badge */}
        <div className="relative w-20 h-20 rounded-3xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(245,158,11,0.35)] animate-bounce">
          {isUltraStrict ? (
            <ShieldAlert className="w-10 h-10 text-amber-400" />
          ) : (
            <BellRing className="w-10 h-10 text-amber-400 animate-pulse" />
          )}
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500" />
          </span>
        </div>

        {/* Title */}
        <h2 id="alarm-modal-title" className="font-hud text-xl font-bold tracking-wider text-white">
          {title}
        </h2>

        {/* Subject Chip (if present) */}
        {subjectName && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-xs text-white/90 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate max-w-[180px]">{subjectName}</span>
          </div>
        )}

        {/* Subtitle Description */}
        <p className="mt-2 text-xs text-white/70 leading-relaxed max-w-xs mx-auto">
          {subtitle}
        </p>

        {/* Auto-silence countdown badge */}
        <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] font-mono text-amber-300/90">
          <Clock className="w-3 h-3 text-amber-400 shrink-0" />
          <span>Auto-silences in {formatAlarmRemaining(secondsRemaining)}</span>
        </div>

        {/* Primary Action Button: STOP ALARM */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('heavy');
              onDismiss();
            }}
            className="w-full h-14 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-hud font-bold text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(245,158,11,0.4)] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <BellOff className="w-5 h-5" />
            <span>STOP ALARM</span>
          </button>

          {/* Contextual Secondary Action Button */}
          {mode === 'countdown' && onSnooze && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onSnooze();
              }}
              className="w-full h-10 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white/80 font-mono text-xs uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-white/60" />
              <span>Snooze (+5 min)</span>
            </button>
          )}

          {mode === 'pomodoro' && phase === 'work' && onStartBreak && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onStartBreak();
              }}
              className="w-full h-10 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 font-mono text-xs uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
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
              className="w-full h-10 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 font-mono text-xs uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
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
