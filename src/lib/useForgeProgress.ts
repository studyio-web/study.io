'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useStudy } from '../context/StudyContext';
import { TimerMode, PomodoroPhase } from '../types';

export const FORGE_CYCLE_MINUTES = 60; // 1 hour for full forge cycle in stopwatch
export const POMODORO_BASE_BREAK_FLOOR = 0.5;
export const POMODORO_SET_FLOORS = [0, 0.5, 0.6, 0.7, 0.8] as const;

export type ForgeStatus = 'idle' | 'running' | 'paused' | 'break' | 'complete';

export type PomodoroPhaseType = 'work' | 'shortBreak' | 'longBreak' | 'break';

export interface ComputeForgeInput {
  mode: TimerMode;
  isStudying: boolean;
  isPaused: boolean;
  elapsedFocusSeconds: number;
  plannedDuration: number;
  pomodoroPhase?: PomodoroPhaseType | PomodoroPhase;
  completedPomodoroSets?: number;
  isCountdownCompleted?: boolean;
}

export interface ForgeState {
  forge: number;
  status: ForgeStatus;
  hourCycle?: number;
  shouldPlayHourFlare?: boolean;
}

/**
 * Pure calculation function for Forge progress and status.
 * Used by useForgeProgress and directly in unit tests.
 */
export function computeForgeState(input: ComputeForgeInput): ForgeState {
  const {
    mode,
    isStudying,
    isPaused,
    elapsedFocusSeconds,
    plannedDuration,
    pomodoroPhase = 'work',
    completedPomodoroSets = 0,
    isCountdownCompleted = false,
  } = input;

  // 1. Idle state (no active session)
  if (!isStudying && !isCountdownCompleted) {
    return {
      forge: 0,
      status: 'idle',
      hourCycle: 0,
      shouldPlayHourFlare: false,
    };
  }

  // 2. Countdown Mode
  if (mode === 'countdown') {
    const target = Math.max(1, plannedDuration);
    const rawForge = target > 0 ? Math.min(1, Math.max(0, elapsedFocusSeconds / target)) : 0;
    const isFinished = isCountdownCompleted || elapsedFocusSeconds >= target;
    const forge = isFinished ? 1 : rawForge;

    let status: ForgeStatus = 'running';
    if (isFinished) {
      status = 'complete';
    } else if (isPaused) {
      status = 'paused';
    } else if (isStudying) {
      status = 'running';
    } else {
      status = 'idle';
    }

    return { forge, status };
  }

  // 3. Pomodoro Mode
  if (mode === 'pomodoro') {
    const isBreakPhase =
      pomodoroPhase === 'shortBreak' ||
      pomodoroPhase === 'longBreak' ||
      (pomodoroPhase as string) === 'break';

    if (isBreakPhase) {
      // During break: badge cools down smoothly to 0.5 over the break duration
      const breakTarget = Math.max(1, plannedDuration);
      const breakFraction = Math.min(1, Math.max(0, elapsedFocusSeconds / breakTarget));
      const forge = Math.max(POMODORO_BASE_BREAK_FLOOR, 1.0 - (1.0 - POMODORO_BASE_BREAK_FLOOR) * breakFraction);

      return {
        forge,
        status: isPaused ? 'paused' : 'break',
      };
    } else {
      // Work/Focus phase: forge rises from the floor of completed sets up to 1.0
      const workTarget = Math.max(1, plannedDuration);
      const phaseProgress = Math.min(1, Math.max(0, elapsedFocusSeconds / workTarget));

      // Rising floor: set 0 -> 0, set 1 -> 0.5, set 2 -> 0.6, set 3 -> 0.7, set 4+ -> 0.8
      const floorIdx = Math.min(completedPomodoroSets, POMODORO_SET_FLOORS.length - 1);
      const floor = POMODORO_SET_FLOORS[floorIdx] ?? 0;

      const forge = Math.min(1, floor + (1 - floor) * phaseProgress);
      const isComplete = phaseProgress >= 1;

      let status: ForgeStatus = 'running';
      if (isComplete) {
        status = 'complete';
      } else if (isPaused) {
        status = 'paused';
      } else if (isStudying) {
        status = 'running';
      } else {
        status = 'idle';
      }

      return { forge, status };
    }
  }

  // 4. Stopwatch Mode (no pre-set end)
  const cycleSeconds = FORGE_CYCLE_MINUTES * 60;
  const rawForge = Math.min(1, Math.max(0, elapsedFocusSeconds / cycleSeconds));
  const hourCycle = Math.floor(elapsedFocusSeconds / cycleSeconds);
  const secondsIntoCurrentHour = elapsedFocusSeconds % cycleSeconds;
  // A small flare plays during the first 3 seconds of entering a new hour past the 1st cycle
  const shouldPlayHourFlare = hourCycle >= 1 && secondsIntoCurrentHour <= 3 && isStudying && !isPaused;

  let status: ForgeStatus = 'running';
  if (isPaused) {
    status = 'paused';
  } else if (!isStudying) {
    status = 'idle';
  } else if (elapsedFocusSeconds >= cycleSeconds && hourCycle >= 1 && secondsIntoCurrentHour === 0) {
    status = 'complete';
  } else {
    status = 'running';
  }

  return {
    forge: rawForge,
    status,
    hourCycle,
    shouldPlayHourFlare,
  };
}

