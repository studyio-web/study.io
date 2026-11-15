'use client';

import React, { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface ProAvatarRingProps {
  isPro: boolean;
  isStudying?: boolean;
  size?: 'sm' | 'md' | 'lg' | number;
  children: React.ReactNode;
  className?: string;
  defaultBorder?: boolean;
}

export const ProAvatarRing = React.memo(function ProAvatarRing({
  isPro,
  isStudying = false,
  children,
  className,
  defaultBorder = false,
}: ProAvatarRingProps) {
  const rawId = useId();
  const uniqueId = rawId.replace(/[^a-zA-Z0-9-_]/g, '_');
  const ringRadius = 37.5;

  // Non-Pro state in rooms: render standard clean border
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

  // Pro State (Rooms only): Signature Animated Focus Ring
  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 select-none',
        className
      )}
    >
      {/* Layer 1: Ambient Background Radial Glow */}
      <motion.div
        animate={
          isStudying
            ? {
                opacity: [0.75, 0.95, 0.75],
                scale: [0.98, 1.04, 0.98],
              }
            : {
                opacity: [0.35, 0.6, 0.35],
                scale: 1,
              }
        }
        transition={{
          duration: isStudying ? 2.5 : 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute inset-[-8px] rounded-full pointer-events-none -z-10 will-change-transform transform-gpu"
        style={{
          background: isStudying
            ? 'radial-gradient(circle, rgba(16,185,129,0.45) 0%, transparent 72%)'
            : 'radial-gradient(circle, rgba(245,158,11,0.2) 0%, transparent 68%)',
          filter: 'blur(8px)',
        }}
      />

      {/* Layer 2: 60fps GPU Animated SVG Focus Rings */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-[-14px] w-[calc(100%+28px)] h-[calc(100%+28px)] pointer-events-none select-none overflow-visible z-0 will-change-transform transform-gpu"
        style={{
          filter: isStudying ? 'drop-shadow(0 0 6px rgba(16,185,129,0.85))' : undefined,
        }}
      >
        <defs>
          <linearGradient id={`cyberCyan_${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>

          <linearGradient id={`defaultGrad_${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="50%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
        </defs>

        {!isStudying ? (
          /* STATE: PAUSED / IDLE IN ROOMS (Subtle breathing amber dashed focus ring) */
          <motion.g
            animate={{
              rotate: [0, 360],
              opacity: [0.6, 0.9, 0.6],
            }}
            transition={{
              rotate: { duration: 32, repeat: Infinity, ease: 'linear' },
              opacity: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{ transformOrigin: '50px 50px' }}
          >
            <circle
              cx="50"
              cy="50"
              r={ringRadius}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="1.75"
              strokeDasharray="4.5 4.5"
              strokeLinecap="round"
              opacity="0.85"
            />
          </motion.g>
        ) : (
          /* STATE: ACTIVELY STUDYING IN ROOMS (Signature Dual Pulse Focus Ring Matrix) */
          <g>
            {/* Outer Neon Cyan Tech Ring (Rotating Counter-Clockwise) with 2 Nodes */}
            <motion.g
              animate={{ rotate: [360, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: '50px 50px' }}
            >
              <circle
                cx="50"
                cy="50"
                r={ringRadius + 2.5}
                fill="none"
                stroke={`url(#cyberCyan_${uniqueId})`}
                strokeWidth="1.6"
                strokeDasharray="18 6 4 6"
              />
              {/* Outer Tech Nodes at 90Â° and 270Â° */}
              <circle cx={50 + (ringRadius + 2.5)} cy="50" r="2.4" fill="#06B6D4" />
              <circle cx={50 + (ringRadius + 2.5)} cy="50" r="1.2" fill="#FFFFFF" />
              <circle cx={50 - (ringRadius + 2.5)} cy="50" r="2.4" fill="#06B6D4" />
              <circle cx={50 - (ringRadius + 2.5)} cy="50" r="1.2" fill="#FFFFFF" />
            </motion.g>

            {/* Inner Emerald Pulse Ring (Rotating Clockwise) with 2 Nodes */}
            <motion.g
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: '50px 50px' }}
            >
              <circle
                cx="50"
                cy="50"
                r={ringRadius - 1.5}
                fill="none"
                stroke={`url(#defaultGrad_${uniqueId})`}
                strokeWidth="1.8"
                strokeDasharray="14 4 4 4"
              />
              {/* Inner Emerald Nodes at 0Â° and 180Â° */}
              <circle cx="50" cy={50 - (ringRadius - 1.5)} r="2.2" fill="#10B981" />
              <circle cx="50" cy={50 - (ringRadius - 1.5)} r="1.1" fill="#FFFFFF" />
              <circle cx="50" cy={50 + (ringRadius - 1.5)} r="2.2" fill="#10B981" />
              <circle cx="50" cy={50 + (ringRadius - 1.5)} r="1.1" fill="#FFFFFF" />
            </motion.g>

            {/* 4 Cardinal Tech Micro-Accents */}
            <line x1="50" y1="6" x2="50" y2="10" stroke="#06B6D4" strokeWidth="1.5" opacity="0.85" />
            <line x1="50" y1="90" x2="50" y2="94" stroke="#06B6D4" strokeWidth="1.5" opacity="0.85" />
            <line x1="6" y1="50" x2="10" y2="50" stroke="#06B6D4" strokeWidth="1.5" opacity="0.85" />
            <line x1="90" y1="50" x2="94" y2="50" stroke="#06B6D4" strokeWidth="1.5" opacity="0.85" />
          </g>
        )}
      </svg>

      {/* Layer 3: Central Avatar Node */}
      <div className="relative z-10 flex items-center justify-center rounded-full overflow-hidden">
        {children}
      </div>
    </div>
  );
});

ProAvatarRing.displayName = 'ProAvatarRing';
