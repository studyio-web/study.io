'use client';

import React from 'react';
import { PomodoroPreset } from '../../types';

interface BezelTick {
  index: number;
  isMajor: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Pre-computed 60 ticks geometry for 300x300 viewBox
const BEZEL_TICKS: BezelTick[] = Array.from({ length: 60 }, (_, i) => {
  const angle = (i * 6 - 90) * (Math.PI / 180);
  const isMajor = i % 5 === 0;
  const rOuter = 144;
  const rInner = isMajor ? 134 : 139;
  return {
    index: i,
    isMajor,
    x1: 150 + rOuter * Math.cos(angle),
    y1: 150 + rOuter * Math.sin(angle),
    x2: 150 + rInner * Math.cos(angle),
    y2: 150 + rInner * Math.sin(angle),
  };
});

// Memoized Bezel tick marks - Static geometry, only colors update with litCount
const Bezel = React.memo(function Bezel({ litCount }: { litCount: number }) {
  return (
    <g className="pointer-events-none select-none">
      {BEZEL_TICKS.map((tick) => {
        const isLit = tick.index < litCount;
        return (
          <line
            key={tick.index}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke={isLit ? 'var(--accent)' : tick.isMajor ? 'rgb(var(--fg) / 0.45)' : 'rgb(var(--fg) / 0.28)'}
            strokeWidth={tick.isMajor ? 1.75 : 1}
            strokeLinecap="round"
            className="transition-colors duration-200"
          />
        );
      })}
    </g>
  );
});
Bezel.displayName = 'Bezel';

// Memoized soft ambient radial glow behind the dial (accent at about 8-10% opacity, very large, blurred)
export const AmbientGlow = React.memo(function AmbientGlow({ isRunning }: { isRunning: boolean }) {
  return (
    <div
      className={`absolute inset-0 -z-10 pointer-events-none transition-opacity duration-300 ${
        isRunning ? 'opacity-100' : 'opacity-70'
      }`}
      style={{
        display: 'var(--dial-glow-display, block)',
        background:
          'radial-gradient(circle at 50% 50%, var(--accent-soft) 0%, rgb(var(--fg) / 0.02) 45%, transparent 70%)',
        filter: 'blur(50px)',
      }}
    />
  );
});
AmbientGlow.displayName = 'AmbientGlow';

interface TimerDialProps {
  displayTime: string;
  ringPercent: number;
  litCount: number;
  statusText: string;
  subjectName?: string;
  isRunning: boolean;
  isPaused: boolean;
  isStudying: boolean;
  shouldReduceMotion?: boolean;
  timerMode: 'stopwatch' | 'countdown' | 'pomodoro';
  onStartCountdownEdit?: () => void;
  pomodoroPreset?: PomodoroPreset;
  onSelectPomodoroPreset?: (preset: PomodoroPreset) => void;
}

const RADIUS = 124;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const TimerDial = React.memo(function TimerDial({
  displayTime,
  ringPercent,
  litCount,
  statusText,
  subjectName,
  isRunning,
  isPaused,
  isStudying,
  shouldReduceMotion = false,
  timerMode,
  onStartCountdownEdit,
  pomodoroPreset,
  onSelectPomodoroPreset,
}: TimerDialProps) {
  const safePercent = Math.max(0, Math.min(100, ringPercent || 0));
  const strokeDashoffset = CIRCUMFERENCE - (safePercent / 100) * CIRCUMFERENCE;

  return (
    <div className="timer-dial-container relative flex items-center justify-center aspect-square mx-auto select-none my-auto">
      <style>{`
        @keyframes timerDotPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .timer-status-pulse {
          animation: timerDotPulse 2s ease-in-out infinite;
        }
      `}</style>

      {/* Soft Ambient Radial Glow */}
      <AmbientGlow isRunning={isRunning} />

      {/* SVG Bezel and Progress Arc */}
      <svg
        viewBox="0 0 300 300"
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
      >
        {/* 60-tick watch bezel */}
        <Bezel litCount={litCount} />

        {/* 2px Faint Background Track (fg at 14%) */}
        <circle
          cx="150"
          cy="150"
          r={RADIUS}
          fill="none"
          stroke="rgb(var(--fg) / 0.14)"
          strokeWidth="2"
        />

        {/* 3px Accent Arc with 1s linear transition (rendered only when active progress > 0) */}
        {safePercent > 0 && (
          <circle
            cx="150"
            cy="150"
            r={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 150 150)"
            style={{
              transition: shouldReduceMotion ? 'none' : 'stroke-dashoffset 1s linear',
              filter: 'drop-shadow(0 0 4px var(--accent-glow))',
            }}
          />
        )}
      </svg>

      {/* 1. Centre Timer Digits: Locked to exact dead-center of the dial circle */}
      <div className="timer-dial-center-digits">
        <div className="timer-dial-digits font-mono tabular-nums font-bold text-[var(--text)] tracking-tight leading-none text-center select-none">
          {timerMode === 'countdown' && !isStudying ? (
            <button
              type="button"
              onClick={onStartCountdownEdit}
              className="cursor-pointer hover:text-[var(--accent)] transition-colors pointer-events-auto font-mono tabular-nums inline-block text-center"
              title="Click to edit duration"
            >
              {displayTime}
            </button>
          ) : (
            <span className="font-mono tabular-nums inline-block text-center">{displayTime}</span>
          )}
        </div>
      </div>

      {/* 2. Top Info Stack: Subject name above center (if provided) */}
      {subjectName ? (
        <div className="timer-dial-top-info">
          <span
            className="text-[13px] font-mono text-[var(--text-dim)] truncate max-w-[200px] min-h-[16px] tracking-tight pointer-events-auto"
            title={subjectName}
          >
            {subjectName}
          </span>
        </div>
      ) : null}

      {/* 3. Bottom Info Stack: Status & Presets below center */}
      <div className="timer-dial-bottom-info">
        {/* Pomodoro Presets inside the Dial (clean, zero layout shift) */}
        {timerMode === 'pomodoro' && !isStudying && (
          <div className="inline-flex items-center p-0.5 mb-1.5 rounded-full bg-fg/[0.05] border border-fg/[0.1] shadow-xs pointer-events-auto z-20">
            {(['25/5', '50/10'] as const).map((preset) => {
              const isActive = pomodoroPreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onSelectPomodoroPreset?.(preset)}
                  className={`px-2.5 py-0.5 text-xs font-mono rounded-full transition-all cursor-pointer ${
                    isActive
                      ? "bg-fg/[0.12] [[data-theme='paper']_&]:bg-[var(--surface)] border border-fg/20 [[data-theme='paper']_&]:border-[var(--border-strong)] text-[var(--text)] font-semibold shadow-xs"
                      : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-fg/[0.05] border border-transparent'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        )}

        {/* Status Line in sentence case */}
        <div className="flex items-center justify-center gap-1.5">
          {isRunning && !shouldReduceMotion && (
            <span className="w-1.5 h-1.5 rounded-full timer-status-pulse bg-emerald-400 shrink-0" />
          )}
          <span
            className={`text-xs font-mono font-medium ${
              statusText === 'Completed' ? 'text-emerald-400' : 'text-[var(--text-dim)]'
            }`}
          >
            {statusText}
          </span>
        </div>
      </div>
    </div>
  );
});
TimerDial.displayName = 'TimerDial';
