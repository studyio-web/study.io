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
    glow: 'blur-[6px] -inset-[3px]',
  },
  md: {
    ringMargin: 'm-[2.5px]',
    innerPad: 'p-[2px]',
    glow: 'blur-[8px] -inset-[4px]',
  },
  lg: {
    ringMargin: 'm-[3px]',
    innerPad: 'p-[2.5px]',
    glow: 'blur-[10px] -inset-[5px]',
  },
};

const PRO_GOLD_CONIC_GRADIENT =
  'conic-gradient(from 135deg, #451a03 0deg, #92400e 70deg, #eab308 130deg, #fef08a 160deg, #eab308 190deg, #92400e 250deg, #451a03 360deg)';

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

  // Pro state: sleek "Brushed Metallic Gold & Champagne" specular bezel
  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center rounded-full shrink-0 select-none transition-shadow duration-300',
        'shadow-[0_0_8px_rgba(234,179,8,0.18)]',
        className
      )}
    >
      {/* 1. Soft warm gold ambient glow (Active Studying Mode only, fades out when paused) */}
      {isStudying && (
        <motion.div
          className={cn(
            'absolute rounded-full pointer-events-none will-change-transform transform-gpu',
            config.glow
          )}
          style={{
            background: 'radial-gradient(circle, rgba(234,179,8,0.32) 0%, rgba(234,179,8,0) 70%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, rotate: 360 }}
          exit={{ opacity: 0 }}
          transition={{
            rotate: { repeat: Infinity, duration: 5, ease: 'linear' },
            opacity: { duration: 0.3 },
          }}
        />
      )}

      {/* 2. Metallic Gold Specular Bezel (Rotates 360° continuously when studying; static at 135deg when paused/idle) */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none overflow-hidden will-change-transform transform-gpu"
        animate={isStudying ? { rotate: 360 } : { rotate: 0 }}
        transition={
          isStudying
            ? { repeat: Infinity, duration: 5, ease: 'linear' }
            : { duration: 0.4, ease: 'easeOut' }
        }
      >
        <div
          className="w-full h-full rounded-full"
          style={{
            background: PRO_GOLD_CONIC_GRADIENT,
          }}
        />
      </motion.div>

      {/* 3. Dark inner gap (#09090b) between metallic ring and circular avatar */}
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
