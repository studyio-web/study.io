'use client';

import React, { useId } from 'react';

export type ProCrownVariant = 'gold' | 'mono' | 'outline';

export interface ProCrownProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  variant?: ProCrownVariant;
  className?: string;
  'aria-label'?: string;
}

/**
 * ProCrown — The single, classic, royal crown symbol for Study.io Pro.
 * 
 * Features:
 * - 3 peaks (center tallest), each crowned with a round orb
 * - Smooth rounded valleys between peaks
 * - Solid bottom band with rounded ends
 * - Pure static SVG: no animations, no shine, no glow pulse
 * 
 * Variants:
 * - gold (default): soft vertical gradient (#F7D774 to #D9A63C)
 * - mono: flat silhouette using currentColor (for dark icons on gold buttons)
 * - outline: stroked wireframe (for locked or inactive states)
 */
export function ProCrown({
  size = 16,
  variant = 'gold',
  className = '',
  'aria-label': ariaLabel,
  style,
  ...props
}: ProCrownProps) {
  const rawId = useId();
  const gradientId = `pro-crown-grad-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // Slightly thicken stroke below 16px for sharpness and clarity
  const strokeWidth = size < 14 ? 1.85 : size < 16 ? 1.65 : 1.5;

  const isOutline = variant === 'outline';
  const isMono = variant === 'mono';

  // Fill source
  const fillSource = isOutline
    ? 'none'
    : isMono
    ? 'currentColor'
    : `url(#${gradientId})`;

  const strokeSource = isOutline ? 'currentColor' : undefined;

  // Path data
  // Left orb: cx=3.2, cy=7.4, r=1.3 (bottom at y=8.7)
  // Center orb: cx=12, cy=4.4, r=1.5 (bottom at y=5.9)
  // Right orb: cx=20.8, cy=7.4, r=1.3 (bottom at y=8.7)
  // Outline starts at orbs to avoid overlapping lines; filled connects through peak tips for solid overlap.
  const filledBodyPath =
    'M 3.2 8.2 L 6.8 11.4 Q 7.6 12.2, 8.4 11.4 L 12 5.2 L 15.6 11.4 Q 16.4 12.2, 17.2 11.4 L 20.8 8.2 L 19 17.5 L 5 17.5 Z';

  const outlineBodyPath =
    'M 5 17.2 L 3.2 8.7 L 6.8 11.4 Q 7.6 12.2, 8.4 11.4 L 12 5.9 L 15.6 11.4 Q 16.4 12.2, 17.2 11.4 L 20.8 8.7 L 19 17.2';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fillSource}
      stroke={strokeSource}
      strokeWidth={isOutline ? strokeWidth : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 select-none ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: '-0.125em',
        ...style,
      }}
      aria-label={ariaLabel}
      aria-hidden={!ariaLabel}
      role={ariaLabel ? 'img' : 'presentation'}
      {...props}
    >
      {variant === 'gold' && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F7D774" />
            <stop offset="100%" stopColor="#D9A63C" />
          </linearGradient>
        </defs>
      )}

      {/* Crown Body */}
      <path d={isOutline ? outlineBodyPath : filledBodyPath} />

      {/* Bottom Band */}
      <rect
        x="4.5"
        y="17.2"
        width="15"
        height="3"
        rx="1.5"
        ry="1.5"
      />

      {/* Left Orb */}
      <circle cx="3.2" cy="7.4" r="1.3" />

      {/* Center Orb (Tallest) */}
      <circle cx="12" cy="4.4" r="1.5" />

      {/* Right Orb */}
      <circle cx="20.8" cy="7.4" r="1.3" />
    </svg>
  );
}
