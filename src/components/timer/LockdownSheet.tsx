'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Ban,
  Clock,
} from 'lucide-react';
import { triggerHaptic } from '../../lib/native-feel';
import { StrictMode, InstalledApp } from '../../lib/strictModePlugin';

export interface LockdownSheetProps {
  isOpen: boolean;
  mode: 'strict' | 'ultra';
  countdownSeconds: number;
  subjectName?: string;
  allowedApps?: string[]; // Package names or app names
  allowedAppsCount?: number;
  previewHoldProgress?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Format duration into clean display format (e.g. "25 min", "1h 30m", "45s")
 */
function formatDurationDisplay(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (secs > 0 && mins > 0) return `${mins}m ${secs}s`;
  if (mins > 0) return `${mins} min`;
  return `${secs}s`;
}

/**
 * Format clock time (e.g. "8:45 PM")
 */
function formatEndTime(targetMs: number): string {
  const d = new Date(targetMs);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function LockdownSheet({
  isOpen,
  mode,
  countdownSeconds,
  subjectName,
  allowedApps = [],
  allowedAppsCount,
  previewHoldProgress,
  onConfirm,
  onCancel,
}: LockdownSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [holdProgress, setHoldProgress] = useState(previewHoldProgress ?? 0); // 0.0 to 1.0
  const [isHolding, setIsHolding] = useState(Boolean(previewHoldProgress));
  const [isLockedSnap, setIsLockedSnap] = useState(false);
  const [endTimeStr, setEndTimeStr] = useState('');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [installedAppsMap, setInstalledAppsMap] = useState<Map<string, InstalledApp>>(new Map());
  const [dragDownY, setDragDownY] = useState(0);

  const holdDurationMs = mode === 'ultra' ? 2500 : 1200;
  const holdStartTimeRef = useRef<number | null>(null);
  const holdAnimFrameRef = useRef<number | null>(null);
  const lastHapticStepRef = useRef<number>(0);
  const hasConfirmedRef = useRef(false);
  const dragStartYRef = useRef<number | null>(null);
  const isDraggingSheetRef = useRef(false);

  const effectiveAllowedCount = allowedAppsCount ?? allowedApps.length;

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mq.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mq.addEventListener?.('change', listener);
      return () => mq.removeEventListener?.('change', listener);
    }
  }, []);

  // Compute and periodically refresh end time
  useEffect(() => {
    if (!isOpen) return;
    const updateTime = () => {
      const targetEpoch = Date.now() + countdownSeconds * 1000;
      setEndTimeStr(formatEndTime(targetEpoch));
    };
    updateTime();
    const interval = setInterval(updateTime, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [isOpen, countdownSeconds]);

  // Load installed apps to get real app names / icons for allowed packages
  useEffect(() => {
    if (!isOpen || allowedApps.length === 0) return;
    let active = true;
    StrictMode.getInstalledApps()
      .then((res) => {
        if (active && res.apps) {
          const map = new Map<string, InstalledApp>();
          res.apps.forEach((app) => map.set(app.packageName, app));
          setInstalledAppsMap(map);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, allowedApps]);

  // Reset state whenever opening
  useEffect(() => {
    if (isOpen) {
      setHoldProgress(previewHoldProgress ?? 0);
      setIsHolding(Boolean(previewHoldProgress));
      setIsLockedSnap(false);
      setDragDownY(0);
      hasConfirmedRef.current = false;
      holdStartTimeRef.current = null;
      lastHapticStepRef.current = 0;
    }
  }, [isOpen, previewHoldProgress]);

  // Trigger confirm once
  const triggerConfirmed = useCallback(() => {
    if (hasConfirmedRef.current) return;
    hasConfirmedRef.current = true;
    setIsLockedSnap(true);
    triggerHaptic('heavy');

    // Allow 400ms lock-snap animation before invoking onConfirm
    setTimeout(() => {
      onConfirm();
    }, 400);
  }, [onConfirm]);

  // Hold-to-confirm loop
  const stopHolding = useCallback(() => {
    setIsHolding(false);
    holdStartTimeRef.current = null;
    if (holdAnimFrameRef.current) {
      cancelAnimationFrame(holdAnimFrameRef.current);
      holdAnimFrameRef.current = null;
    }
    if (!hasConfirmedRef.current) {
      // Smoothly drain progress back to 0
      setHoldProgress((prev) => (prev > 0 ? 0 : 0));
    }
  }, []);

  const startHolding = useCallback(() => {
    if (hasConfirmedRef.current) return;
    setIsHolding(true);
    triggerHaptic('light');
    const start = performance.now();
    holdStartTimeRef.current = start;
    lastHapticStepRef.current = 0;

    const tick = (now: number) => {
      if (hasConfirmedRef.current) return;
      const elapsed = now - start;
      const progress = Math.min(1.0, elapsed / holdDurationMs);
      setHoldProgress(progress);

      // Progressive haptics as hold nears completion
      const step = Math.floor(progress * 10);
      if (step > lastHapticStepRef.current) {
        lastHapticStepRef.current = step;
        if (mode === 'ultra' && progress > 0.7) {
          triggerHaptic('medium');
        } else {
          triggerHaptic('light');
        }
      }

      if (progress >= 1.0) {
        triggerConfirmed();
      } else {
        holdAnimFrameRef.current = requestAnimationFrame(tick);
      }
    };

    holdAnimFrameRef.current = requestAnimationFrame(tick);
  }, [holdDurationMs, mode, triggerConfirmed]);

  // Keyboard support: Hold Space or Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      if (!isHolding && !hasConfirmedRef.current) {
        e.preventDefault();
        startHolding();
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!hasConfirmedRef.current) {
        stopHolding();
      }
    }
  };

  // Drag down on handle to dismiss
  const handleDragStart = (e: React.PointerEvent) => {
    dragStartYRef.current = e.clientY;
    isDraggingSheetRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!isDraggingSheetRef.current || dragStartYRef.current === null) return;
    const dy = e.clientY - dragStartYRef.current;
    if (dy > 0) {
      setDragDownY(dy);
    }
  };

  const handleDragEnd = () => {
    if (!isDraggingSheetRef.current) return;
    isDraggingSheetRef.current = false;
    if (dragDownY > 80) {
      triggerHaptic('light');
      onCancel();
    } else {
      setDragDownY(0);
    }
    dragStartYRef.current = null;
  };

  // Resolved allowed app items for preview strip
  const allowedDisplayItems = useMemo(() => {
    if (allowedApps.length === 0) return [];
    return allowedApps.slice(0, 8).map((pkg) => {
      const app = installedAppsMap.get(pkg);
      const name = app?.name || pkg.split('.').pop() || pkg;
      let iconSrc: string | null = null;
      if (app?.icon) {
        iconSrc = app.icon.startsWith('data:') ? app.icon : `data:image/png;base64,${app.icon}`;
      }
      return {
        pkg,
        name,
        icon: iconSrc,
      };
    });
  }, [allowedApps, installedAppsMap]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const isUltra = mode === 'ultra';

  // Mode Theme Values
  const accentColor = isUltra ? '#E5383B' : '#F5A623';
  const accentLight = isUltra ? '#FF6B6B' : '#FFC857';
  const title = isUltra ? 'Ultra Strict' : 'Strict Mode';
  const subtitle = isUltra
    ? 'No pause. No cancel. No way out until it ends.'
    : 'Blocked apps stay locked until you press stop.';
  const confirmLabel = isUltra ? 'Hold to seal' : 'Hold to start';
  const confirmConsequence = isUltra
    ? `By holding, you accept that you can't stop until ${endTimeStr || 'the end time'}.`
    : 'Release to cancel.';
  const summaryTimeLine = isUltra
    ? `Sealed until ${endTimeStr || 'countdown ends'}`
    : `Ends at ${endTimeStr || 'countdown ends'}`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lockdown-sheet-title"
      aria-describedby="lockdown-sheet-desc"
      className="fixed inset-0 z-[150] flex flex-col justify-end sm:justify-center sm:items-center bg-black/80 backdrop-blur-md transition-opacity duration-200"
      onClick={onCancel}
    >
      {/* Container: Bottom sheet on mobile, centered modal on desktop */}
      <div
        className={`relative w-full sm:max-w-[480px] rounded-t-[28px] sm:rounded-[28px] overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] text-white shadow-2xl transition-transform duration-280 ${
          prefersReducedMotion ? '' : 'animate-in slide-in-from-bottom-8 duration-280'
        }`}
        style={{
          backgroundColor: isUltra ? '#0D0607' : '#0A0A0C',
          transform: dragDownY > 0 ? `translateY(${dragDownY}px)` : undefined,
          boxShadow: isUltra
            ? '0 -8px 40px -10px rgba(229, 56, 59, 0.25), 0 20px 60px rgba(0, 0, 0, 0.9)'
            : '0 -8px 40px -10px rgba(245, 166, 35, 0.18), 0 20px 60px rgba(0, 0, 0, 0.9)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle SVG Noise Texture (4% opacity) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04] mix-blend-overlay z-0"
          aria-hidden="true"
        >
          <filter id="lockdown-sheet-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#lockdown-sheet-grain)" />
        </svg>

        {/* Ultra-only: Thin diagonal hazard-stripe edge at the top (4px, 25% opacity) */}
        {isUltra && (
          <div
            className="w-full h-1 shrink-0 opacity-25 z-10"
            style={{
              background: 'repeating-linear-gradient(45deg, #E5383B, #E5383B 6px, transparent 6px, transparent 12px)',
            }}
            aria-hidden="true"
          />
        )}

        {/* Top Edge Breathing Glow */}
        <div
          className={`absolute top-0 inset-x-0 h-28 pointer-events-none z-0 ${
            prefersReducedMotion ? 'opacity-30' : 'animate-[lockdownGlow_5s_ease-in-out_infinite]'
          }`}
          style={{
            background: isUltra
              ? 'radial-gradient(ellipse 90% 70px at 50% 0%, rgba(229, 56, 59, 0.35), transparent 75%)'
              : 'radial-gradient(ellipse 90% 70px at 50% 0%, rgba(245, 166, 35, 0.28), transparent 75%)',
          }}
          aria-hidden="true"
        />

        {/* Mobile Drag Handle */}
        <div
          className="w-full pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing sm:hidden z-10 relative touch-none"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div className="w-9 h-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors" />
        </div>

        {/* Scrollable Sheet Content */}
        <div className="overflow-y-auto px-6 pt-3 pb-4 space-y-5 z-10 relative">
          {/* Header Section */}
          <div className="flex flex-col items-center text-center pt-2">
            {/* Custom Shield Lock Glyph (Inline SVG, ~72px) */}
            <div className="relative mb-3.5 flex items-center justify-center">
              <svg
                width="72"
                height="72"
                viewBox="0 0 72 72"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="overflow-visible"
                aria-hidden="true"
              >
                {/* Lock Snap Pulsing Ring (Animates upon confirmation) */}
                {isLockedSnap && (
                  <circle
                    cx="36"
                    cy="40"
                    r="34"
                    stroke={accentLight}
                    strokeWidth="2"
                    fill="none"
                    className="animate-[lockSnapRing_400ms_ease-out_forwards]"
                  />
                )}

                {/* Shackle: Arches down into shield body; snaps down upon confirmation */}
                <path
                  d="M24 34V23C24 16.3726 29.3726 11 36 11C42.6274 11 48 16.3726 48 23V34"
                  stroke={accentColor}
                  strokeWidth={isUltra ? '2.4' : '2.0'}
                  strokeLinecap="round"
                  className={`transition-transform duration-300 ${
                    isLockedSnap ? 'translate-y-2' : ''
                  } ${prefersReducedMotion ? '' : 'animate-[dashDraw_600ms_ease-out_forwards]'}`}
                  style={{
                    strokeDasharray: 60,
                    strokeDashoffset: prefersReducedMotion ? 0 : undefined,
                  }}
                />

                {/* Shield Body */}
                <path
                  d="M17 32L36 26L55 32V44C55 54 46.5 61.5 36 64.5C25.5 61.5 17 54 17 44V32Z"
                  stroke={accentColor}
                  strokeWidth={isUltra ? '2.4' : '2.0'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill={isUltra ? 'rgba(229,56,59,0.08)' : 'rgba(245,166,35,0.07)'}
                  className={prefersReducedMotion ? '' : 'animate-[dashDraw_700ms_ease-out_forwards]'}
                  style={{
                    strokeDasharray: 180,
                    strokeDashoffset: prefersReducedMotion ? 0 : undefined,
                  }}
                />

                {/* Keyhole */}
                <circle cx="36" cy="42" r="3.2" fill={accentColor} />
                <path
                  d="M34.5 43.5L33.5 50.5H38.5L37.5 43.5"
                  fill={accentColor}
                />
              </svg>
            </div>

            {/* Title */}
            <div className="flex items-center justify-center gap-2">
              <h2
                id="lockdown-sheet-title"
                className="font-hud text-3xl font-bold tracking-tight text-white leading-tight"
              >
                {title}
              </h2>
              {/* Ultra-only: Small solid label 'Irreversible' */}
              {isUltra && (
                <span className="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold text-xs tracking-normal border border-red-500/30 select-none">
                  Irreversible
                </span>
              )}
            </div>

            {/* Subtitle */}
            <p id="lockdown-sheet-desc" className="text-[15px] text-white/65 mt-1.5 max-w-[340px] leading-snug">
              {subtitle}
            </p>
          </div>

          {/* Ticket Style Summary (No Box) */}
          <div className="pt-2 pb-1 text-center">
            {/* Countdown length + Subject */}
            <div className="flex flex-col items-center justify-center">
              <div className="font-hud text-4xl sm:text-[44px] font-bold text-white tracking-tight leading-none">
                {formatDurationDisplay(countdownSeconds)}
              </div>
              {subjectName && (
                <div className="flex items-center gap-1.5 mt-2 text-sm text-white/65">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: accentColor }}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-white/90 truncate max-w-[260px]">{subjectName}</span>
                </div>
              )}
            </div>

            {/* Dashed Perforated Divider with Notches */}
            <div className="relative my-4 flex items-center justify-center">
              <div className="w-full border-b border-dashed border-white/15" />
              {/* Left Notch */}
              <div
                className="absolute -left-6 w-3 h-3 rounded-full bg-black/90 pointer-events-none"
                style={{ clipPath: 'polygon(50% 0, 100% 0, 100% 100%, 50% 100%)' }}
                aria-hidden="true"
              />
              {/* Right Notch */}
              <div
                className="absolute -right-6 w-3 h-3 rounded-full bg-black/90 pointer-events-none"
                style={{ clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)' }}
                aria-hidden="true"
              />
            </div>

            {/* Computed End Time Line */}
            <div className="flex items-center justify-center gap-1.5 text-xs text-white/60">
              <Clock className="w-3.5 h-3.5" style={{ color: accentColor }} />
              <span>{summaryTimeLine}</span>
            </div>
          </div>

          {/* Rules List (Clean rows, separated by 1px 8% white hairlines, no box, no bullets) */}
          <div className="space-y-0 border-t border-white/[0.08]">
            {isUltra ? (
              // Ultra Strict: 4 Rules
              <>
                <div className="py-3 border-b border-white/[0.08] flex items-start gap-3 text-left">
                  <Ban className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
                  <div>
                    <p className="font-semibold text-white text-sm">Irreversible</p>
                    <p className="text-[13.5px] text-white/65 mt-0.5 leading-snug">
                      No pause, cancel or stop early until the end time.
                    </p>
                  </div>
                </div>

                <div className="py-3 border-b border-white/[0.08] flex items-start gap-3 text-left">
                  <Lock className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
                  <div>
                    <p className="font-semibold text-white text-sm">Sealed apps</p>
                    <p className="text-[13.5px] text-white/65 mt-0.5 leading-snug">
                      {effectiveAllowedCount > 0
                        ? `Blocked apps stay locked, only your ${effectiveAllowedCount} allowed app${
                            effectiveAllowedCount === 1 ? '' : 's'
                          } open.`
                        : 'Blocked apps stay locked, no unauthorized apps can open.'}
                    </p>
                  </div>
                </div>

                <div className="py-3 border-b border-white/[0.08] flex items-start gap-3 text-left">
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
                  <div>
                    <p className="font-semibold text-white text-sm">Anti-bypass</p>
                    <p className="text-[13.5px] text-white/65 mt-0.5 leading-snug">
                      Leaving or switching apps returns you here.
                    </p>
                  </div>
                </div>

                <div className="py-3 border-b border-white/[0.08] flex items-start gap-3 text-left">
                  <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
                  <div>
                    <p className="font-semibold text-white text-sm">Uninstall protection</p>
                    <p className="text-[13.5px] text-white/65 mt-0.5 leading-snug">
                      Device Admin and System Shield stop deleting, uninstalling or force-stopping study.io until the countdown ends.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              // Strict Mode: 3 Rules
              <>
                <div className="py-3 border-b border-white/[0.08] flex items-start gap-3 text-left">
                  <Lock className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <p className="font-semibold text-white text-sm">Blocked apps locked</p>
                    <p className="text-[13.5px] text-white/65 mt-0.5 leading-snug">
                      Stay locked until you press stop.
                    </p>
                  </div>
                </div>

                <div className="py-3 border-b border-white/[0.08] flex items-start gap-3 text-left">
                  <Shield className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <p className="font-semibold text-white text-sm">Shield active</p>
                    <p className="text-[13.5px] text-white/65 mt-0.5 leading-snug">
                      Opening a blocked app returns you here.
                    </p>
                  </div>
                </div>

                <div className="py-3 border-b border-white/[0.08] flex items-start gap-3 text-left">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <p className="font-semibold text-white text-sm">
                      {effectiveAllowedCount > 0 ? `Your ${effectiveAllowedCount} allowed apps` : 'Allowed apps'}
                    </p>
                    <p className="text-[13.5px] text-white/65 mt-0.5 leading-snug">
                      {effectiveAllowedCount > 0
                        ? 'Only these stay open.'
                        : 'No allowed apps selected — all non-essential apps stay locked.'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Under rules: "Still allowed" strip with real allowed apps */}
          {effectiveAllowedCount > 0 && (
            <div className="pt-1 pb-1">
              <div className="text-[11px] font-semibold text-white/45 uppercase tracking-wider mb-2">
                Still allowed during session
              </div>
              <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
                {allowedDisplayItems.length > 0 ? (
                  allowedDisplayItems.map((item) => (
                    <div
                      key={item.pkg}
                      title={item.name}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 shrink-0 select-none"
                    >
                      {item.icon ? (
                        <img
                          src={item.icon}
                          alt=""
                          className="w-5 h-5 rounded-md object-contain shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] text-black"
                          style={{ backgroundColor: accentColor }}
                        >
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs text-white/85 max-w-[90px] truncate">{item.name}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-white/60">
                    {effectiveAllowedCount} apps configured in Strict settings
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pinned Bottom Action Area */}
        <div className="sticky bottom-0 bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C]/95 to-[#0A0A0C]/80 backdrop-blur-sm pt-3 pb-[max(20px,env(safe-area-inset-bottom))] px-6 z-20 flex flex-col items-center gap-2">
          {/* Accessible alternative for screen readers / TalkBack */}
          <button
            type="button"
            className="sr-only focus:not-sr-only focus:static focus:mb-2 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-white focus:text-black focus:font-bold focus:z-50 cursor-pointer"
            onClick={triggerConfirmed}
            aria-label={`Accept ${title} and start countdown. ${confirmConsequence}`}
          >
            Accept and start {title}
          </button>

          {/* Full-width "Hold to confirm" Button (60px tall, 18px radius) */}
          <button
            type="button"
            role="button"
            aria-label={`${confirmLabel}. ${confirmConsequence}`}
            onPointerDown={startHolding}
            onPointerUp={stopHolding}
            onPointerLeave={stopHolding}
            onPointerCancel={stopHolding}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            disabled={hasConfirmedRef.current}
            className="relative w-full h-[60px] rounded-[18px] overflow-hidden select-none touch-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black transition-transform active:scale-[0.985] cursor-pointer"
            style={{
              backgroundColor: isUltra ? 'rgba(229, 56, 59, 0.15)' : 'rgba(245, 166, 35, 0.12)',
              border: isUltra ? '1px solid rgba(229, 56, 59, 0.35)' : '1px solid rgba(245, 166, 35, 0.30)',
            }}
          >
            {/* Fill sweep animation (scaleX from left) */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                transformOrigin: 'left',
                transform: `scaleX(${holdProgress})`,
                transition: isHolding ? 'none' : 'transform 240ms ease-out',
                background: isUltra
                  ? 'linear-gradient(90deg, #B91C1C 0%, #E5383B 70%, #FF6B6B 100%)'
                  : 'linear-gradient(90deg, #D97706 0%, #F5A623 70%, #FFC857 100%)',
              }}
              aria-hidden="true"
            />

            {/* Hold Button Content */}
            <div className="relative z-10 w-full h-full flex items-center justify-center gap-2.5">
              <Lock
                className={`w-4 h-4 transition-transform duration-200 ${
                  isHolding ? 'scale-110' : ''
                } ${isUltra ? 'text-white' : holdProgress > 0.5 ? 'text-[#1A1405]' : 'text-white'}`}
              />
              <span
                className={`font-hud font-bold text-sm uppercase tracking-wider transition-colors duration-200 ${
                  isUltra
                    ? 'text-white drop-shadow-sm'
                    : holdProgress > 0.5
                    ? 'text-[#1A1405]'
                    : 'text-white'
                }`}
              >
                {confirmLabel}
              </span>
            </div>
          </button>

          {/* Consequence Caption */}
          <p className="text-[12.5px] text-white/50 text-center leading-snug px-2">
            {confirmConsequence}
          </p>

          {/* Quiet Cancel Text Button (44px min hit area) */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onCancel();
            }}
            className="w-full h-11 flex items-center justify-center text-[14px] text-white/50 hover:text-white transition-colors cursor-pointer select-none font-medium mt-0.5"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Embedded CSS for custom keyframe animations */}
      <style jsx global>{`
        @keyframes lockdownGlow {
          0%, 100% {
            opacity: 0.25;
          }
          50% {
            opacity: 0.40;
          }
        }
        @keyframes dashDraw {
          from {
            stroke-dashoffset: 180;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes lockSnapRing {
          0% {
            r: 22;
            opacity: 1;
            stroke-width: 3;
          }
          100% {
            r: 38;
            opacity: 0;
            stroke-width: 1;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
