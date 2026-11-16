'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { getSvgScene } from './scenes/svgScenes';

interface FocusSceneLayerProps {
  sceneId: string;
  dim?: number; // 0 to 60 (default 20)
  speedMultiplier?: number;
  isAnimated?: boolean;
}

function resolveSceneKey(id: string): string {
  if (id === 'sea') return 'sakura';
  if (id === 'aurora') return 'campfire';
  if (id === 'rain') return 'neon';
  if (id === 'stars') return 'dusk';
  return id;
}

function renderSceneContent(id: string) {
  const key = resolveSceneKey(id);
  const markup = getSvgScene(key);

  if (markup) {
    return (
      <div
        className="w-full h-full pointer-events-none select-none [&_svg]:w-full [&_svg]:h-full"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  }

  // Default Scene: Pure focus obsidian background
  return (
    <div
      className="w-full h-full pointer-events-none select-none"
      style={{
        background:
          'radial-gradient(ellipse at 50% 50%, #171b29 0%, #0c0e17 60%, #05060a 100%)',
      }}
    />
  );
}

function FocusSceneLayerComponent({
  sceneId,
  dim = 20,
  isAnimated = true,
}: FocusSceneLayerProps) {
  const [currentScene, setCurrentScene] = useState<string>(sceneId);
  const [previousScene, setPreviousScene] = useState<string | null>(null);

  // Pause animations when document tab is hidden to save 100% of GPU/battery
  const [isPageHidden, setIsPageHidden] = useState(false);
  useEffect(() => {
    const handleVisibility = () => {
      setIsPageHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Smoothly cross-fade when sceneId changes
  useEffect(() => {
    if (sceneId === currentScene) return;

    if (!isAnimated) {
      setCurrentScene(sceneId);
      setPreviousScene(null);
      return;
    }

    setPreviousScene(currentScene);
    setCurrentScene(sceneId);

    const timer = setTimeout(() => {
      setPreviousScene(null);
    }, 350);

    return () => clearTimeout(timer);
  }, [sceneId, currentScene, isAnimated]);

  // Clamp dim between 0 and 60
  const clampedDim = Math.max(0, Math.min(60, dim));
  const dimOpacity = clampedDim / 100;

  return (
    <div
      className={`fixed inset-0 z-0 pointer-events-none select-none overflow-hidden bg-[#05060a] ${
        isPageHidden || !isAnimated ? 'scene-hidden' : ''
      }`}
      style={{
        contain: 'strict',
        transform: 'translate3d(0, 0, 0)',
        isolation: 'isolate',
      }}
    >
      <style>{`
        @keyframes focusSceneFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes focusSceneFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* 1. Base Obsidian canvas that never unmounts (prevents any blank/white/black flashes) */}
      <div
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, #171b29 0%, #0c0e17 60%, #05060a 100%)',
          contain: 'strict',
          transform: 'translate3d(0, 0, 0)',
        }}
      />

      {/* 2. Previous Scene Layer (fading out smoothly over 350ms) */}
      {previousScene && (
        <div
          key={`prev-${previousScene}`}
          className="absolute inset-0 pointer-events-none select-none"
          style={{
            animation: 'focusSceneFadeOut 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
            contain: 'strict',
            transform: 'translate3d(0, 0, 0)',
            willChange: 'opacity',
          }}
        >
          {renderSceneContent(previousScene)}
        </div>
      )}

      {/* 3. Current Active Scene Layer (fading in smoothly over 350ms if transitioning) */}
      <div
        key={`curr-${currentScene}`}
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          animation: previousScene
            ? 'focusSceneFadeIn 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards'
            : 'none',
          contain: 'strict',
          transform: 'translate3d(0, 0, 0)',
          willChange: previousScene ? 'opacity' : 'auto',
        }}
      >
        {renderSceneContent(currentScene)}
      </div>

      {/* 4. Dual Radial Vignette to protect center contrast */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 65% 50% at center, rgba(0,0,0,0.42) 0%, transparent 65%), radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.65) 100%)',
          contain: 'strict',
          transform: 'translate3d(0, 0, 0)',
        }}
      />

      {/* 5. Background Dim Layer (0 to 60%) */}
      <div
        className="absolute inset-0 bg-black pointer-events-none"
        style={{
          opacity: dimOpacity,
          transition: 'opacity 200ms ease',
          contain: 'strict',
          transform: 'translate3d(0, 0, 0)',
        }}
      />
    </div>
  );
}

// React.memo prevents FocusSceneLayer from re-rendering every second when elapsedSeconds ticks in the parent modal
export const FocusSceneLayer = React.memo(
  FocusSceneLayerComponent,
  (prev, next) =>
    prev.sceneId === next.sceneId &&
    prev.dim === next.dim &&
    prev.isAnimated === next.isAnimated
);
