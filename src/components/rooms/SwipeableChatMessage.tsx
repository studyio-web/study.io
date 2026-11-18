'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Reply } from 'lucide-react';
import { triggerHaptic } from '@/lib/native-feel';

interface SwipeableChatMessageProps {
  id?: string;
  isMe: boolean;
  onReply: () => void;
  children: React.ReactNode;
  className?: string;
}

const SWIPE_THRESHOLD = 45; // Pixels needed to trigger reply (WhatsApp / Instagram standard)
const MAX_DRAG = 68; // Maximum visual travel with damping

export const SwipeableChatMessage = React.memo(function SwipeableChatMessage({
  id,
  isMe,
  onReply,
  children,
  className = '',
}: SwipeableChatMessageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const [dragOffset, setDragOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [hasTriggeredHaptic, setHasTriggeredHaptic] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const directionLockRef = useRef<'horizontal' | 'vertical' | null>(null);
  const isTriggeredRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    directionLockRef.current = null;
    isTriggeredRef.current = false;
    setHasTriggeredHaptic(false);

    if (bubbleRef.current) {
      bubbleRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - touchStartRef.current.x;
    const dy = currentY - touchStartRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Initial direction disambiguation (wait for 6px travel)
    if (directionLockRef.current === null) {
      if (absDx < 6 && absDy < 6) return;

      if (absDy > absDx) {
        // Vertical message list scroll dominant: release control completely
        directionLockRef.current = 'vertical';
        touchStartRef.current = null;
        return;
      } else {
        // Horizontal swipe-to-reply dominant
        directionLockRef.current = 'horizontal';
        setIsSwiping(true);
      }
    }

    if (directionLockRef.current === 'horizontal') {
      // Prevent parent scroll and tab navigation while swiping message
      if (e.cancelable) {
        e.preventDefault();
      }

      // Swipe direction logic:
      // - Incoming messages (!isMe): swipe right (dx > 0)
      // - Outgoing messages (isMe): swipe left (dx < 0) or swipe right (dx > 0)
      let effectiveDx = dx;
      if (!isMe && dx < 0) {
        effectiveDx = dx * 0.1; // heavy resistance swiping wrong way
      } else if (isMe && dx > 0) {
        // Allow swiping right for WhatsApp muscle memory on outgoing messages too
        effectiveDx = dx * 0.7;
      }

      const sign = Math.sign(effectiveDx);
      const dist = Math.abs(effectiveDx);

      // Rubber-band damping past threshold
      let offset = 0;
      if (dist <= SWIPE_THRESHOLD) {
        offset = dist;
      } else {
        offset = SWIPE_THRESHOLD + (dist - SWIPE_THRESHOLD) * 0.28;
      }
      offset = Math.min(offset, MAX_DRAG);
      const finalOffset = sign * offset;

      setDragOffset(finalOffset);

      if (bubbleRef.current) {
        bubbleRef.current.style.transform = `translate3d(${finalOffset}px, 0, 0)`;
      }

      // Haptic feedback & triggered state
      if (dist >= SWIPE_THRESHOLD) {
        if (!isTriggeredRef.current) {
          isTriggeredRef.current = true;
          setHasTriggeredHaptic(true);
          triggerHaptic('light');
        }
      } else {
        if (isTriggeredRef.current) {
          isTriggeredRef.current = false;
          setHasTriggeredHaptic(false);
        }
      }
    }
  }, [isMe]);

  const handleTouchEnd = useCallback(() => {
    if (directionLockRef.current === 'horizontal') {
      if (isTriggeredRef.current) {
        onReply();
      }

      // Spring smoothly back to rest position
      if (bubbleRef.current) {
        bubbleRef.current.style.transition = 'transform 0.22s cubic-bezier(0.18, 0.9, 0.32, 1)';
        bubbleRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
    }

    touchStartRef.current = null;
    directionLockRef.current = null;
    isTriggeredRef.current = false;
    setDragOffset(0);
    setIsSwiping(false);
    setHasTriggeredHaptic(false);
  }, [onReply]);

  const absOffset = Math.abs(dragOffset);
  const swipeProgress = Math.min(absOffset / SWIPE_THRESHOLD, 1);
  const isRightSwipe = dragOffset > 0;

  return (
    <div
      ref={containerRef}
      id={id}
      data-no-room-swipe="true"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`relative w-full overflow-visible touch-pan-y select-none ${className}`}
    >
      {/* Revealed Swipe-To-Reply Action Indicator (Instagram / WhatsApp style) */}
      {absOffset > 4 && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none transition-transform z-0 ${
            isRightSwipe ? 'left-1' : 'right-1'
          }`}
          style={{
            opacity: swipeProgress,
            transform: `translateY(-50%) scale(${0.7 + swipeProgress * 0.35 + (hasTriggeredHaptic ? 0.15 : 0)})`,
          }}
        >
          <div
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all ${
              hasTriggeredHaptic
                ? 'bg-amber-500/30 text-amber-300 border border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)] scale-110'
                : 'bg-white/[0.08] text-neutral-300 border border-white/15'
            }`}
          >
            <Reply className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRightSwipe ? '' : '-scale-x-100'}`} />
          </div>
        </div>
      )}

      {/* Main Draggable Message Bubble */}
      <div
        ref={bubbleRef}
        className="w-full will-change-transform relative z-10"
      >
        {children}
      </div>
    </div>
  );
});
