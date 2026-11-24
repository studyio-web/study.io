'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Bell, Clock, Sparkles } from 'lucide-react';

type TimerMode = 'pomodoro' | 'stopwatch' | 'countdown';

export function TimerEngineSection() {
  const [mode, setMode] = useState<TimerMode>('pomodoro');
  const [isRunning, setIsRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60); // 25:00
  const [totalSeconds, setTotalSeconds] = useState(25 * 60);
  const [pomoPhase, setPomoPhase] = useState<'focus' | 'break'>('focus');
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [activeSubject, setActiveSubject] = useState('Calculus');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const subjects = ['Calculus', 'Data Structures', 'Organic Chem', 'Modern History'];

  // Switch modes
  const handleSelectMode = (newMode: TimerMode) => {
    setIsRunning(false);
    setMode(newMode);
    if (newMode === 'pomodoro') {
      setPomoPhase('focus');
      setSecondsLeft(25 * 60);
      setTotalSeconds(25 * 60);
    } else if (newMode === 'countdown') {
      setSecondsLeft(45 * 60);
      setTotalSeconds(45 * 60);
    } else {
      setStopwatchSeconds(0);
    }
  };

  // Run timer
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        if (mode === 'stopwatch') {
          setStopwatchSeconds((prev) => prev + 1);
        } else {
          setSecondsLeft((prev) => {
            if (prev <= 1) {
              if (mode === 'pomodoro') {
                if (pomoPhase === 'focus') {
                  setPomoPhase('break');
                  setTotalSeconds(5 * 60);
                  return 5 * 60;
                } else {
                  setPomoPhase('focus');
                  setTotalSeconds(25 * 60);
                  return 25 * 60;
                }
              }
              setIsRunning(false);
              return 0;
            }
            return prev - 1;
          });
        }
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, mode, pomoPhase]);

  // Reset
  const handleReset = () => {
    setIsRunning(false);
    if (mode === 'pomodoro') {
      setSecondsLeft(pomoPhase === 'focus' ? 25 * 60 : 5 * 60);
    } else if (mode === 'countdown') {
      setSecondsLeft(45 * 60);
    } else {
      setStopwatchSeconds(0);
    }
  };

  // Formatted digits
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Radial calculation (Circumference = 2 * PI * 88 = 552.92)
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  let strokeDashoffset = 0;
  if (mode === 'stopwatch') {
    // 60-second cycling loop for stopwatch
    const progress = (stopwatchSeconds % 60) / 60;
    strokeDashoffset = circumference * (1 - progress);
  } else {
    const progress = totalSeconds > 0 ? (totalSeconds - secondsLeft) / totalSeconds : 0;
    strokeDashoffset = circumference * progress;
  }

  return (
    <section id="timer" className="py-24 px-4 sm:px-6 max-w-6xl mx-auto relative">
      {/* Subtle section glow */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-emerald-500/[0.04] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 text-xs font-mono uppercase tracking-wider mb-3">
          <Clock className="w-3.5 h-3.5" />
          <span>Section 01 • Precision Engine</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-hud font-bold text-white tracking-tight">
          Three Dedicated Timers. <br />
          <span className="text-slate-400 font-sans font-semibold text-2xl sm:text-3xl">
            Zero distracting gimmicks.
          </span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans leading-relaxed">
          Switch seamlessly between infinite Stopwatch, countdowns up to 24 hours, and structured Pomodoro intervals with audible alarms.
        </p>
      </div>

      {/* Main Interactive Demo Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Interactive Running Demo Canvas */}
        <div className="lg:col-span-7 flex justify-center">
          <div className="w-full max-w-md rounded-[32px] bg-[#0C0F17] border border-white/10 p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.85)] relative overflow-hidden">
            {/* Ambient Glass Highlight */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            {/* Mode Selector Tabs */}
            <div className="flex items-center justify-between p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08] mb-8">
              {(['pomodoro', 'stopwatch', 'countdown'] as TimerMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSelectMode(m)}
                  className={`flex-1 py-2 rounded-xl text-xs font-hud font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    mode === m
                      ? 'bg-white text-[#07090E] shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Dial with Radial Progress */}
            <div className="relative w-64 h-64 mx-auto my-4 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                {/* Background Ring Track */}
                <circle
                  cx="100"
                  cy="100"
                  r={radius}
                  stroke="rgba(255, 255, 255, 0.06)"
                  strokeWidth="8"
                  fill="none"
                />
                {/* Active Arc */}
                <circle
                  cx="100"
                  cy="100"
                  r={radius}
                  stroke={mode === 'pomodoro' && pomoPhase === 'break' ? '#38BDF8' : '#FFFFFF'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  fill="none"
                  className="transition-[stroke-dashoffset] duration-700 ease-linear"
                />
              </svg>

              {/* Digits & Phase in Center */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-4xl sm:text-5xl font-hud font-bold tracking-wider text-white">
                  {mode === 'stopwatch' ? formatTime(stopwatchSeconds) : formatTime(secondsLeft)}
                </span>
                <span className="text-xs font-mono font-medium text-slate-400 tracking-widest uppercase mt-2">
                  {mode === 'pomodoro'
                    ? pomoPhase === 'focus'
                      ? 'Deep Focus (25m)'
                      : 'Rest Interval (5m)'
                    : mode === 'stopwatch'
                    ? 'Active Stopwatch'
                    : 'Target Countdown'}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{activeSubject}</span>
                </span>
              </div>
            </div>

            {/* Interactive Subject Chips */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 my-6">
              {subjects.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setActiveSubject(sub)}
                  className={`px-3 py-1 rounded-full text-xs font-sans transition-all cursor-pointer ${
                    activeSubject === sub
                      ? 'bg-white/15 border border-white/30 text-white font-medium'
                      : 'bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>

            {/* Timer Controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setIsRunning(!isRunning)}
                className="flex-1 py-3.5 rounded-2xl bg-white text-[#07090E] font-hud font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg hover:bg-slate-100 transition-all cursor-pointer active:scale-[0.98]"
              >
                {isRunning ? (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    <span>Pause Session</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                    <span>Start Session</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="p-3.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-slate-300 hover:text-white transition-all cursor-pointer active:scale-[0.98]"
                aria-label="Reset Timer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Feature Highlights & Real App Logic */}
        <div className="lg:col-span-5 space-y-6 text-left">
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-2">
            <div className="flex items-center gap-2.5 text-white font-hud font-bold text-base">
              <span className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-xs">
                01
              </span>
              <span>Pomodoro Cycles</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
              Configurable 25m focus and 5m break phases. Automatic interval cycling keeps your mind sharp without manual resets.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-2">
            <div className="flex items-center gap-2.5 text-white font-hud font-bold text-base">
              <span className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-xs">
                02
              </span>
              <span>24-Hour Countdown</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
              Set target study periods from 1 minute up to 24 consecutive hours. Ultra Strict mode seals the countdown until zero.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-2">
            <div className="flex items-center gap-2.5 text-white font-hud font-bold text-base">
              <span className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-xs">
                <Bell className="w-3.5 h-3.5 text-amber-400" />
              </span>
              <span>Audible Alarms & Chimes</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
              Distinct finish chimes play through headphones or device speakers when intervals complete, even with screen locked.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
