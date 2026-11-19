'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useStudy } from '../../context/StudyContext';
import { formatSeconds } from '../../lib/utils';
import { Minimize2, Sliders, Crown, Music, Play, Pause, Loader2, Palette, Lock } from 'lucide-react';
import { FocusSceneLayer } from '../focus/FocusSceneLayer';
import { useFocusScene } from '../focus/useFocusScene';
import { ScenePicker, ScenePreviewPill } from '../focus/ScenePicker';
import { AtmospherePicker } from '../focus/AtmospherePicker';
import { useAtmosphere } from '../focus/useAtmosphere';
import { AVAILABLE_SCENES, getSceneById } from '../focus/scenes/registry';
import { useStudyMode } from '../../context/StudyModeContext';
import { hapticTick, hapticMedium } from '@/lib/haptics';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

export function enterFullscreenSafely() {
  if (typeof window === 'undefined') return;

  // 1. Android Native Bridge (Hides both status bar and bottom gesture navigation bar)
  try {
    const androidBridge = (window as any).AndroidFullscreenBridge;
    if (androidBridge?.enterFullscreen) {
      androidBridge.enterFullscreen();
    }
  } catch (err) {
    console.warn('[enterFullscreenSafely] AndroidFullscreenBridge error:', err);
  }

  // 2. Capacitor Status Bar Plugin
  try {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('StatusBar')) {
      StatusBar.hide().catch(() => {});
    }
  } catch (err) {
    console.warn('[enterFullscreenSafely] StatusBar.hide error:', err);
  }

  // 3. Web Fullscreen API for standard browsers
  try {
    const el = document.documentElement as any;
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen({ navigationUI: 'hide' } as any).catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
      }
    }
  } catch {}

  // 4. Web Screen Orientation API (Lock to landscape)
  try {
    const orientation = window.screen?.orientation as any;
    if (orientation?.lock) {
      orientation.lock('landscape').catch(() => {});
    }
  } catch {}
}

export function exitFullscreenSafely() {
  if (typeof window === 'undefined') return;

  // 1. Android Native Bridge (Restores portrait mode & top/bottom system bars)
  try {
    const androidBridge = (window as any).AndroidFullscreenBridge;
    if (androidBridge?.exitFullscreen) {
      androidBridge.exitFullscreen();
    }
  } catch (err) {
    console.warn('[exitFullscreenSafely] AndroidFullscreenBridge error:', err);
  }

  // 2. Capacitor Status Bar Plugin
  try {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('StatusBar')) {
      StatusBar.show().catch(() => {});
    }
  } catch (err) {
    console.warn('[exitFullscreenSafely] StatusBar.show error:', err);
  }

  // 3. Web Fullscreen API
  try {
    const vendorDoc = document as any;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (vendorDoc.webkitFullscreenElement && vendorDoc.webkitExitFullscreen) {
      vendorDoc.webkitExitFullscreen();
    } else if (vendorDoc.mozFullScreenElement && vendorDoc.mozCancelFullScreen) {
      vendorDoc.mozCancelFullScreen();
    } else if (vendorDoc.msFullscreenElement && vendorDoc.msExitFullscreen) {
      vendorDoc.msExitFullscreen();
    }
  } catch {}

  // 4. Web Screen Orientation API (Lock strictly back to portrait)
  try {
    const orientation = window.screen?.orientation as any;
    if (orientation?.lock) {
      orientation.lock('portrait').catch(() => {
        if (orientation?.unlock) orientation.unlock();
      });
    } else if (orientation?.unlock) {
      orientation.unlock();
    }
  } catch {}
}

