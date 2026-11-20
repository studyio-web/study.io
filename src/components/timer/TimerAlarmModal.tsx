'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, ShieldCheck, Clock, Coffee, Plus, ChevronRight, BellOff, Sparkles } from 'lucide-react';
import { triggerHaptic } from '../../lib/native-feel';
import { ALARM_MAX_DURATION_SECONDS, formatAlarmRemaining } from '../../lib/timerAlarm';
import { getRankTier, getNextTier } from '../../lib/ranks';
import { calculateSessionRP } from '../../lib/rankedSystem';
import { TimerNotification, isNativeAndroid } from '../../lib/timerNotificationPlugin';

export interface TimerAlarmModalProps {
  isOpen: boolean;
  mode: 'countdown' | 'pomodoro';
  phase?: 'work' | 'break';
  isUltraStrict?: boolean;
  subjectName?: string;
  focusedDurationSeconds?: number;
  seasonRp?: number;
  onDismiss: () => void;
  onSnooze?: () => void;
  onSave?: () => void;
  onStartBreak?: () => void;
  onStartFocus?: () => void;
}

function formatDurationFocused(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);

  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m focused` : `${hours}h focused`;
  }
  const displayMins = Math.max(1, mins);
  return `${displayMins}m focused`;
}

export function TimerAlarmModal({
  isOpen,
  mode,
  phase = 'work',
  isUltraStrict = false,
  subjectName,
  focusedDurationSeconds = 0,
  seasonRp = 0,
  onDismiss,
  onSnooze,
  onSave,
  onStartBreak,
  onStartFocus,
}: TimerAlarmModalProps) {
  const [mounted, setMounted] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(ALARM_MAX_DURATION_SECONDS);
  const [elapsedRinging, setElapsedRinging] = useState<number>(0);
  const [isCompletedSlide, setIsCompletedSlide] = useState(false);
  const [sliderDragX, setSliderDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const startDragXRef = useRef<number>(0);
  const currentDragXRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);

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

  // Web Screen Wake Lock API while alarm screen is open
  useEffect(() => {
    if (!isOpen || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let released = false;
    async function requestWakeLock() {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
        // Wake lock may fail if low battery or background tab
      }
    }

    requestWakeLock();

    return () => {
      released = true;
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isOpen]);

  // Reset state on open & tick down until auto-silence (5 minutes)
  useEffect(() => {
    if (!isOpen) {
      setSecondsRemaining(ALARM_MAX_DURATION_SECONDS);
      setElapsedRinging(0);
      setIsCompletedSlide(false);
      setSliderDragX(0);
      return;
    }

    setSecondsRemaining(ALARM_MAX_DURATION_SECONDS);
    setElapsedRinging(0);
    setIsCompletedSlide(false);
    setSliderDragX(0);

    // Initial and periodic gentle haptic pulse
    triggerHaptic('medium');
    const hapticInterval = setInterval(() => {
      triggerHaptic('light');
    }, 3600);

    const timer = setInterval(() => {
      setElapsedRinging((prev) => prev + 1);
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          clearInterval(hapticInterval);
          handleStopAlarm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      clearInterval(hapticInterval);
    };
  }, [isOpen]);

  const handleStopAlarm = useCallback(() => {
    triggerHaptic('heavy');
    // If native Android, instruct native plugin to stop native AlarmService
    if (isNativeAndroid()) {
      TimerNotification.stop().catch(() => {});
    }
    onDismiss();
  }, [onDismiss]);

  // Slide-To-Stop Drag Logic (Touch & Pointer events)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isCompletedSlide) return;
    setIsDragging(true);
    startDragXRef.current = e.clientX - currentDragXRef.current;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || isCompletedSlide || !sliderTrackRef.current) return;
    const trackWidth = sliderTrackRef.current.clientWidth;
    const knobWidth = 56;
    const maxDrag = Math.max(1, trackWidth - knobWidth - 8);

    let nextX = e.clientX - startDragXRef.current;
    if (nextX < 0) nextX = 0;
    if (nextX > maxDrag) nextX = maxDrag;

    currentDragXRef.current = nextX;
    setSliderDragX(nextX);

    // If dragged >= 85% of track width: trigger stop completion
    if (nextX >= maxDrag * 0.85) {
      setIsCompletedSlide(true);
      setIsDragging(false);
      setSliderDragX(maxDrag);
      triggerHaptic('heavy');

      setTimeout(() => {
        handleStopAlarm();
      }, 350);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || isCompletedSlide) return;
    setIsDragging(false);
    // Snap back to 0 if not completed
    currentDragXRef.current = 0;
    setSliderDragX(0);
  };

  // Color scheme: warm amber for focus completion, cool teal for break completion
  const isBreakPhase = mode === 'pomodoro' && phase === 'break';
  const accentColor = isBreakPhase ? '#14b8a6' : '#f59e0b'; // teal-500 vs amber-500

  // Escalation: subtle glow increase over the first 20 seconds (0.25 to 0.45)
  const escalationProgress = Math.min(1.0, elapsedRinging / 20);
  const baseGlowOpacity = 0.25 + 0.20 * escalationProgress;

  // Rank and RP calculations
  const isEligibleForRP = !isBreakPhase && focusedDurationSeconds >= 60;
  const gainedRP = useMemo(() => {
    if (!isEligibleForRP) return 0;
    return calculateSessionRP(focusedDurationSeconds).totalGained;
  }, [isEligibleForRP, focusedDurationSeconds]);

  const currentTier = useMemo(() => getRankTier(seasonRp), [seasonRp]);
  const nextTier = useMemo(() => getNextTier(currentTier.name), [currentTier.name]);

  const rankProgress = useMemo(() => {
    if (!nextTier) return null;
    const range = Math.max(1, currentTier.maxRp - currentTier.minRp);
    const progress = Math.max(0, seasonRp - currentTier.minRp);
    const percent = Math.min(100, Math.max(0, (progress / range) * 100));
    return {
      currentRp: seasonRp,
      targetRp: currentTier.maxRp,
      nextTierName: nextTier.name,
      percent,
    };
  }, [currentTier, nextTier, seasonRp]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Timer Complete Alarm"
      className="fixed inset-0 z-[150] w-screen h-dvh bg-[#05070B] text-white flex flex-col justify-between overflow-hidden select-none"
      style={{
        paddingTop: 'max(1.25rem, env(safe-area-inset-top, 1.25rem))',
        paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 1.25rem))',
        paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 1.5rem))',
        paddingRight: 'max(1.5rem, env(safe-area-inset-right, 1.5rem))',
      }}
    >
      <style>{`
        @keyframes alarmGlowBreathe {
          0%, 100% { transform: scale(0.95); opacity: ${baseGlowOpacity}; }
          50% { transform: scale(1.15); opacity: ${baseGlowOpacity + 0.15}; }
        }
        @keyframes alarmBellWobble {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(-8deg); }
          40% { transform: rotate(8deg); }
          60% { transform: rotate(-6deg); }
          80% { transform: rotate(6deg); }
        }
        @keyframes alarmWaveRipple1 {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes alarmWaveRipple2 {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(3.0); opacity: 0; }
        }
        .alarm-glow-breathe {
          animation: ${prefersReducedMotion ? 'none' : 'alarmGlowBreathe 4s ease-in-out infinite'};
        }
        .alarm-bell-wobble {
          animation: ${prefersReducedMotion ? 'none' : 'alarmBellWobble 2s ease-in-out infinite'};
        }
        .alarm-ripple-1 {
          animation: ${prefersReducedMotion ? 'none' : 'alarmWaveRipple1 3.2s cubic-bezier(0.2, 0.8, 0.2, 1) infinite'};
        }
        .alarm-ripple-2 {
          animation: ${prefersReducedMotion ? 'none' : 'alarmWaveRipple2 3.2s cubic-bezier(0.2, 0.8, 0.2, 1) infinite 0.9s'};
        }
      `}</style>

      {/* Large Soft Breathing Radial Glow behind content */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div
          className="alarm-glow-breathe w-[min(520px,95vw)] h-[min(520px,95vw)] rounded-full blur-[110px]"
          style={{
            background: `radial-gradient(circle, ${accentColor} 0%, transparent 70%)`,
          }}
        />
      </div>

      {/* TOP BAR: Status Chip */}
      <div className="relative z-10 w-full flex items-center justify-center pt-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md shadow-sm">
          {isUltraStrict ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-amber-300/90 tracking-wide">
                Lockdown lifted
              </span>
            </>
          ) : isBreakPhase ? (
            <>
              <Coffee className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-xs font-medium text-teal-300/90 tracking-wide">
                Break finished
              </span>
            </>
          ) : (
            <>
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-amber-300/90 tracking-wide">
                Focus target reached
              </span>
            </>
          )}
        </div>
      </div>

      {/* CENTER HERO: Bell with Expanding Ripples, Title & Big Stats */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto px-2 max-w-md mx-auto w-full">
        {/* Animated Bell Hero with Ripples */}
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center mb-6">
          {/* Wave Ripple 1 */}
          <div
            className="alarm-ripple-1 absolute w-24 h-24 rounded-full border pointer-events-none"
            style={{ borderColor: accentColor }}
          />
          {/* Wave Ripple 2 */}
          <div
            className="alarm-ripple-2 absolute w-24 h-24 rounded-full border pointer-events-none"
            style={{ borderColor: accentColor }}
          />

          {/* Central Bell Container */}
          <div
            className="alarm-bell-wobble relative w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center shadow-2xl border"
            style={{
              backgroundColor: isBreakPhase ? 'rgba(20, 184, 166, 0.14)' : 'rgba(245, 158, 11, 0.14)',
              borderColor: isBreakPhase ? 'rgba(20, 184, 166, 0.35)' : 'rgba(245, 158, 11, 0.35)',
              boxShadow: `0 0 45px ${isBreakPhase ? 'rgba(20, 184, 166, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
            }}
          >
            {isBreakPhase ? (
              <Coffee className="w-10 h-10 sm:w-12 sm:h-12 text-teal-300 stroke-[1.8]" />
            ) : (
              <Bell className="w-10 h-10 sm:w-12 sm:h-12 text-amber-400 stroke-[1.8]" />
            )}
          </div>
        </div>

        {/* Display Title */}
        <h1 className="font-hud text-4xl sm:text-5xl font-black tracking-tight text-white mb-2 leading-none">
          {isBreakPhase ? 'Break over' : "Time's up"}
        </h1>

        {/* Subject Chip (if available) */}
        {subjectName ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs font-mono text-zinc-300 mb-5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: accentColor }}
            />
            <span className="truncate max-w-[220px]">{subjectName}</span>
          </div>
        ) : (
          <div className="mb-4" />
        )}

        {/* Big Stat Line */}
        {!isBreakPhase ? (
          <div className="w-full flex flex-col items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 sm:p-5 backdrop-blur-sm">
            {/* Focused duration in tabular numerals */}
            <div className="text-2xl sm:text-3xl font-mono tabular-nums font-bold text-white tracking-tight">
              {formatDurationFocused(focusedDurationSeconds)}
            </div>

            {/* RP Reward chip */}
            {isEligibleForRP && gainedRP > 0 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>+{gainedRP} RP</span>
              </div>
            )}

            {/* Rank Progress Bar to Next Tier */}
            {rankProgress && (
              <div className="w-full mt-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-1.5">
                  <span>{rankProgress.currentRp} RP</span>
                  <span>{rankProgress.targetRp} to {rankProgress.nextTierName}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${rankProgress.percent}%`,
                      backgroundColor: accentColor,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm font-mono text-zinc-400 max-w-xs">
            Ready to jump back into your next focus block?
          </p>
        )}
      </div>

      {/* BOTTOM ACTION CONTROLS */}
      <div className="relative z-10 w-full max-w-md mx-auto flex flex-col items-center gap-4 pb-2">
        {/* Slide-to-Stop Control */}
        <div
          ref={sliderTrackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative w-full h-14 sm:h-16 rounded-full bg-white/[0.07] border border-white/15 p-1 flex items-center overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none shadow-lg"
          style={{
            boxShadow: `0 0 24px ${isCompletedSlide ? accentColor : 'transparent'}`,
          }}
        >
          {/* Draggable Progress Fill */}
          <div
            className="absolute left-0 top-0 bottom-0 rounded-full transition-colors"
            style={{
              width: `${sliderDragX + 56}px`,
              backgroundColor: isCompletedSlide
                ? accentColor
                : isBreakPhase
                ? 'rgba(20, 184, 166, 0.22)'
                : 'rgba(245, 158, 11, 0.22)',
            }}
          />

          {/* Centered Track Label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className="text-xs sm:text-sm font-mono font-bold uppercase tracking-wider text-white/70 transition-opacity"
              style={{
                opacity: Math.max(0.1, 1 - sliderDragX / 140),
              }}
            >
              {isCompletedSlide ? 'Alarm stopped' : 'Slide to stop'}
            </span>
          </div>

          {/* Draggable Knob */}
          <div
            className="relative z-10 w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-transform shadow-md"
            style={{
              transform: `translateX(${sliderDragX}px)`,
              backgroundColor: isCompletedSlide ? '#ffffff' : accentColor,
              color: isCompletedSlide ? accentColor : '#000000',
              transition: isDragging ? 'none' : 'transform 0.25s ease-out',
            }}
          >
            {isCompletedSlide ? (
              <Check className="w-6 h-6 stroke-[3] animate-in zoom-in" />
            ) : (
              <ChevronRight className="w-6 h-6 stroke-[2.75]" />
            )}
          </div>
        </div>

        {/* Accessible Keyboard / Screen-Reader Stop Button */}
        <button
          type="button"
          onClick={handleStopAlarm}
          aria-label="Stop alarm"
          className="sr-only focus:not-sr-only focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-lg focus:font-bold focus:z-50"
        >
          Stop alarm
        </button>

        {/* Secondary Actions: +5 min (Snooze) & Save & continue */}
        <div className="w-full flex items-center justify-around px-2 text-xs font-mono">
          {onSnooze && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                handleStopAlarm();
                onSnooze();
              }}
              className="px-4 py-2 rounded-full text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+5 min</span>
            </button>
          )}

          {isBreakPhase && onStartFocus && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                handleStopAlarm();
                onStartFocus();
              }}
              className="px-4 py-2 rounded-full text-teal-300 hover:text-teal-200 bg-teal-500/10 hover:bg-teal-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>Start Focus Round</span>
            </button>
          )}

          {!isBreakPhase && onSave && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                handleStopAlarm();
                onSave();
              }}
              className="px-4 py-2 rounded-full text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Save &amp; continue</span>
            </button>
          )}

          {!isBreakPhase && onStartBreak && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                handleStopAlarm();
                onStartBreak();
              }}
              className="px-4 py-2 rounded-full text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>Take a Break</span>
            </button>
          )}
        </div>

        {/* Auto-silence Draining Progress Line & Caption */}
        <div className="w-full flex flex-col items-center gap-1 mt-1">
          <div className="w-full h-1 bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${(secondsRemaining / ALARM_MAX_DURATION_SECONDS) * 100}%`,
                backgroundColor: accentColor,
              }}
            />
          </div>
          <span className="text-[11px] font-mono text-zinc-400">
            Silences in {formatAlarmRemaining(secondsRemaining)}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
