'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NavTabType } from './Navbar';
import { hapticTick } from '@/lib/haptics';

const TABS: NavTabType[] = ['timer', 'tasks', 'analytics', 'leaderboard', 'rooms', 'settings'];

interface SwipeTabContainerProps {
  activeTab: NavTabType;
  onChangeTab: (tab: NavTabType) => void;
  disabled?: boolean;
  children: {
    timer: React.ReactNode;
    tasks: React.ReactNode;
    analytics: React.ReactNode;
    leaderboard?: React.ReactNode;
    settings?: React.ReactNode;
    rooms?: React.ReactNode;
  };
}

export function SwipeTabContainer({
  activeTab,
  onChangeTab,
  disabled = false,
  children,
}: SwipeTabContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const activeIndex = Math.max(0, TABS.indexOf(activeTab));
  const [currentTabIdx, setCurrentTabIdx] = useState(activeIndex);

  // Mutable refs for zero-overhead, 120fps gesture tracking
  const isDraggingRef = useRef(false);
  const isSwipeTransitioningRef = useRef(false);
  const dragXRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isHorizontalLockRef = useRef<boolean | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const currentIdxRef = useRef(activeIndex);
  const containerWidthRef = useRef(0);

  // Keep track of visited tabs to keep them mounted
  const [visitedIndices, setVisitedIndices] = useState<Set<number>>(() => new Set([activeIndex]));

  // Progressive background prefetching:
  // 1. Initial paint mounts only active tab for sub-500ms startup.
  // 2. At 150ms, prefetch immediate neighbors so initial swipe is instantaneous.
  // 3. At 800ms / idle, prefetch all remaining tabs so subsequent swipes have 0 lag.
  useEffect(() => {
    const t1 = setTimeout(() => {
      setVisitedIndices((prev) => {
        const next = new Set(prev);
        const idx = currentIdxRef.current;
        if (idx > 0) next.add(idx - 1);
        if (idx < TABS.length - 1) next.add(idx + 1);
        return next;
      });
    }, 150);

    const t2 = setTimeout(() => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          setVisitedIndices(new Set(TABS.map((_, i) => i)));
        });
      } else {
        setVisitedIndices(new Set(TABS.map((_, i) => i)));
      }
    }, 800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Synchronize track position when activeTab prop updates (e.g. from navbar clicks or deep links)
  useEffect(() => {
    const idx = Math.max(0, TABS.indexOf(activeTab));
    currentIdxRef.current = idx;
    setCurrentTabIdx(idx);

    setVisitedIndices((prev) => {
      if (prev.has(idx)) return prev;
      const next = new Set(prev);
      next.add(idx);
      if (idx > 0) next.add(idx - 1);
      if (idx < TABS.length - 1) next.add(idx + 1);
      return next;
    });

    // Don't interrupt if user is actively dragging or a swipe transition is in flight
    if (trackRef.current && !isDraggingRef.current && !isSwipeTransitioningRef.current) {
      trackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
      trackRef.current.style.transform = `translate3d(-${idx * (100 / TABS.length)}%, 0, 0)`;
    }
  }, [activeTab]);

  // Safeguard: Ensure container never retains rogue horizontal scrollLeft from child focus events
  const handleScroll = useCallback(() => {
    if (containerRef.current && containerRef.current.scrollLeft !== 0) {
      containerRef.current.scrollLeft = 0;
    }
  }, []);

  // Fast native check for non-swipable elements without layout thrashing / getComputedStyle loops
  const isNonSwipable = useCallback((target: HTMLElement | null): boolean => {
    if (disabled) return true;
    if (!target) return false;
    // If any modal, dialog, or overlay is currently active in the DOM, tab swipe is strictly disabled
    if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0.z-50, .fixed.inset-0.z-\\[60\\]')) {
      return true;
    }
    const nonSwipable = target.closest(
      'input, textarea, select, [data-no-swipe="true"], .overflow-x-auto, .overflow-x-scroll'
    );
    if (nonSwipable) {
      if (nonSwipable.getAttribute('data-no-swipe') === 'true') return true;
      if (nonSwipable.tagName === 'INPUT' || nonSwipable.tagName === 'TEXTAREA' || nonSwipable.tagName === 'SELECT') {
        return true;
      }
      if (nonSwipable.scrollWidth > nonSwipable.clientWidth) {
        return true;
      }
    }
    return false;
  }, []);

  // Native non-passive touch listeners for 120fps direct hardware compositing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (isNonSwipable(target)) {
        touchStartRef.current = null;
        return;
      }

      // Cache container width once on touchstart to avoid any layout thrashing during touchmove
      containerWidthRef.current = container.clientWidth || window.innerWidth || 360;

      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: performance.now(),
      };
      isHorizontalLockRef.current = null;
      isDraggingRef.current = false;
      dragXRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || e.touches.length !== 1) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const dx = currentX - touchStartRef.current.x;
      const dy = currentY - touchStartRef.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Disambiguate horizontal swipe vs vertical scroll
      if (isHorizontalLockRef.current === null) {
        // Wait until touch has moved at least 8px before deciding direction
        if (absDx < 8 && absDy < 8) {
          return;
        }

        if (absDx > absDy) {
          isHorizontalLockRef.current = true;
          isDraggingRef.current = true;
          if (trackRef.current) {
            trackRef.current.style.transition = 'none';
          }
        } else {
          // Vertical scroll dominant: pass control entirely to browser native scroll
          isHorizontalLockRef.current = false;
          touchStartRef.current = null;
          return;
        }
      }

      if (isHorizontalLockRef.current) {
        if (e.cancelable) {
          e.preventDefault();
        }

        const idx = currentIdxRef.current;
        const width = containerWidthRef.current;

        // Rubber-band resistance at boundary edges
        let effectiveDx = dx;
        if ((idx === 0 && dx > 0) || (idx === TABS.length - 1 && dx < 0)) {
          effectiveDx = dx * 0.25;
        }

        dragXRef.current = effectiveDx;

        // Pure pixel matrix translation — 0 layout calculations, direct GPU compositor execution
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(() => {
            if (trackRef.current && isDraggingRef.current) {
              const currentPx = -(idx * width) + dragXRef.current;
              trackRef.current.style.transform = `translate3d(${currentPx}px, 0, 0)`;
            }
            rafIdRef.current = null;
          });
        }
      }
    };

    const onTouchEnd = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      if (!touchStartRef.current || !isHorizontalLockRef.current || !isDraggingRef.current) {
        touchStartRef.current = null;
        isHorizontalLockRef.current = null;
        isDraggingRef.current = false;
        return;
      }

      const dt = Math.max(1, performance.now() - touchStartRef.current.time);
      const finalDx = dragXRef.current;
      const velocity = Math.abs(finalDx) / dt; // px/ms
      const distanceThreshold = (containerWidthRef.current || 360) * 0.2; // 20% of screen width
      const velocityThreshold = 0.22; // flick velocity

      const currentIdx = currentIdxRef.current;
      let targetIdx = currentIdx;

      if ((Math.abs(finalDx) > distanceThreshold || velocity > velocityThreshold) && Math.abs(finalDx) > 15) {
        if (finalDx < 0 && currentIdx < TABS.length - 1) {
          targetIdx = currentIdx + 1;
        } else if (finalDx > 0 && currentIdx > 0) {
          targetIdx = currentIdx - 1;
        }
      }

      // Mark transition as active to prevent effect interference
      isSwipeTransitioningRef.current = true;

      // Animate track to final resting position
      if (trackRef.current) {
        trackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
        trackRef.current.style.transform = `translate3d(-${targetIdx * (100 / TABS.length)}%, 0, 0)`;
      }

      // Reset gesture refs
      isDraggingRef.current = false;
      touchStartRef.current = null;
      isHorizontalLockRef.current = null;
      dragXRef.current = 0;

      if (targetIdx !== currentIdx) {
        currentIdxRef.current = targetIdx;
        setCurrentTabIdx(targetIdx);
        hapticTick();

        // Delay tab change dispatch until slide animation has visually settled (~170ms)
        // This ensures the GPU compositor is not interrupted by heavy React renders or API calls mid-flight
        setTimeout(() => {
          isSwipeTransitioningRef.current = false;
          onChangeTab(TABS[targetIdx]);
        }, 170);
      } else {
        setTimeout(() => {
          isSwipeTransitioningRef.current = false;
        }, 240);
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [isNonSwipable, onChangeTab]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="w-full h-full min-h-0 overflow-hidden relative flex-1 flex flex-col select-none touch-pan-y"
      style={{
        touchAction: 'pan-y pinch-zoom',
        contain: 'layout size',
      }}
    >
      {/* Dynamic Sliding Track (GPU-accelerated translate3d compositor) */}
      <div
        ref={trackRef}
        className="flex w-full h-full min-h-0 flex-1 will-change-transform"
        style={{
          width: `${TABS.length * 100}%`,
          transform: `translate3d(-${currentTabIdx * (100 / TABS.length)}%, 0, 0)`,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        {TABS.map((tab, idx) => {
          const isActive = idx === currentTabIdx;
          const isNeighbor = Math.abs(idx - currentTabIdx) <= 1;
          const shouldRender = isActive || visitedIndices.has(idx);

          // Dedicated per-tab layout and padding: stays stable across all swipes
          let tabPaddingClasses = 'overflow-y-auto pt-3.5 px-3 sm:px-4 md:px-0 pb-[calc(7rem+env(safe-area-inset-bottom,16px))] md:pb-12';
          if (tab === 'timer') {
            tabPaddingClasses = 'overflow-hidden justify-center pt-1 md:pt-2 px-3 sm:px-4 md:px-0 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-2';
          } else if (tab === 'rooms') {
            tabPaddingClasses = 'overflow-hidden pt-0 px-0 pb-0';
          }

          return (
            <div
              key={tab}
              className={`flex-shrink-0 flex flex-col h-full min-h-0 ${tabPaddingClasses} ${
                !isActive ? 'pointer-events-none' : ''
              }`}
              style={{
                width: `${100 / TABS.length}%`,
                visibility: isNeighbor ? 'visible' : 'hidden',
                WebkitOverflowScrolling: 'touch',
                contain: 'content',
              }}
            >
              <div className={`w-full ${tab === 'timer' || tab === 'rooms' ? 'h-full flex-1 min-h-0' : 'min-h-full flex-1'} flex flex-col items-center`}>
                {shouldRender ? children[tab] : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
