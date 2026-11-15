'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useStudy } from '../../context/StudyContext';
import { formatSeconds } from '../../lib/utils';
import { Minimize2, Sliders, Crown, Music, Play, Pause, Loader2, RotateCw } from 'lucide-react';
import { FocusSceneLayer } from '../focus/FocusSceneLayer';
import { useFocusScene } from '../focus/useFocusScene';
import { ScenePicker, ScenePreviewPill } from '../focus/ScenePicker';
import { AtmospherePicker } from '../focus/AtmospherePicker';
import { useAtmosphere } from '../focus/useAtmosphere';
import { AVAILABLE_SCENES, getSceneById } from '../focus/scenes/registry';
import { useStudyMode } from '../../context/StudyModeContext';
import { hapticTick, hapticMedium } from '@/lib/haptics';

export function enterFullscreenSafely() {
  if (typeof document === 'undefined') return;

  interface VendorDocElement extends HTMLElement {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  }

  try {
    const el = document.documentElement as VendorDocElement;
    if (document.fullscreenElement) return;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.mozRequestFullScreen) {
      el.mozRequestFullScreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }
  } catch {}
}

export function exitFullscreenSafely() {
  if (typeof document === 'undefined') return;

  interface VendorDoc extends Document {
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => Promise<void> | void;
    mozFullScreenElement?: Element;
    mozCancelFullScreen?: () => Promise<void> | void;
    msFullscreenElement?: Element;
    msExitFullscreen?: () => Promise<void> | void;
  }
  interface VendorOrientation {
    unlock?: () => Promise<void> | void;
  }

  try {
    const vendorDoc = document as VendorDoc;
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

  try {
    const orientation = window.screen?.orientation as unknown as VendorOrientation | undefined;
    if (orientation?.unlock) {
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
    pauseTimer,
    resumeTimer,
    startTimer,
  } = useStudy();
  const { isFocus } = useStudyMode();

  const [isIdle, setIsIdle] = useState(false);
  const isIdleRef = useRef(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isAtmosphereOpen, setIsAtmosphereOpen] = useState(false);
  const [isLandscapeLocked, setIsLandscapeLocked] = useState(false);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const atmosphereButtonRef = useRef<HTMLButtonElement | null>(null);

  // Automatically request browser/WebView fullscreen upon entering immersive view
  useEffect(() => {
    if (isFocusModeOpen) {
      enterFullscreenSafely();
    } else {
      setIsLandscapeLocked(false);
    }
  }, [isFocusModeOpen]);

  // Track orientation changes to stay in sync
  useEffect(() => {
    if (!isFocusModeOpen || typeof window === 'undefined') return;

    const checkOrientation = () => {
      const orientation = window.screen?.orientation as any;
      if (orientation?.type) {
        if (!orientation.type.includes('landscape')) {
          setIsLandscapeLocked(false);
        }
      }
    };

    window.screen?.orientation?.addEventListener?.('change', checkOrientation);
    return () => {
      window.screen?.orientation?.removeEventListener?.('change', checkOrientation);
    };
  }, [isFocusModeOpen]);

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

  const handleToggleOrientation = async () => {
    hapticTick();
    enterFullscreenSafely();

    try {
      const orientation = window.screen?.orientation as any;
      if (!orientation) return;

      if (isLandscapeLocked) {
        if (orientation.unlock) {
          orientation.unlock();
        } else if (orientation.lock) {
          await orientation.lock('portrait').catch(() => {});
        }
        setIsLandscapeLocked(false);
      } else {
        if (orientation.lock) {
          await orientation.lock('landscape').catch(() => {});
          setIsLandscapeLocked(true);
        }
      }
    } catch (err) {
      console.warn('Orientation lock error:', err);
    }
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

  // Calculate display time based on mode
  let displayTime = formatSeconds(elapsedSeconds);
  if (timerMode === 'pomodoro') {
    const target = pomodoroPhase === 'work' ? pomodoroWorkDuration : pomodoroBreakDuration;
    const remaining = Math.max(0, target - elapsedSeconds);
    displayTime = formatSeconds(remaining);
  } else if (timerMode === 'countdown') {
    const target = countdownTarget || 3600;
    const remaining = Math.max(0, target - elapsedSeconds);
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
      className={`fixed inset-0 w-screen h-dvh z-[100] flex flex-col items-center justify-center select-none overflow-hidden animate-in fade-in duration-500 bg-[#05060a] ${
        isIdle && !isPickerOpen && !isAtmosphereOpen ? 'cursor-none' : 'cursor-default'
      }`}
    >
      {/* 1. Animated / Living Focus Scene Layer (z-0, pointer-events none) */}
      <FocusSceneLayer sceneId={activeSceneId} dim={dim} />

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

      {/* 3. Big Clock with Space Grotesk tabular digits and scene-specific ambient glow */}
      <div
        className="relative z-10 flex flex-col items-center justify-center text-center pointer-events-none landscape:my-1"
        style={{
          contain: 'layout style',
          transform: 'translate3d(0, 0, 0)',
          isolation: 'isolate',
        }}
      >
        {/* Deep contrast backdrop scrim to guarantee 100% crystal clarity over any scene */}
        <div
          className="absolute inset-0 -z-20 pointer-events-none scale-150 rounded-full"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.4) 45%, transparent 75%)',
          }}
        />

        {/* Soft GPU-accelerated ambient glow layer behind clock */}
        <div
          className="absolute inset-0 -z-10 pointer-events-none scale-125"
          style={{
            background: `radial-gradient(ellipse 65% 45% at 50% 50%, ${sceneGlow} 0%, transparent 70%)`,
            opacity: 0.45,
            transition: 'background 0.9s ease',
          }}
        />

        {timerMode === 'pomodoro' && (
          <div className="mb-3 landscape:mb-1 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs sm:text-sm font-bold text-white/90 tracking-[0.25em] uppercase shadow-md">
            {pomodoroPhase === 'work' ? 'Deep Focus' : 'Rest Phase'}
          </div>
        )}
        {timerMode === 'countdown' && (
          <div className="mb-3 landscape:mb-1 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs sm:text-sm font-bold text-white/90 tracking-[0.25em] uppercase shadow-md">
            Countdown
          </div>
        )}

        <div
          className="font-bold leading-none text-white tabular-nums select-none tracking-tight"
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

        <div
          className="mt-4 sm:mt-5 landscape:mt-2 px-4 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white font-medium text-sm sm:text-base md:text-lg landscape:text-xs select-none flex items-center justify-center gap-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
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
        <div className="flex items-center justify-center">
          {isStudying && !isPaused ? (
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

        {/* Sleek Centered Glassmorphic Scene Selector Bar */}
        <div
          role="group"
          aria-label="Scene selector"
          className="max-w-[92vw] sm:max-w-fit mx-auto flex items-center gap-1 p-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] mb-3 landscape:mb-1.5"
        >
          {AVAILABLE_SCENES.map((scene) => {
            const isActive = activeSceneId === scene.id;
            const isLocked = scene.premium && !isPremium;

            return (
              <button
                key={scene.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  hapticTick();
                  selectScene(scene.id);
                }}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-white/15 text-white shadow-sm border border-white/10'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                <span>{scene.name}</span>
                {isLocked && (
                  <Crown className="w-3 h-3 text-[#E6C15A] fill-[#E6C15A] shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Action Controls: Atmosphere, Dim, Rotate Screen & Exit Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Atmosphere Audio Soundscapes Toggle */}
          <button
            ref={atmosphereButtonRef}
            type="button"
            onClick={() => {
              hapticTick();
              setIsAtmosphereOpen((prev) => !prev);
              if (isPickerOpen) setIsPickerOpen(false);
            }}
            aria-haspopup="dialog"
            aria-expanded={isAtmosphereOpen}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs sm:text-[13px] font-medium shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-colors cursor-pointer ${
              ambientSound !== 'none'
                ? 'bg-white/20 text-white border-white/35 font-semibold'
                : 'bg-[#090b14]/92 hover:bg-white/15 border-white/15 text-white/80 hover:text-white'
            }`}
            title="Atmosphere soundscapes"
          >
            {isAtmosphereLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            ) : (
              <Music className={`w-3.5 h-3.5 ${ambientSound !== 'none' ? 'text-amber-400' : 'text-white/80'}`} />
            )}
            <span>{isAtmosphereLoading ? 'Loading Atmosphere...' : 'Atmosphere'}</span>
            {ambientSound !== 'none' && !isAtmosphereLoading ? (
              <span className="flex items-center gap-1">
                <span className="font-mono text-[11px] text-white/80 max-w-[95px] truncate hidden sm:inline">
                  {activeAtmosphereOption?.label} {isPaused ? '(Paused)' : ''}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ml-0.5 ${
                    isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                  }`}
                />
              </span>
            ) : null}
          </button>

          {/* Dim & Scene Drawer Toggle */}
          <button
            ref={settingsButtonRef}
            type="button"
            onClick={() => {
              hapticTick();
              setIsPickerOpen((prev) => !prev);
              if (isAtmosphereOpen) setIsAtmosphereOpen(false);
            }}
            aria-haspopup="dialog"
            aria-expanded={isPickerOpen}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#090b14]/92 hover:bg-white/15 border border-white/15 text-white/80 hover:text-white text-xs sm:text-[13px] font-medium shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-colors cursor-pointer"
            title="Adjust dim & options"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dim</span>
            <span className="font-mono text-[11px] text-white/60">{dim}%</span>
          </button>

          {/* Rotate Screen Toggle */}
          <button
            type="button"
            onClick={handleToggleOrientation}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs sm:text-[13px] font-medium shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-colors cursor-pointer ${
              isLandscapeLocked
                ? 'bg-white/20 text-white border-white/35 font-semibold'
                : 'bg-[#090b14]/92 hover:bg-white/15 border-white/15 text-white/80 hover:text-white'
            }`}
            title={isLandscapeLocked ? 'Unlock screen rotation' : 'Rotate to landscape desk clock'}
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLandscapeLocked ? 'text-amber-400 rotate-90' : ''} transition-transform`} />
            <span className="hidden sm:inline">Rotate</span>
          </button>

          {/* Exit Fullscreen */}
          <button
            type="button"
            onClick={() => {
              hapticTick();
              setIsFocusModeOpen(false);
              exitFullscreenSafely();
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#090b14]/92 hover:bg-white/15 border border-white/15 text-white/80 hover:text-white text-xs sm:text-[13px] font-medium shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-colors cursor-pointer"
            title="Exit Fullscreen (ESC)"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exit</span>
            <span className="ml-1 px-1 py-0.2 rounded text-[10px] bg-black/40 text-white/50 font-mono">
              ESC
            </span>
          </button>
        </div>

        {/* Atmosphere Audio Drawer Popover */}
        <AtmospherePicker
          isOpen={isAtmosphereOpen}
          onClose={() => setIsAtmosphereOpen(false)}
          triggerButtonRef={atmosphereButtonRef}
        />

        {/* Detailed Scene Drawer Popover */}
        <ScenePicker
          isOpen={isPickerOpen}
          onClose={() => setIsPickerOpen(false)}
          activeSceneId={activeSceneId}
          onSelectScene={(id) => selectScene(id)}
          dim={dim}
          onDimChange={setDim}
          isPremium={isPremium}
          triggerButtonRef={settingsButtonRef}
        />
      </div>
    </div>
  );
}
