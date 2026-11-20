'use client';

import React from 'react';
import { FlairFrame, FLAIR_FRAMES } from '../../lib/flair';
import { ProCrown } from './ProCrown';

export function AvatarFlairRing({
  children,
}: {
  frame?: FlairFrame | null;
  children: React.ReactNode;
  className?: string;
  size?: number;
}) {
  return <>{children}</>;
}

export function FlairCrown({
  frame,
  className = '',
  size = 14,
}: {
  frame?: FlairFrame | null;
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  if (!frame) return null;
  const flairConfig = FLAIR_FRAMES[frame] || FLAIR_FRAMES.gold;

  return (
    <ProCrown
      size={size}
      variant={frame === 'gold' ? 'gold' : 'mono'}
      style={frame !== 'gold' ? { color: flairConfig.crownColor } : undefined}
      className={`shrink-0 inline -ml-0.5 ${className}`}
      aria-label={`${flairConfig.name} Pro member`}
    />
  );
}

// Backwards compatibility aliases for components importing FlairStar or FlairVerifiedBadge
export const FlairStar = FlairCrown;
export const FlairVerifiedBadge = FlairCrown;
export const FlairVerifiedTick = FlairCrown;
