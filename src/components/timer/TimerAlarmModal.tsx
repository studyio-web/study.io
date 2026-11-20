'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, ChevronRight } from 'lucide-react';
import { triggerHaptic } from '../../lib/native-feel';
import { ALARM_MAX_DURATION_SECONDS } from '../../lib/timerAlarm';
import { TimerNotification, isNativeAndroid } from '../../lib/timerNotificationPlugin';

export interface TimerAlarmModalProps {
  isOpen: boolean;
  mode: 'countdown' | 'pomodoro';
  phase?: 'work' | 'break';
  isUltraStrict?: boolean;
  subjectName?: string;
  focusedDurationSeconds?: number;
  seasonRp?: number;
  initialSecondsRemaining?: number;
  onDismiss: () => void;
  onSnooze?: () => void;
  onSave?: () => void;
  onStartBreak?: () => void;
  onStartFocus?: () => void;
}

function formatAutoSilenceTime(seconds: number): string {
  const safeSec = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function TimerAlarmModal({
  isOpen,
  mode,
  phase = 'work',
  subjectName,
  initialSecondsRemaining,
  onDismiss,
}: TimerAlarmModalProps) {
  const [mounted, setMounted] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(initialSecondsRemaining ?? ALARM_MAX_DURATION_SECONDS);
  const [isCompletedSlide, setIsCompletedSlide] = useState(false);
  const [sliderDragX, setSliderDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const startDragXRef = useRef<number>(0);
  const currentDragXRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);

  // Initialize clock and reduced motion query
  useEffect(() => {
    setMounted(true);
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      );
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);

    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener?.('change', listener);
      return () => {
        clearInterval(clockInterval);
        mediaQuery.removeEventListener?.('change', listener);
      };
    }

    return () => clearInterval(clockInterval);
  }, []);

  // Web Screen Wake Lock API while alarm screen is open
  useEffect(() => {
    if (!isOpen || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    async function requestWakeLock() {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {
        // Wake lock may fail if battery saver is active or tab is hidden
      }
    }

    requestWakeLock();

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isOpen]);

  const handleStopAlarm = useCallback(() => {
    triggerHaptic('heavy');
    // If native Android, instruct native plugin to stop native AlarmService
    if (isNativeAndroid()) {
      TimerNotification.stopAlarm().catch(() => {});
      TimerNotification.stop().catch(() => {});
    }
    onDismiss();
  }, [onDismiss]);

  // Reset state on open & tick down until auto-silence (5 minutes)
  useEffect(() => {
    if (!isOpen) {
      setSecondsRemaining(initialSecondsRemaining ?? ALARM_MAX_DURATION_SECONDS);
      setIsCompletedSlide(false);
      setSliderDragX(0);
      return;
    }

    setSecondsRemaining(initialSecondsRemaining ?? ALARM_MAX_DURATION_SECONDS);
    setIsCompletedSlide(false);
    setSliderDragX(0);

    // Initial and periodic gentle haptic pulse
    triggerHaptic('medium');
    const hapticInterval = setInterval(() => {
      triggerHaptic('light');
    }, 3600);

    const timer = setInterval(() => {
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
  }, [isOpen, handleStopAlarm]);

  // Slide-To-Stop Drag Logic
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isCompletedSlide) return;
    setIsDragging(true);
    startDragXRef.current = e.clientX - currentDragXRef.current;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || isCompletedSlide || !sliderTrackRef.current) return;
    const trackWidth = sliderTrackRef.current.clientWidth;
    const knobWidth = 52;
    const maxDrag = Math.max(1, trackWidth - knobWidth - 12);

    let nextX = e.clientX - startDragXRef.current;
    if (nextX < 0) nextX = 0;
    if (nextX > maxDrag) nextX = maxDrag;

    currentDragXRef.current = nextX;
    setSliderDragX(nextX);

    // If dragged >= 85% of track width: trigger stop completion with light haptic
    if (nextX >= maxDrag * 0.85) {
      setIsCompletedSlide(true);
      setIsDragging(false);
      setSliderDragX(maxDrag);
      triggerHaptic('light');

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

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const sliderMaxDrag = sliderTrackRef.current
    ? Math.max(1, sliderTrackRef.current.clientWidth - 52 - 12)
    : 200;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Timer Complete Alarm"
      className="fixed inset-0 z-[150] w-screen h-dvh bg-[#0A0A0B] text-white flex flex-col justify-between overflow-hidden select-none"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top, 1.5rem))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))',
        paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 1.5rem))',
        paddingRight: 'max(1.5rem, env(safe-area-inset-right, 1.5rem))',
      }}
    >
      <style>{`
        @keyframes alarmGlowBreathe {
          0%, 100% {
            opacity: 0.25;
            transform: scale(0.95);
          }
          50% {
            opacity: 0.40;
            transform: scale(1.10);
          }
        }
        @keyframes alarmBellWobble {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(-8deg); }
          40% { transform: rotate(8deg); }
          60% { transform: rotate(-4deg); }
          80% { transform: rotate(4deg); }
        }
        @keyframes alarmWaveRipple1 {
          0% { transform: scale(0.9); opacity: 0.45; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes alarmWaveRipple2 {
          0% { transform: scale(0.9); opacity: 0.30; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes labelShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .alarm-glow-breathe {
          animation: ${prefersReducedMotion ? 'none' : 'alarmGlowBreathe 5s ease-in-out infinite'};
          opacity: ${prefersReducedMotion ? 0.30 : undefined};
        }
        .alarm-bell-wobble {
          animation: ${prefersReducedMotion ? 'none' : 'alarmBellWobble 2s ease-in-out infinite'};
        }
        .alarm-ripple-1 {
          display: ${prefersReducedMotion ? 'none' : 'block'};
          animation: alarmWaveRipple1 3.5s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        }
        .alarm-ripple-2 {
          display: ${prefersReducedMotion ? 'none' : 'block'};
          animation: alarmWaveRipple2 3.5s cubic-bezier(0.2, 0.8, 0.2, 1) infinite 1.1s;
        }
        .shimmer-label {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.45) 0%,
            rgba(255, 255, 255, 0.95) 50%,
            rgba(255, 255, 255, 0.45) 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: labelShimmer 2.8s infinite linear;
        }
      `}</style>

      {/* Large Soft Breathing Radial Glow (no hard rings, cards or boxes) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div
          className="alarm-glow-breathe w-[min(560px,95vw)] h-[min(560px,95vw)] rounded-full blur-[120px]"
          style={{
            background: `radial-gradient(circle, ${accentColor} 0%, transparent 70%)`,
          }}
        />
      </div>

      {/* TOP: Current Time & Small "Alarm" Label */}
      <div className="relative z-10 w-full flex flex-col items-center justify-center pt-2">
        <span className="font-mono tabular-nums text-[18px] text-white/60 font-medium tracking-tight">
          {currentTimeStr}
        </span>
        <div className="flex items-center gap-1.5 text-xs text-white/40 mt-0.5">
          <Bell className="w-3.5 h-3.5 stroke-[1.5]" />
          <span>Alarm</span>
        </div>
      </div>

      {/* CENTER: One large bell icon (80px), 2 soft ripple waves, Title & Subject Name */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto px-6 max-w-md mx-auto w-full">
        {/* Bell with 2 soft expanding ripples */}
        <div className="relative w-28 h-28 flex items-center justify-center">
          {/* Ripple 1 */}
          <div
            className="alarm-ripple-1 absolute w-20 h-20 rounded-full border pointer-events-none"
            style={{ borderColor: accentColor }}
          />
          {/* Ripple 2 */}
          <div
            className="alarm-ripple-2 absolute w-20 h-20 rounded-full border pointer-events-none"
            style={{ borderColor: accentColor }}
          />

          {/* Central Bell */}
          <div className="alarm-bell-wobble relative flex items-center justify-center">
            <Bell
              className="w-20 h-20 stroke-[1.25]"
              style={{ color: accentColor }}
            />
          </div>
        </div>

        {/* Display Title */}
        <h1 className="text-4xl sm:text-[44px] font-bold tracking-tight text-white leading-none mt-7 mb-2">
          {isBreakPhase ? 'Break over' : "Time's up"}
        </h1>

        {/* Subject Name as plain text with colored dot (no pill or border) */}
        {subjectName && (
          <div className="flex items-center gap-2 text-base text-white/60 mt-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: accentColor }}
            />
            <span className="truncate max-w-[280px]">{subjectName}</span>
          </div>
        )}
      </div>

      {/* BOTTOM: Slide-to-stop pill & Quiet Auto-silence Caption */}
      <div className="relative z-10 w-full max-w-md mx-auto flex flex-col items-center pb-2">
        {/* Slide-to-Stop Pill */}
        <div
          ref={sliderTrackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative w-full h-16 rounded-full bg-white/[0.06] border border-white/10 p-1.5 flex items-center overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none backdrop-blur-md"
        >
          {/* Draggable Progress Fill */}
          <div
            className="absolute left-0 top-0 bottom-0 rounded-full transition-colors"
            style={{
              width: `${sliderDragX + 52}px`,
              backgroundColor: isCompletedSlide
                ? accentColor
                : isBreakPhase
                ? 'rgba(20, 184, 166, 0.20)'
                : 'rgba(245, 158, 11, 0.20)',
            }}
          />

          {/* Centered Track Label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className={`text-base font-normal tracking-normal transition-opacity ${
                prefersReducedMotion ? 'text-white/50' : 'shimmer-label'
              }`}
              style={{
                opacity: Math.max(0, 1 - (sliderDragX / (sliderMaxDrag || 100)) * 1.5),
              }}
            >
              {isCompletedSlide ? 'Alarm stopped' : 'Slide to stop'}
            </span>
          </div>

          {/* Draggable Knob */}
          <div
            className="relative z-10 w-[52px] h-[52px] rounded-full flex items-center justify-center transition-transform shadow-md"
            style={{
              transform: `translateX(${sliderDragX}px)`,
              backgroundColor: isCompletedSlide ? '#ffffff' : accentColor,
              color: isCompletedSlide ? accentColor : '#0A0A0B',
              transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1)',
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

        {/* Quiet Auto-silence caption */}
        <p className="text-[13px] text-white/40 mt-3.5 font-normal select-none">
          Silences automatically in {formatAutoSilenceTime(secondsRemaining)}
        </p>
      </div>
    </div>,
    document.body
  );
}
