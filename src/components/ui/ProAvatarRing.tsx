'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface ProAvatarRingProps {
  isPro: boolean;
  isStudying?: boolean;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
  defaultBorder?: boolean;
}

const SIZE_MAP = {
  sm: {
    ringMargin: 'm-[2px]',
    innerPad: 'p-[1.5px]',
    glow: 'blur-[4px] -inset-[2px]',
  },
  md: {
    ringMargin: 'm-[2.5px]',
    innerPad: 'p-[2px]',
    glow: 'blur-[6px] -inset-[3px]',
  },
  lg: {
    ringMargin: 'm-[3px]',
    innerPad: 'p-[2.5px]',
    glow: 'blur-[8px] -inset-[4px]',
  },
};

const PRO_CONIC_GRADIENT =
  'conic-gradient(from 0deg, #F59E0B 0%, #06B6D4 33%, #8B5CF6 66%, #F59E0B 100%)';

export const ProAvatarRing = React.memo(function ProAvatarRing({
  isPro,
  isStudying = false,
  size = 'md',
  children,
  className,
  defaultBorder = false,
}: ProAvatarRingProps) {
  const config = SIZE_MAP[size] || SIZE_MAP.md;

  // Non-Pro state: render children normally (or with subtle solid/glow border in rooms)
  if (!isPro) {
    if (defaultBorder) {
      return (
        <div className={cn('relative inline-flex items-center justify-center rounded-full shrink-0', className)}>
          <div
            className={cn(
              'rounded-full p-[2px] bg-[#09090b] transition-all duration-300 flex items-center justify-center',
              isStudying
                ? 'border-2 border-emerald-500/70 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                : 'border border-white/10'
            )}
          >
            {children}
          </div>
        </div>
      );
    }
    return (
      <div className={cn('relative inline-flex items-center justify-center shrink-0 rounded-full', className)}>
        {children}
      </div>
    );
  }

  // Pro state: signature conic-gradient profile ring
  return (
    <div className={cn('relative inline-flex items-center justify-center rounded-full shrink-0 select-none', className)}>
      {/* 1. Soft low-opacity outer glow matching gradient (Active Studying Mode only) */}
      {isStudying && (
        <motion.div
          className={cn('absolute rounded-full pointer-events-none opacity-45 will-change-transform transform-gpu', config.glow)}
          style={{
            background: PRO_CONIC_GRADIENT,
          }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
        />
      )}

      {/* 2. Signature Pro Conic-Gradient Ring (Rotates if studying, static if paused/idle) */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none overflow-hidden will-change-transform transform-gpu"
        animate={isStudying ? { rotate: 360 } : { rotate: 0 }}
        transition={
          isStudying
            ? { repeat: Infinity, duration: 4, ease: 'linear' }
            : { duration: 0.3, ease: 'easeOut' }
        }
      >
        <div
          className="w-full h-full rounded-full"
          style={{
            background: PRO_CONIC_GRADIENT,
          }}
        />
      </motion.div>

      {/* 3. Dark inner gap (#09090b) separating ring from avatar */}
      <div
        className={cn(
          'relative z-10 rounded-full bg-[#09090b] flex items-center justify-center overflow-hidden',
          config.ringMargin,
          config.innerPad
        )}
      >
        {children}
      </div>
    </div>
  );
});

ProAvatarRing.displayName = 'ProAvatarRing';
