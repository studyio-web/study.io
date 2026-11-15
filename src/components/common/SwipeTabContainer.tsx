'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { NavTabType } from './Navbar';

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
  const activeIndex = TABS.indexOf(activeTab);
  const [displayIndex, setDisplayIndex] = useState(activeIndex >= 0 ? activeIndex : 0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Synchronize internal display index whenever parent activeTab updates
  useEffect(() => {
    const idx = TABS.indexOf(activeTab);
    if (idx >= 0) {
      setDisplayIndex(idx);
      setDragX(0);
    }
  }, [activeTab]);

  // Safeguard: Ensure container never retains rogue horizontal scrollLeft from child focus events
  const handleScroll = useCallback(() => {
    if (containerRef.current && containerRef.current.scrollLeft !== 0) {
      containerRef.current.scrollLeft = 0;
    }
  }, []);

  useEffect(() => {
    if (containerRef.current && containerRef.current.scrollLeft !== 0) {
      containerRef.current.scrollLeft = 0;
    }
  }, [displayIndex, dragX]);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isHorizontalLockRef = useRef<boolean | null>(null);

  // Check if touch originated from a non-swipable element (horizontal carousels, sliders, text inputs)
  const isNonSwipableElement = (el: HTMLElement | null): boolean => {
    let curr = el;
    while (curr && curr !== document.body) {
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
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const target = e.target as HTMLElement;
    if (isNonSwipableElement(target)) {
      touchStartRef.current = null;
      return;
    }

    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    isHorizontalLockRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - touchStartRef.current.x;
    const dy = currentY - touchStartRef.current.y;

    // Disambiguate horizontal swipe vs vertical scroll
    if (isHorizontalLockRef.current === null) {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > 6 || absDy > 6) {
        // Natural thumb swipe angle check
        if (absDx > absDy) {
          isHorizontalLockRef.current = true;
          setIsDragging(true);
        } else {
          isHorizontalLockRef.current = false;
          touchStartRef.current = null;
          return;
        }
      }
    }

    if (isHorizontalLockRef.current) {
      // Rubber-band resistance at outer boundary edges
      let effectiveDx = dx;
      if ((displayIndex === 0 && dx > 0) || (displayIndex === TABS.length - 1 && dx < 0)) {
        effectiveDx = dx * 0.22;
      }
      setDragX(effectiveDx);
    }
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current || !isHorizontalLockRef.current) {
      touchStartRef.current = null;
      isHorizontalLockRef.current = null;
      setIsDragging(false);
      setDragX(0);
      return;
    }

    const dt = Math.max(1, Date.now() - touchStartRef.current.time);
    const velocity = Math.abs(dragX) / dt; // px/ms
    const distanceThreshold = 45; // px (responsive, natural thumb flick)
    const velocityThreshold = 0.2; // px/ms

    let targetIdx = displayIndex;
    if ((Math.abs(dragX) > distanceThreshold || velocity > velocityThreshold) && Math.abs(dragX) > 18) {
      if (dragX < 0 && displayIndex < TABS.length - 1) {
        // Swipe Left -> Advance to Next Tab smoothly
        targetIdx = displayIndex + 1;
      } else if (dragX > 0 && displayIndex > 0) {
        // Swipe Right -> Go to Previous Tab smoothly
        targetIdx = displayIndex - 1;
      }
    }

    // Immediately advance displayIndex so track glides forward seamlessly without snapback
    setDisplayIndex(targetIdx);
    setIsDragging(false);
    setDragX(0);
    touchStartRef.current = null;
    isHorizontalLockRef.current = null;

    if (targetIdx !== activeIndex) {
      onChangeTab(TABS[targetIdx]);
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="w-full h-full min-h-0 overflow-hidden relative flex-1 flex flex-col touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Dynamic Sliding Track (GPU-accelerated 120fps motion) */}
      <div
        className="flex w-full h-full min-h-0 flex-1 transform-gpu will-change-transform"
        style={{
          width: `${TABS.length * 100}%`,
          transform: `translate3d(calc(-${displayIndex * (100 / TABS.length)}% + ${dragX}px), 0, 0)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {TABS.map((tab, idx) => {
          // Keep active tab and adjacent neighbors mounted so swipe transitions are 100% gapless
          const isNeighbor = Math.abs(idx - displayIndex) <= 1 || Math.abs(idx - activeIndex) <= 1;

          return (
            <div
              key={tab}
              className={`flex-shrink-0 flex flex-col h-full min-h-0 ${
                displayIndex === idx
                  ? (tab === 'timer' || tab === 'rooms')
                    ? 'overflow-hidden pb-0'
                    : 'overflow-y-auto pb-28 overscroll-contain'
                  : 'overflow-hidden pointer-events-none'
              }`}
              style={{
                width: `${100 / TABS.length}%`,
                visibility: isNeighbor ? 'visible' : 'hidden',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div className="w-full h-full flex-1">
                {isNeighbor ? children[tab] : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