export function FocusModeModal() {
  const {
    isFocusModeOpen,
    setIsFocusModeOpen,
    elapsedSeconds,
    timerMode,
    countdownTarget,
    pomodoroPhase,
    pomodoroWorkDuration,
    pomodoroBreakDuration,
    selectedSubject,
    isStudying,
    isPaused,
    isUltraStrict,
    pauseTimer,
    resumeTimer,
    startTimer,
  } = useStudy();
  const { isFocus } = useStudyMode();

  const [isIdle, setIsIdle] = useState(false);
  const isIdleRef = useRef(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isAtmosphereOpen, setIsAtmosphereOpen] = useState(false);
  const [isAnimated, setIsAnimated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('studyio-focus-animated');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const atmosphereButtonRef = useRef<HTMLButtonElement | null>(null);

  // Automatically enter immersive sticky fullscreen upon entering Focus Mode, and exit upon closing
  useEffect(() => {
    if (isFocusModeOpen) {
      enterFullscreenSafely();
      return () => {
        exitFullscreenSafely();
      };
    } else {
      exitFullscreenSafely();
    }
  }, [isFocusModeOpen]);

  // Listen for native exit event (e.g. phone turned back upright to portrait)
  useEffect(() => {
    if (!isFocusModeOpen) return;

    const handleExitFocus = () => {
      setIsFocusModeOpen(false);
      exitFullscreenSafely();
    };

    window.addEventListener('studyio:exit-focus-mode', handleExitFocus);

    // Auto-exit if viewport media query turns portrait while in focus mode
    const mql = window.matchMedia('(orientation: portrait)');
    const handlePortrait = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsFocusModeOpen(false);
        exitFullscreenSafely();
      }
    };
    if (mql.addEventListener) mql.addEventListener('change', handlePortrait);
    else mql.addListener(handlePortrait);

    return () => {
      window.removeEventListener('studyio:exit-focus-mode', handleExitFocus);
      if (mql.removeEventListener) mql.removeEventListener('change', handlePortrait);
      else mql.removeListener(handlePortrait);
    };
  }, [isFocusModeOpen, setIsFocusModeOpen]);

  const handlePause = () => {
    pauseTimer();
  };

  const handleResume = () => {
    resumeTimer();
  };

  const handleStart = () => {
    if (selectedSubject?.id) {
      startTimer(selectedSubject.id);
    } else {
      startTimer();
    }
  };

  const handleToggleAnimation = () => {
    hapticTick();
    setIsAnimated((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('studyio-focus-animated', String(next));
      } catch {}
      return next;
    });
  };

  // Focus scenes state & soft gating
  const {
    activeSceneId,
    dim,
    setDim,
    selectScene,
    isPremium,
    previewSceneId,
    previewSecondsLeft,
    openPremiumModal,
  } = useFocusScene();

  // Atmosphere ambient audio hook
  const { ambientSound, activeOption: activeAtmosphereOption, isLoading: isAtmosphereLoading } = useAtmosphere();

  // Auto-hide UI when mouse is idle (keep visible while picker or atmosphere is open)
  useEffect(() => {
    if (!isFocusModeOpen) return;

    let rafId: number | null = null;
    let lastActivityTime = 0;

    const handlePointerActivity = () => {
      const now = Date.now();

      if (isIdleRef.current) {
        isIdleRef.current = false;
        setIsIdle(false);
      }

      if (now - lastActivityTime < 250) return;
      lastActivityTime = now;

      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      if (!isPickerOpen && !isAtmosphereOpen) {
        idleTimeoutRef.current = setTimeout(() => {
          isIdleRef.current = true;
          setIsIdle(true);
        }, 3000);
      }
    };

    const onPointerEvent = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        handlePointerActivity();
      });
    };

    window.addEventListener('mousemove', onPointerEvent, { passive: true });
    window.addEventListener('mousedown', onPointerEvent, { passive: true });
    window.addEventListener('keydown', onPointerEvent, { passive: true });

    handlePointerActivity();

    return () => {
      window.removeEventListener('mousemove', onPointerEvent);
      window.removeEventListener('mousedown', onPointerEvent);
      window.removeEventListener('keydown', onPointerEvent);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [isFocusModeOpen, isPickerOpen, isAtmosphereOpen]);

  // Arrow keys navigation & Escape key listener
  useEffect(() => {
    if (!isFocusModeOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAtmosphereOpen) {
          setIsAtmosphereOpen(false);
          return;
        }
        if (isPickerOpen) {
          setIsPickerOpen(false);
          return;
        }
        setIsFocusModeOpen(false);
        exitFullscreenSafely();
        return;
      }

      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        const isCountdownCompleted =
          timerMode === 'countdown' &&
          countdownTarget > 0 &&
          elapsedSeconds >= countdownTarget;
        if (isCountdownCompleted) return;

        hapticMedium();
        if (isStudying && !isPaused) {
          handlePause();
        } else if (isStudying && isPaused) {
          handleResume();
        } else if (!isStudying) {
          enterFullscreenSafely();
          handleStart();
        }
        return;
      }

      const keys = AVAILABLE_SCENES.map((s) => s.id);
      const curIndex = keys.indexOf(activeSceneId);

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        hapticTick();
        const nextKey = keys[(curIndex + 1) % keys.length];
        selectScene(nextKey);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        hapticTick();
        const prevKey = keys[(curIndex - 1 + keys.length) % keys.length];
        selectScene(prevKey);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isFocusModeOpen,
    isPickerOpen,
    isAtmosphereOpen,
    activeSceneId,
    selectScene,
    setIsFocusModeOpen,
    isStudying,
    isPaused,
    handlePause,
    handleResume,
    handleStart,
  ]);

  if (!isFocusModeOpen) return null;

  const isCountdownCompleted =
    timerMode === 'countdown' &&
    countdownTarget > 0 &&
    elapsedSeconds >= countdownTarget;

  // Calculate display time based on mode
  let displayTime = formatSeconds(elapsedSeconds);
  if (timerMode === 'pomodoro') {
    const target = pomodoroPhase === 'work' ? pomodoroWorkDuration : pomodoroBreakDuration;
    const remaining = Math.max(0, target - elapsedSeconds);
    displayTime = formatSeconds(remaining);
  } else if (timerMode === 'countdown') {
    const target = countdownTarget || 3600;
    const remaining = isCountdownCompleted ? 0 : Math.max(0, target - elapsedSeconds);
    displayTime = formatSeconds(remaining);
  }

  const isBreak = timerMode === 'pomodoro' && pomodoroPhase !== 'work';

  // Scene ambient text glow matching design concept
  const activeScene = getSceneById(activeSceneId);
  const sceneGlow = isBreak
    ? 'rgba(59, 130, 246, 0.4)'
    : activeScene?.glow || 'rgba(255,170,120,.45)';

  const subjectSubtitle = isBreak
    ? 'Rest Phase'
    : isFocus
    ? 'Focus'
    : `Studying ${selectedSubject?.name || 'Deep Work'}`;

  return (
    <div
      style={{ colorScheme: 'dark' }}
      className={`fixed inset-0 w-full h-full z-[100] flex items-center justify-center select-none overflow-hidden animate-in fade-in duration-500 bg-black ${
        isIdle && !isPickerOpen && !isAtmosphereOpen ? 'cursor-none' : 'cursor-default'
      }`}
    >
      {/* 1. Animated / Living Focus Scene Layer (z-0, pointer-events none) */}
      <FocusSceneLayer sceneId={activeSceneId} dim={dim} isAnimated={isAnimated} />

      {/* 2. Free User 8-Second Preview Toast / Pill */}
      {previewSceneId && previewSecondsLeft > 0 && (
        <ScenePreviewPill
          secondsLeft={previewSecondsLeft}
          onUnlockClick={() => openPremiumModal()}
        />
      )}

      {/* Invisible overlay that can be double-clicked to exit */}
      <div
        className="absolute inset-0 z-0 pointer-events-auto"
        onDoubleClick={() => {
          setIsFocusModeOpen(false);
          exitFullscreenSafely();
        }}
      />

      {/* Subtle Top-Right Exit Button */}
      <button
        type="button"
        onClick={() => {
          hapticTick();
          setIsFocusModeOpen(false);
          exitFullscreenSafely();
        }}
        className={`absolute top-[max(env(safe-area-inset-top,0px)+12px,20px)] right-6 z-20 p-2 rounded-full bg-black/40 hover:bg-black/60 border border-white/10 text-white/60 hover:text-white transition-opacity duration-250 cursor-pointer ${
          isIdle && !isPickerOpen && !isAtmosphereOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        title="Exit Fullscreen (ESC)"
        aria-label="Exit Fullscreen"
      >
        <Minimize2 className="w-4 h-4" />
      </button>

      {/* 3. Big Clock with Space Grotesk tabular digits and scene-specific ambient glow */}
      <div
        className="relative z-10 flex items-center justify-center text-center pointer-events-none"
        style={{
          contain: 'layout style',
          transform: 'translate3d(0, 0, 0)',
          isolation: 'isolate',
        }}
      >
        {/* Deep contrast backdrop scrim to guarantee 100% crystal clarity over living scenes */}
        {activeSceneId !== 'default' && (
          <div
            className="absolute inset-0 -z-20 pointer-events-none scale-150 rounded-full"
            style={{
              background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.4) 45%, transparent 75%)',
            }}
          />
        )}

        {/* Soft GPU-accelerated ambient glow layer behind clock (only for living scenes) */}
        {activeSceneId !== 'default' && (
          <div
            className="absolute inset-0 -z-10 pointer-events-none scale-125 transition-colors duration-500 ease-out"
            style={{
              backgroundColor: sceneGlow,
              maskImage: 'radial-gradient(ellipse 65% 45% at 50% 50%, black 0%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(ellipse 65% 45% at 50% 50%, black 0%, transparent 70%)',
              opacity: 0.45,
            }}
          />
        )}

        {/* Mode Tag (Pomodoro / Countdown / Ultra Focus) positioned above without offsetting vertical center */}
        {isUltraStrict ? (
          <div className="absolute bottom-full mb-3.5 landscape:mb-2 px-3 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-500/40 text-xs sm:text-sm font-bold text-emerald-400 tracking-[0.25em] uppercase shadow-md whitespace-nowrap left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            <span>Ultra Focus Mode</span>
          </div>
        ) : timerMode === 'pomodoro' ? (
          <div className="absolute bottom-full mb-3.5 landscape:mb-2 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs sm:text-sm font-bold text-white/90 tracking-[0.25em] uppercase shadow-md whitespace-nowrap left-1/2 -translate-x-1/2">
            {pomodoroPhase === 'work' ? 'Deep Focus' : 'Rest Phase'}
          </div>
        ) : timerMode === 'countdown' ? (
          <div className="absolute bottom-full mb-3.5 landscape:mb-2 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs sm:text-sm font-bold text-white/90 tracking-[0.25em] uppercase shadow-md whitespace-nowrap left-1/2 -translate-x-1/2">
            Countdown
          </div>
        ) : null}

        {/* The Giant Tabular Timer Digits - 100% Dead-Center Aligned */}
        <div
          className="font-bold leading-none text-white tabular-nums select-none tracking-tight flex items-center justify-center text-center"
          style={{
            fontFamily: "'Space Grotesk', var(--font-hud), sans-serif",
            fontSize: 'clamp(5rem, min(14.5vw, 25vh), 13.5rem)',
            letterSpacing: '-0.035em',
            textShadow: '0 4px 24px rgba(0,0,0,0.95), 0 2px 8px rgba(0,0,0,0.9), 0 0 45px rgba(0,0,0,0.7)',
            filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.75))',
            transition: 'font-size 0.3s ease',
          }}
        >
          {displayTime}
        </div>

        {/* Subject Pill positioned below without offsetting vertical center */}
        <div
          className="absolute top-full mt-3.5 sm:mt-4 landscape:mt-2.5 px-4 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white font-medium text-sm sm:text-base md:text-lg landscape:text-xs select-none flex items-center justify-center gap-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.6)] whitespace-nowrap left-1/2 -translate-x-1/2"
          style={{
            fontFamily: "'Outfit', var(--font-geist-sans), sans-serif",
          }}
        >
          <span className="drop-shadow-sm">{subjectSubtitle}</span>
          {isPaused && (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-hud font-bold tracking-wider uppercase bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-sm animate-pulse">
              Paused
            </span>
          )}
        </div>
      </div>

      {/* 4. Bottom Control Bar: Compact Timer Playback, Scene Selector & Utility Controls */}
      <div
        className={`absolute bottom-[calc(22px+env(safe-area-inset-bottom,0px))] landscape:bottom-[calc(8px+env(safe-area-inset-bottom,0px))] left-1/2 z-20 flex flex-col items-center justify-center gap-2.5 landscape:gap-1.5 landscape:pb-3 max-w-[calc(100%-24px)] transition-[opacity,transform] duration-250 ease-out will-change-[opacity,transform] ${
          isIdle && !isPickerOpen && !isAtmosphereOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        style={{
          transform: isIdle && !isPickerOpen && !isAtmosphereOpen
            ? 'translate3d(-50%, 12px, 0)'
            : 'translate3d(-50%, 0, 0)',
          contain: 'layout style',
          isolation: 'isolate',
          backfaceVisibility: 'hidden',
        }}
      >
        {/* Compact Timer Playback Controls (Start / Pause only) positioned right above scene pills */}
        {!isCountdownCompleted && (
          <div className="flex items-center justify-center">
            {isUltraStrict && isStudying ? (
              <div className="flex items-center gap-1.5 px-4 sm:px-4.5 py-1.5 sm:py-2 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold text-xs uppercase tracking-wider backdrop-blur-md shadow-md select-none">
                <Lock className="w-3.5 h-3.5 animate-pulse" />
                <span>Ultra Focus • Locked</span>
              </div>
            ) : isStudying && !isPaused ? (
              <button
                type="button"
                onClick={() => {
                  hapticMedium();
                  handlePause();
                }}
                className="flex items-center gap-1.5 px-4 sm:px-4.5 py-1.5 sm:py-2 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 hover:border-white/40 text-white font-medium text-xs sm:text-[13px] backdrop-blur-md shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title="Pause timer (Space)"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  hapticMedium();
                  enterFullscreenSafely();
                  if (isStudying) {
                    handleResume();
                  } else {
                    handleStart();
                  }
                }}
                className="flex items-center gap-1.5 px-4 sm:px-4.5 py-1.5 sm:py-2 rounded-full bg-white hover:bg-neutral-100 text-neutral-950 font-semibold text-xs sm:text-[13px] shadow-[0_4px_16px_rgba(255,255,255,0.25)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title={isStudying ? "Resume timer (Space)" : "Start timer (Space)"}
              >
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                <span>Start</span>
              </button>
            )}
          </div>
        )}

        {/* Sleek Minimalist Focus Control Dock */}
        <div className="flex items-center gap-1.5 p-1 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          {/* Theme & Scene Drawer */}
          <button
            ref={settingsButtonRef}
            type="button"
            onClick={() => {
              hapticTick();
              setIsPickerOpen((prev) => !prev);
              if (isAtmosphereOpen) setIsAtmosphereOpen(false);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full hover:bg-white/10 text-white/90 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            title="Themes, dimming & animation"
          >
            <Palette className="w-3.5 h-3.5 text-amber-400" />
            <span>{activeScene?.name || 'Theme'}</span>
          </button>

          <span className="w-px h-3.5 bg-white/15" />

          {/* Atmosphere Ambient Soundscapes */}
          <button
            ref={atmosphereButtonRef}
            type="button"
            onClick={() => {
              hapticTick();
              setIsAtmosphereOpen((prev) => !prev);
              if (isPickerOpen) setIsPickerOpen(false);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full hover:bg-white/10 text-white/90 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            title="Ambient atmosphere soundscape"
          >
            {isAtmosphereLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            ) : (
              <Music className={`w-3.5 h-3.5 ${ambientSound !== 'none' ? 'text-emerald-400' : 'text-zinc-400'}`} />
            )}
            <span>Atmosphere</span>
            {ambientSound !== 'none' && !isAtmosphereLoading && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            )}
          </button>

          <span className="w-px h-3.5 bg-white/15" />

          {/* Exit Fullscreen */}
          <button
            type="button"
            onClick={() => {
              hapticTick();
              setIsFocusModeOpen(false);
              exitFullscreenSafely();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            title="Exit Fullscreen (ESC)"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>

      {/* 5. Atmosphere Audio Drawer Popover (Placed at root so fixed positioning is viewport-relative) */}
      <AtmospherePicker
        isOpen={isAtmosphereOpen}
        onClose={() => setIsAtmosphereOpen(false)}
        triggerButtonRef={atmosphereButtonRef}
      />

      {/* 6. Detailed Scene Drawer Popover (Placed at root so fixed positioning is viewport-relative) */}
      <ScenePicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        activeSceneId={activeSceneId}
        onSelectScene={(id) => selectScene(id)}
        dim={dim}
        onDimChange={setDim}
        isPremium={isPremium}
        triggerButtonRef={settingsButtonRef}
        isAnimated={isAnimated}
        onToggleAnimation={handleToggleAnimation}
      />
    </div>
  );
}
