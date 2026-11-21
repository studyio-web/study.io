import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeForgeState,
  FORGE_CYCLE_MINUTES,
  POMODORO_BASE_BREAK_FLOOR,
  POMODORO_SET_FLOORS,
} from '../src/lib/useForgeProgress';

describe('Forge Badge Progress & State Machine Specification', () => {
  it('1. Idle state: returns forge 0 and status idle when no session is active', () => {
    const state = computeForgeState({
      mode: 'countdown',
      isStudying: false,
      isPaused: false,
      elapsedFocusSeconds: 0,
      plannedDuration: 1500,
    });

    assert.equal(state.forge, 0);
    assert.equal(state.status, 'idle');
  });

  describe('2. Countdown Mode Specification', () => {
    it('countdown at 0 percent: forge is 0, status is running', () => {
      const state = computeForgeState({
        mode: 'countdown',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 0,
        plannedDuration: 1800, // 30 min
      });

      assert.equal(state.forge, 0);
      assert.equal(state.status, 'running');
    });

    it('countdown at 50 percent: forge is exactly 0.5', () => {
      const state = computeForgeState({
        mode: 'countdown',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 900,
        plannedDuration: 1800,
      });

      assert.equal(state.forge, 0.5);
      assert.equal(state.status, 'running');
    });

    it('countdown at 100 percent: forge is 1.0, status is complete', () => {
      const state = computeForgeState({
        mode: 'countdown',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 1800,
        plannedDuration: 1800,
      });

      assert.equal(state.forge, 1.0);
      assert.equal(state.status, 'complete');
    });

    it('countdown ending exactly at the boundary or past it: clamps forge to 1.0, status is complete', () => {
      const state = computeForgeState({
        mode: 'countdown',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 1805,
        plannedDuration: 1800,
      });

      assert.equal(state.forge, 1.0);
      assert.equal(state.status, 'complete');
    });
  });

  describe('3. Pomodoro Focus, Break & Rising Floor Specification', () => {
    it('first Pomodoro focus (set 0): forge goes from 0 to 1.0 across work duration', () => {
      // Start of focus
      const start = computeForgeState({
        mode: 'pomodoro',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 0,
        plannedDuration: 1500, // 25 min
        pomodoroPhase: 'work',
        completedPomodoroSets: 0,
      });
      assert.equal(start.forge, 0);
      assert.equal(start.status, 'running');

      // Halfway through focus
      const mid = computeForgeState({
        mode: 'pomodoro',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 750,
        plannedDuration: 1500,
        pomodoroPhase: 'work',
        completedPomodoroSets: 0,
      });
      assert.equal(mid.forge, 0.5);
      assert.equal(mid.status, 'running');

      // End of focus
      const end = computeForgeState({
        mode: 'pomodoro',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 1500,
        plannedDuration: 1500,
        pomodoroPhase: 'work',
        completedPomodoroSets: 0,
      });
      assert.equal(end.forge, 1.0);
      assert.equal(end.status, 'complete');
    });

    it('break phase: badge slowly cools down to 0.5 over the break duration with status break', () => {
      // Break start (elapsed 0): forge starts hot at 1.0
      const breakStart = computeForgeState({
        mode: 'pomodoro',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 0,
        plannedDuration: 300, // 5 min break
        pomodoroPhase: 'break',
        completedPomodoroSets: 1,
      });
      assert.equal(breakStart.forge, 1.0);
      assert.equal(breakStart.status, 'break');

      // Break mid (elapsed 150s): forge eases halfway between 1.0 and 0.5 (0.75)
      const breakMid = computeForgeState({
        mode: 'pomodoro',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 150,
        plannedDuration: 300,
        pomodoroPhase: 'break',
        completedPomodoroSets: 1,
      });
      assert.equal(breakMid.forge, 0.75);
      assert.equal(breakMid.status, 'break');

      // Break end (elapsed 300s): cools down to the 0.5 floor
      const breakEnd = computeForgeState({
        mode: 'pomodoro',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 300,
        plannedDuration: 300,
        pomodoroPhase: 'break',
        completedPomodoroSets: 1,
      });
      assert.equal(breakEnd.forge, POMODORO_BASE_BREAK_FLOOR);
      assert.equal(breakEnd.status, 'break');
    });

    it('subsequent focus phases: floor rises after each completed set (0.5 -> 0.6 -> 0.7 -> 0.8)', () => {
      // Set 1 (after 1 completed set): starts at floor 0.5
      const set1Start = computeForgeState({
        mode: 'pomodoro',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 0,
        plannedDuration: 1500,
        pomodoroPhase: 'work',
        completedPomodoroSets: 1,
      });
      assert.equal(set1Start.forge, 0.5);

      // Set 1 mid: 0.5 + (1 - 0.5) * 0.5 = 0.75
      const set1Mid = computeForgeState({
        mode: 'pomodoro',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 750,
        plannedDuration: 1500,
        pomodoroPhase: 'work',
        completedPomodoroSets: 1,
      });
      assert.equal(set1Mid.forge, 0.75);

      // Set 2: starts at floor 0.6
      const set2Start = computeForgeState({
        mode: 'pomodoro',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 0,
        plannedDuration: 1500,
        pomodoroPhase: 'work',
        completedPomodoroSets: 2,
      });
      assert.equal(set2Start.forge, 0.6);

      // Set 3: starts at floor 0.7
      const set3Start = computeForgeState({
        mode: 'pomodoro',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 0,
        plannedDuration: 1500,
        pomodoroPhase: 'work',
        completedPomodoroSets: 3,
      });
      assert.equal(set3Start.forge, 0.7);

      // Set 4+: capped at floor 0.8
      const set4Start = computeForgeState({
        mode: 'pomodoro',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 0,
        plannedDuration: 1500,
        pomodoroPhase: 'work',
        completedPomodoroSets: 4,
      });
      assert.equal(set4Start.forge, 0.8);
    });
  });

  describe('4. Stopwatch Mode Specification (60-minute cycle & hourly flares)', () => {
    it('stopwatch at 30 minutes: forge is 0.5', () => {
      const state = computeForgeState({
        mode: 'stopwatch',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 30 * 60, // 1800s
        plannedDuration: FORGE_CYCLE_MINUTES * 60,
      });

      assert.equal(state.forge, 0.5);
      assert.equal(state.status, 'running');
    });

    it('stopwatch at 60 minutes: forge reaches 1.0 and marks complete/flare', () => {
      const state = computeForgeState({
        mode: 'stopwatch',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 60 * 60, // 3600s
        plannedDuration: FORGE_CYCLE_MINUTES * 60,
      });

      assert.equal(state.forge, 1.0);
      assert.equal(state.status, 'complete');
      assert.equal(state.shouldPlayHourFlare, true);
    });

    it('stopwatch at 61 minutes: badge stays fully forged at 1.0 and keeps running', () => {
      const state = computeForgeState({
        mode: 'stopwatch',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 61 * 60, // 3660s
        plannedDuration: FORGE_CYCLE_MINUTES * 60,
      });

      assert.equal(state.forge, 1.0);
      assert.equal(state.status, 'running');
    });
  });

  describe('5. Pause, Resume & Refresh Preservation', () => {
    it('pause freezes forge at current value and sets status to paused', () => {
      const runningState = computeForgeState({
        mode: 'countdown',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 600,
        plannedDuration: 1800,
      });
      assert.equal(runningState.forge, 600 / 1800);
      assert.equal(runningState.status, 'running');

      const pausedState = computeForgeState({
        mode: 'countdown',
        isStudying: true,
        isPaused: true,
        elapsedFocusSeconds: 600,
        plannedDuration: 1800,
      });
      assert.equal(pausedState.forge, 600 / 1800);
      assert.equal(pausedState.status, 'paused');
    });

    it('resuming restores forge progression from the frozen value', () => {
      const resumedState = computeForgeState({
        mode: 'countdown',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 601,
        plannedDuration: 1800,
      });
      assert.equal(resumedState.forge, 601 / 1800);
      assert.equal(resumedState.status, 'running');
    });

    it('reloading/refreshing mid-session instantly evaluates correct forge from restored elapsed time', () => {
      // Simulates cold reload 15 minutes into a 45-minute countdown
      const rehydratedState = computeForgeState({
        mode: 'countdown',
        isStudying: true,
        isPaused: false,
        elapsedFocusSeconds: 15 * 60,
        plannedDuration: 45 * 60,
      });
      assert.equal(rehydratedState.forge, 15 / 45);
      assert.equal(rehydratedState.status, 'running');
    });

    it('guarantees forge monotonically increases during active focus and never goes backward', () => {
      let previousForge = -1;
      for (let s = 0; s <= 3600; s += 300) {
        const state = computeForgeState({
          mode: 'stopwatch',
          isStudying: true,
          isPaused: false,
          elapsedFocusSeconds: s,
          plannedDuration: 3600,
        });
        assert.ok(
          state.forge >= previousForge,
          `Expected forge ${state.forge} at ${s}s to be >= previous ${previousForge}`
        );
        previousForge = state.forge;
      }
    });
  });
});