/**
 * Hook to drive Forge progress directly from the authoritative timer store.
 * Updates once per second with timestamp reconciliation, pauses when tab is hidden,
 * and preserves instant rehydration on reload.
 */
export function useForgeProgress(): ForgeState {
  const {
    timerMode,
    isStudying,
    isPaused,
    elapsedSeconds,
    countdownTarget,
    pomodoroPhase,
    pomodoroWorkDuration,
    pomodoroBreakDuration,
    pomodoroCompletedPhase,
  } = useStudy();

  // Completed sets count for Pomodoro: track transitions from work -> break
  const [completedPomodoroSets, setCompletedPomodoroSets] = useState<number>(0);
  const prevPhaseRef = useRef<PomodoroPhase>(pomodoroPhase);

  useEffect(() => {
    if (timerMode !== 'pomodoro') {
      setCompletedPomodoroSets(0);
      return;
    }
    // Increment set count when work completes and enters a break
    if (prevPhaseRef.current === 'work' && (pomodoroPhase === 'shortBreak' || pomodoroPhase === 'longBreak')) {
      setCompletedPomodoroSets((prev) => prev + 1);
    }
    prevPhaseRef.current = pomodoroPhase;
  }, [timerMode, pomodoroPhase]);

  const plannedDuration = useMemo(() => {
    if (timerMode === 'countdown') return countdownTarget;
    if (timerMode === 'pomodoro') {
      return pomodoroPhase === 'work' ? pomodoroWorkDuration : pomodoroBreakDuration;
    }
    return FORGE_CYCLE_MINUTES * 60;
  }, [timerMode, countdownTarget, pomodoroPhase, pomodoroWorkDuration, pomodoroBreakDuration]);

  // Derive initial state immediately so restoring after reload shows correct forge at once
  const [forgeState, setForgeState] = useState<ForgeState>(() =>
    computeForgeState({
      mode: timerMode,
      isStudying,
      isPaused,
      elapsedFocusSeconds: elapsedSeconds,
      plannedDuration,
      pomodoroPhase,
      completedPomodoroSets,
    })
  );

  const lastElapsedRef = useRef(elapsedSeconds);
  lastElapsedRef.current = elapsedSeconds;

  useEffect(() => {
    // 1. Immediate sync when inputs change
    const nextState = computeForgeState({
      mode: timerMode,
      isStudying,
      isPaused,
      elapsedFocusSeconds: elapsedSeconds,
      plannedDuration,
      pomodoroPhase,
      completedPomodoroSets,
    });
    setForgeState(nextState);

    // 2. Pause updates when page is hidden; recompute instantly when visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setForgeState(
          computeForgeState({
            mode: timerMode,
            isStudying,
            isPaused,
            elapsedFocusSeconds: lastElapsedRef.current,
            plannedDuration,
            pomodoroPhase,
            completedPomodoroSets,
          })
        );
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    timerMode,
    isStudying,
    isPaused,
    elapsedSeconds,
    plannedDuration,
    pomodoroPhase,
    completedPomodoroSets,
  ]);

  return forgeState;
}
