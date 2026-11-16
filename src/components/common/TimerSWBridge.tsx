'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useStudy } from '../../context/StudyContext';
import { useServiceWorker } from '../../hooks/useServiceWorker';
import { TimerNotification, isNativeAndroid } from '../../lib/timerNotificationPlugin';
import { requestNotificationPermission } from '../../lib/notifications';

/**
 * Detect touchscreen/mobile devices via the `pointer: coarse` media query.
 * Returns true on phones/tablets, false on laptops/desktops with a mouse.
 * Evaluated once at module load — device type doesn't change at runtime.
 */
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)
  );
}

const IS_MOBILE = isMobileDevice();

/**
 * TimerSWBridge — invisible component that bridges StudyContext timer state
 * to the Service Worker (Web) and Native Foreground Service (Android Capacitor)
 * for persistent background tracking, chronometer display, and push notifications.
 *
 * Mount this once inside StudyProvider (via Providers).
 */
export function TimerSWBridge() {
  const {
    isStudying,
    isPaused,
    isRunning,
    elapsedSeconds,
    selectedSubject,
    timerMode,
    countdownTarget,
    pomodoroWorkDuration,
    pomodoroBreakDuration,
    pomodoroPhase,
    startTimeRef,
    pauseTimer,
    resumeTimer,
    stopTimer,
  } = useStudy();

  // Handle SW → page messages (Pause / Resume buttons in notification) on Web
  const handleSWMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type === 'SW_PAUSE_TIMER') {
      pauseTimer();
    } else if (event.data?.type === 'SW_RESUME_TIMER') {
      resumeTimer();
    }
  }, [pauseTimer, resumeTimer]);

  const { postToSW, requestNotificationPermission: requestSWPermission } = useServiceWorker(handleSWMessage);

  // Track previous running state to detect transitions
  const prevRunningRef = useRef(false);
  const prevStudyingRef = useRef(false);
  const prevPausedRef = useRef(false);
  const prevPhaseRef = useRef(pomodoroPhase);
  const permissionRequestedRef = useRef(false);

  // Request notification permission on first timer start — mobile or native Android
  useEffect(() => {
    const isNative = isNativeAndroid();
    if (!isMobileDevice() && !isNative) return;

    if (isStudying && !permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      if (isNative) {
        requestNotificationPermission().then((perm) => {
          console.log('[Native Timer Bridge] Notification permission:', perm);
        });
      } else {
        requestSWPermission().then((perm) => {
          console.log('[SW Bridge] Notification permission:', perm);
        });
      }
    }
  }, [isStudying, requestSWPermission]);

  // Helper to get current target (for countdown/pomodoro)
  const getTarget = useCallback((): number | null => {
    if (timerMode === 'pomodoro') {
      return pomodoroPhase === 'work' ? pomodoroWorkDuration : pomodoroBreakDuration;
    }
    if (timerMode === 'countdown') {
      return countdownTarget;
    }
    return null;
  }, [timerMode, pomodoroPhase, pomodoroWorkDuration, pomodoroBreakDuration, countdownTarget]);

  // Listen for native Android notification actions (Pause, Resume, Stop)
  useEffect(() => {
    if (!isNativeAndroid()) return;

    let cleanupHandle: { remove: () => Promise<void> } | null = null;

    TimerNotification.addListener('onTimerAction', (data: { action: 'pause' | 'resume' | 'stop' }) => {
      console.log('[Native Timer Bridge] Received onTimerAction:', data.action);
      if (data.action === 'pause') {
        pauseTimer();
      } else if (data.action === 'resume') {
        resumeTimer();
      } else if (data.action === 'stop') {
        stopTimer();
      }
    }).then((h) => {
      cleanupHandle = h;
    }).catch((err) => {
      console.warn('[Native Timer Bridge] Could not attach onTimerAction listener:', err);
    });

    return () => {
      cleanupHandle?.remove?.();
    };
  }, [pauseTimer, resumeTimer, stopTimer]);

  // Sync timer state transitions to Native Android Foreground Service or Web Service Worker
  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    const wasStudying = prevStudyingRef.current;
    const wasPaused = prevPausedRef.current;
    const wasPhase = prevPhaseRef.current;

    prevRunningRef.current = isRunning;
    prevStudyingRef.current = isStudying;
    prevPausedRef.current = isPaused;
    prevPhaseRef.current = pomodoroPhase;

    const isNative = isNativeAndroid();
    // Skip if desktop web
    if (!isMobileDevice() && !isNative) return;

    const subjectName = selectedSubject?.name || '';
    const hidden = typeof document !== 'undefined' && document.hidden;
    const target = getTarget() ?? 0;

    if (isRunning && !wasRunning) {
      const isResume = wasStudying && wasPaused;
      if (isNative) {
        if (isResume) {
          TimerNotification.resume().catch((err) =>
            console.warn('[Native Timer Bridge] resume failed:', err)
          );
        } else {
          TimerNotification.start({
            mode: timerMode as 'stopwatch' | 'countdown' | 'pomodoro',
            phase: pomodoroPhase,
            startTime: startTimeRef?.current ?? Date.now(),
            elapsedSeconds,
            targetSeconds: target,
            subject: subjectName,
          }).catch((err) =>
            console.warn('[Native Timer Bridge] start failed:', err)
          );

          // One-time check for battery optimization on native Android
          if (!localStorage.getItem('studyio_battery_prompt_checked')) {
            localStorage.setItem('studyio_battery_prompt_checked', '1');
            TimerNotification.isBatteryOptimized()
              .then(({ isIgnoringBatteryOptimizations }) => {
                if (!isIgnoringBatteryOptimizations) {
                  console.info(
                    '[Native Timer Bridge] Battery optimization is active. For best background accuracy, allow unrestricted battery in settings.'
                  );
                }
              })
              .catch(() => {});
          }
        }
      } else {
        // Web Service Worker
        if (isResume) {
          postToSW({
            type: 'TIMER_RESUME',
            startTime: startTimeRef?.current ?? Date.now(),
            elapsed: elapsedSeconds,
            subject: subjectName,
            hidden,
          });
        } else {
          postToSW({
            type: 'TIMER_START',
            startTime: startTimeRef?.current ?? Date.now(),
            elapsed: elapsedSeconds,
            subject: subjectName,
            mode: timerMode,
            target,
            hidden,
          });
        }
      }
    } else if (!isRunning && wasRunning && isStudying && isPaused) {
      // Paused
      if (isNative) {
        TimerNotification.pause().catch((err) =>
          console.warn('[Native Timer Bridge] pause failed:', err)
        );
      } else {
        postToSW({ type: 'TIMER_PAUSE', elapsed: elapsedSeconds });
      }
    } else if (!isStudying && wasStudying) {
      // Stopped
      if (isNative) {
        TimerNotification.stop().catch((err) =>
          console.warn('[Native Timer Bridge] stop failed:', err)
        );
      } else {
        postToSW({ type: 'TIMER_STOP' });
      }
    } else if (isRunning && wasRunning && wasPhase !== pomodoroPhase) {
      // Pomodoro phase changed while running
      if (isNative) {
        TimerNotification.update({
          mode: timerMode as 'stopwatch' | 'countdown' | 'pomodoro',
          phase: pomodoroPhase,
          targetSeconds: target,
          subject: subjectName,
        }).catch((err) =>
          console.warn('[Native Timer Bridge] update phase failed:', err)
        );
      }
    }
  }, [isRunning, isStudying, isPaused, pomodoroPhase, timerMode, selectedSubject?.name, getTarget, elapsedSeconds, postToSW, startTimeRef]);

  const elapsedRef = useRef(elapsedSeconds);
  useEffect(() => {
    elapsedRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  // Send periodic tick to SW for web mobile (Native Android uses OS chronometer, no ticks needed!)
  useEffect(() => {
    if (isNativeAndroid() || !isMobileDevice() || !isRunning) return;
    const id = setInterval(() => {
      postToSW({
        type: 'TIMER_TICK',
        startTime: startTimeRef?.current ?? undefined,
        elapsed: elapsedRef.current,
        subject: selectedSubject?.name || '',
      });
    }, 10000);
    return () => clearInterval(id);
  }, [isRunning, selectedSubject?.name, postToSW, startTimeRef]);

  // Visibility change for SW (web mobile)
  useEffect(() => {
    if (isNativeAndroid() || !isMobileDevice()) return;
    const handleVisibility = () => {
      if (document.hidden) {
        postToSW({ type: 'APP_HIDDEN' });
      } else {
        postToSW({ type: 'APP_VISIBLE' });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [postToSW]);

  return null; // no UI
}
