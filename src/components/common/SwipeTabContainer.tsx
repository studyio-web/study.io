'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NavTabType } from './Navbar';
import { hapticTick } from '@/lib/haptics';

const TABS: NavTabType[] = ['timer', 'tasks', 'analytics', 'leaderboard', 'rooms', 'settings'];

interface SwipeTabContainerProps {
  activeTab: NavTabType;
  onChangeTab: (tab: NavTabType) => void;
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
  children,
}: SwipeTabContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const activeIndex = Math.max(0, TABS.indexOf(activeTab));
  const [currentTabIdx, setCurrentTabIdx] = useState(activeIndex);

  // Mutable refs for tracking gesture without ANY React re-renders during motion
  const isDraggingRef = useRef(false);
  const dragXRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isHorizontalLockRef = useRef<boolean | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const currentIdxRef = useRef(activeIndex);

  // Keep track of which tabs have been visited so we preserve their mounted state
  const [visitedIndices, setVisitedIndices] = useState<Set<number>>(() => new Set([activeIndex, 0, 1]));

  // Synchronize track position when activeTab prop updates (e.g. from navbar clicks)
  useEffect(() => {
    const idx = Math.max(0, TABS.indexOf(activeTab));
    currentIdxRef.current = idx;
    setCurrentTabIdx(idx);

    setVisitedIndices((prev) => {
      const next = new Set(prev);
      next.add(idx);
      if (idx > 0) next.add(idx - 1);
      if (idx < TABS.length - 1) next.add(idx + 1);
      return next;
    });

    if (trackRef.current && !isDraggingRef.current) {
      trackRef.current.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)';
      trackRef.current.style.transform = `translate3d(-${idx * (100 / TABS.length)}%, 0, 0)`;
    }
  }, [activeTab]);

  // Safeguard: Ensure container never retains rogue horizontal scrollLeft from child focus events
  const handleScroll = useCallback(() => {
    if (containerRef.current && containerRef.current.scrollLeft !== 0) {
      containerRef.current.scrollLeft = 0;
    }
  }, []);

  // Check if touch originated from a non-swipable element (horizontal carousels, sliders, text inputs)
  const isNonSwipable = useCallback((target: HTMLElement | null): boolean => {
    let curr = target;
    while (curr && curr !== containerRef.current && curr !== document.body) {
      if (curr.getAttribute('data-no-swipe') === 'true') return true;
      if (curr.tagName === 'INPUT' || curr.tagName === 'TEXTAREA' || curr.tagName === 'SELECT') return true;
      // If element is horizontally scrollable
      const style = window.getComputedStyle(curr);
      if (
        (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
        curr.scrollWidth > curr.clientWidth
      ) {
        return true;
      }
      curr = curr.parentElement;
    }
    return false;
  }, []);

  // Native non-passive touch listeners for 120fps hardware-accelerated direct DOM manipulation
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

      // Disambiguate horizontal swipe vs vertical scroll with slight threshold
      if (isHorizontalLockRef.current === null) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDx > 6 || absDy > 6) {
          if (absDx > absDy * 1.1) {
            isHorizontalLockRef.current = true;
            isDraggingRef.current = true;
            if (trackRef.current) {
              trackRef.current.style.transition = 'none';
            }
          } else {
            isHorizontalLockRef.current = false;
            touchStartRef.current = null;
            return;
          }
        }
      }

      if (isHorizontalLockRef.current) {
        // Prevent vertical page scroll or Android browser gesture conflicts while horizontally dragging
        if (e.cancelable) {
          e.preventDefault();
        }

        const idx = currentIdxRef.current;
        // Rubber-band resistance at boundary edges
        let effectiveDx = dx;
        if ((idx === 0 && dx > 0) || (idx === TABS.length - 1 && dx < 0)) {
          effectiveDx = dx * 0.22;
        }

        dragXRef.current = effectiveDx;

        // Decouple touch event stream from GPU render loop via requestAnimationFrame
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(() => {
            if (trackRef.current && isDraggingRef.current) {
              const basePercent = -(idx * (100 / TABS.length));
              trackRef.current.style.transform = `translate3d(calc(${basePercent}% + ${dragXRef.current}px), 0, 0)`;
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
      const distanceThreshold = 36; // px (responsive flick)
      const velocityThreshold = 0.18; // px/ms

      const currentIdx = currentIdxRef.current;
      let targetIdx = currentIdx;

      if ((Math.abs(finalDx) > distanceThreshold || velocity > velocityThreshold) && Math.abs(finalDx) > 14) {
        if (finalDx < 0 && currentIdx < TABS.length - 1) {
          targetIdx = currentIdx + 1;
        } else if (finalDx > 0 && currentIdx > 0) {
          targetIdx = currentIdx - 1;
        }
      }

      // Smoothly animate track directly to target position with natural spring curve
      if (trackRef.current) {
        trackRef.current.style.transition = 'transform 0.26s cubic-bezier(0.2, 0.9, 0.3, 1)';
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
        onChangeTab(TABS[targetIdx]);
      }
    };

    // Attach native touch listeners with passive: false for touchmove to allow preventing vertical scroll interference
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
      {/* Dynamic Sliding Track (GPU-accelerated direct translate3d compositor) */}
      <div
        ref={trackRef}
        className="flex w-full h-full min-h-0 flex-1 will-change-transform"
        style={{
          width: `${TABS.length * 100}%`,
          transform: `translate3d(-${currentTabIdx * (100 / TABS.length)}%, 0, 0)`,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          perspective: 1000,
          WebkitPerspective: 1000,
        }}
      >
        {TABS.map((tab, idx) => {
          const isActive = idx === currentTabIdx;
          const isNeighbor = Math.abs(idx - currentTabIdx) <= 1;
          const shouldRender = isNeighbor || visitedIndices.has(idx);

          return (
            <div
              key={tab}
              className={`flex-shrink-0 flex flex-col h-full min-h-0 ${
                isActive
                  ? (tab === 'timer' || tab === 'rooms')
                    ? 'overflow-hidden pb-0'
                    : 'overflow-y-auto pb-28 md:pb-12'
                  : 'overflow-hidden pointer-events-none'
              }`}
              style={{
                width: `${100 / TABS.length}%`,
                visibility: isNeighbor ? 'visible' : 'hidden',
                WebkitOverflowScrolling: 'touch',
                contain: 'content',
              }}
            >
              <div className="w-full h-full flex-1 min-h-0">
                {shouldRender ? children[tab] : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
