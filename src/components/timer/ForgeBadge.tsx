'use client';

import React, { useMemo } from 'react';
import { RankTier } from '../../lib/ranks';
import { ForgeStatus } from '../../lib/useForgeProgress';

export interface ForgeBadgeProps {
  forge: number; // 0 to 1
  status: ForgeStatus; // 'idle' | 'running' | 'paused' | 'break' | 'complete'
  rankTier?: RankTier;
  size?: number | string;
  earnedRp?: number;
  currentRp?: number;
  nextTier?: RankTier | null;
  className?: string;
  showHint?: boolean;
  reducedMotion?: boolean;
}

// Rank-specific illumination colors
export const RANK_FORGE_PALETTE: Record<
  string,
  { glow: string; light: string; secondary: string; beam: string }
> = {
  bronze: { glow: '#D97706', light: '#F59E0B', secondary: '#B45309', beam: '#FDE68A' },
  silver: { glow: '#94A3B8', light: '#E2E8F0', secondary: '#64748B', beam: '#FFFFFF' },
  gold: { glow: '#F59E0B', light: '#FDE047', secondary: '#D97706', beam: '#FEF08A' },
  platinum: { glow: '#06B6D4', light: '#67E8F9', secondary: '#0891B2', beam: '#E0F2FE' },
  diamond: { glow: '#38BDF8', light: '#BAE6FD', secondary: '#0284C7', beam: '#F0F9FF' },
  champion: { glow: '#F43F5E', light: '#FDA4AF', secondary: '#E11D48', beam: '#FFE4E6' },
  master: { glow: '#A855F7', light: '#E9D5FF', secondary: '#9333EA', beam: '#FAF5FF' },
  grandmaster: { glow: '#EC4899', light: '#FBCFE8', secondary: '#DB2777', beam: '#FDF2F8' },
};

// Deterministic crack paths (0-200 viewBox)
const CRACK_INNER_PATH =
  'M 100 100 L 98 84 L 102 70 M 100 100 L 112 89 L 124 78 M 100 100 L 114 102 L 128 105 M 100 100 L 110 114 L 122 128 M 100 100 L 99 114 L 101 128 M 100 100 L 90 114 L 78 128 M 100 100 L 86 102 L 72 105 M 100 100 L 88 89 L 76 78';

const CRACK_MIDDLE_PATH =
  'M 102 70 L 97 50 L 103 36 M 102 70 L 112 58 M 124 78 L 138 68 L 152 58 M 124 78 L 132 90 M 128 105 L 144 110 L 158 116 M 128 105 L 138 118 M 122 128 L 132 144 L 142 160 M 122 128 L 114 140 M 101 128 L 98 146 L 102 162 M 78 128 L 68 144 L 58 160 M 78 128 L 86 140 M 72 105 L 56 110 L 42 116 M 72 105 L 62 118 M 76 78 L 62 68 L 48 58 M 76 78 L 68 90';

const CRACK_OUTER_PATH =
  'M 103 36 L 99 22 L 100 12 M 112 58 L 120 52 M 152 58 L 164 50 L 174 44 M 132 90 L 142 98 M 158 116 L 172 121 L 182 124 M 138 118 L 148 128 M 142 160 L 150 172 L 158 180 M 114 140 L 108 152 M 102 162 L 99 178 L 100 190 M 58 160 L 50 172 L 42 180 M 86 140 L 92 152 M 42 116 L 28 121 L 18 124 M 62 118 L 52 128 M 48 58 L 36 50 L 26 44 M 68 90 L 58 98';

export const ALL_CRACKS_COMBINED = `${CRACK_INNER_PATH} ${CRACK_MIDDLE_PATH} ${CRACK_OUTER_PATH}`;

export const ForgeBadge = React.memo(function ForgeBadge({
  forge,
  status,
  rankTier,
  size = 180,
  earnedRp,
  currentRp,
  nextTier,
  className = '',
  showHint = true,
  reducedMotion = false,
}: ForgeBadgeProps) {
  // 1. Normalize forge value [0, 1]
  const safeForge = Math.max(0, Math.min(1, forge || 0));

  // Reduced motion: 4 discrete stages
  const effectiveForge = reducedMotion
    ? safeForge < 0.2
      ? 0
      : safeForge < 0.5
      ? 0.33
      : safeForge < 0.85
      ? 0.66
      : 1
    : safeForge;

  // 2. Resolve rank tier colors and artwork
  const tierKey = (rankTier?.tier || 'silver').toLowerCase();
  const palette = RANK_FORGE_PALETTE[tierKey] || RANK_FORGE_PALETTE.silver;
  const badgeImgSrc = rankTier?.imagePath || '/images/ranks/silver-1.png';

  // 3. Layer 1: Base Metal Filter (Cold/Dark -> Warm/Vibrant)
  // At 0: brightness 0.35, saturate 0.2, cold hue; at 1: brightness 1, saturate 1
  const brightness = 0.35 + 0.65 * effectiveForge;
  const saturate = 0.2 + 0.8 * effectiveForge;
  const hueRotate = Math.round(180 * (1 - effectiveForge));

  // 4. Layer 3: Staged Light-in-the-cracks Opacities
  // Inner: 0 -> 0.35; Middle: 0.35 -> 0.70; Outer: 0.70 -> 1.0
  const innerLightOpacity = Math.min(1, Math.max(0, effectiveForge / 0.35));
  const middleLightOpacity = Math.min(1, Math.max(0, (effectiveForge - 0.35) / 0.35));
  const outerLightOpacity = Math.min(1, Math.max(0, (effectiveForge - 0.7) / 0.3));

  // 5. Layer 5: Heal (Fade out dark crack strokes after 0.85)
  // Opacity: 1 at 0.85 -> 0 at 1.0
  const darkCrackOpacity =
    effectiveForge >= 0.85 ? Math.max(0, 1 - (effectiveForge - 0.85) / 0.15) : 1;

  // 6. Layer 4: Rim Glow (Scales with forge; dims to 40% when paused; calm blue on break)
  const isBreak = status === 'break';
  const isPaused = status === 'paused';
  const glowColor = isBreak ? '#38BDF8' : palette.glow;
  const glowMultiplier = isPaused ? 0.4 : isBreak ? 0.6 : effectiveForge;
  const rimBlur = Math.round(16 * glowMultiplier);
  const rimSpread = Math.round(32 * glowMultiplier);

  // 7. Completion flare state
  const isComplete = status === 'complete';

  // 8. Numerical RP & Progress Bar
  const hasEarnedRp = typeof earnedRp === 'number' && earnedRp > 0;
  const hasRpData = typeof currentRp === 'number' && nextTier && nextTier.minRp > (rankTier?.minRp ?? 0);
  const rpProgressPercent = hasRpData
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(
            (((currentRp ?? 0) - (rankTier?.minRp ?? 0)) /
              (nextTier.minRp - (rankTier?.minRp ?? 0))) *
              100
          )
        )
      )
    : 100;

  const percentLabel = Math.round(safeForge * 100);

  const containerStyle: React.CSSProperties = useMemo(() => {
    return {
      width: typeof size === 'number' ? `${size}px` : size,
      height: typeof size === 'number' ? `${size}px` : size,
    };
  }, [size]);

  const maskStyle: React.CSSProperties = useMemo(() => {
    return {
      WebkitMaskImage: `url('${badgeImgSrc}')`,
      maskImage: `url('${badgeImgSrc}')`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    };
  }, [badgeImgSrc]);

  return (
    <div
      className={`forge-badge-wrapper relative flex flex-col items-center justify-center select-none ${className}`}
      role="img"
      aria-label={`Forge progress ${percentLabel} percent`}
    >
      <style>{`
        @keyframes forgeIdleFloat {
          0%, 100% { transform: translateY(-3px); }
          50% { transform: translateY(3px); }
        }
        @keyframes forgeShineSweep {
          0% { transform: translateX(-150%) skewX(-20deg); opacity: 0; }
          20% { opacity: 0.9; }
          80% { opacity: 0.9; }
          100% { transform: translateX(250%) skewX(-20deg); opacity: 0; }
        }
        @keyframes forgeFlareBurst {
          0% { transform: scale(0.8); opacity: 0; }
          30% { opacity: 0.65; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        .forge-float-anim {
          animation: forgeIdleFloat 4s ease-in-out infinite;
        }
        .forge-float-paused {
          animation-play-state: paused;
        }
        .forge-sweep-active {
          animation: forgeShineSweep 1.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .forge-flare-active {
          animation: forgeFlareBurst 1.4s ease-out forwards;
        }
      `}</style>

      {/* Layer 6: Completion Flare Light Burst (Behind Badge) */}
      {isComplete && !reducedMotion && (
        <div
          className="absolute inset-0 pointer-events-none forge-flare-active z-0"
          style={{
            background: `radial-gradient(circle, ${palette.beam} 0%, ${palette.glow} 35%, transparent 70%)`,
            filter: 'blur(20px)',
          }}
        />
      )}

      {/* Main Badge Housing with Rim Glow and Gentle Float */}
      <div
        className={`relative flex items-center justify-center transition-all duration-1000 ${
          reducedMotion ? '' : isPaused ? 'forge-float-anim forge-float-paused' : 'forge-float-anim'
        }`}
        style={{
          ...containerStyle,
          filter: `drop-shadow(0 0 ${rimBlur}px ${glowColor}) drop-shadow(0 0 ${rimSpread}px ${glowColor}66)`,
        }}
      >
        {/* Layer 1: Base Masked Artwork with Forge Thermal Filter */}
        <div className="absolute inset-0 w-full h-full" style={maskStyle}>
          {/* Base Badge Image */}
          <img
            src={badgeImgSrc}
            alt={rankTier?.fullTitle || 'Rank Crest'}
            className="w-full h-full object-contain pointer-events-none transition-[filter] duration-1000"
            style={{
              filter: `brightness(${brightness}) saturate(${saturate}) hue-rotate(${hueRotate}deg)`,
            }}
          />

          {/* Layer 2: Dark Crack Overlay (Heals/Fades after 0.85) */}
          <svg
            viewBox="0 0 200 200"
            className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-700"
            style={{ opacity: darkCrackOpacity }}
          >
            <path
              d={ALL_CRACKS_COMBINED}
              fill="none"
              stroke="#09090B"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Layer 3: Light-in-the-Cracks (Illuminates in 3 Progressive Stages) */}
          <svg
            viewBox="0 0 200 200"
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ mixBlendMode: 'screen' }}
          >
            {/* Inner Stage (0 -> 0.35) */}
            <path
              d={CRACK_INNER_PATH}
              fill="none"
              stroke={palette.light}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-opacity duration-1000"
              style={{
                opacity: innerLightOpacity,
                filter: `drop-shadow(0 0 4px ${palette.glow}) blur(0.5px)`,
              }}
            />
            {/* Middle Stage (0.35 -> 0.70) */}
            <path
              d={CRACK_MIDDLE_PATH}
              fill="none"
              stroke={palette.light}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-opacity duration-1000"
              style={{
                opacity: middleLightOpacity,
                filter: `drop-shadow(0 0 4px ${palette.glow}) blur(0.5px)`,
              }}
            />
            {/* Outer Stage (0.70 -> 1.0) */}
            <path
              d={CRACK_OUTER_PATH}
              fill="none"
              stroke={palette.light}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-opacity duration-1000"
              style={{
                opacity: outerLightOpacity,
                filter: `drop-shadow(0 0 4px ${palette.glow}) blur(0.5px)`,
              }}
            />
          </svg>

          {/* Layer 6: Single Shine Sweep on Completion */}
          {isComplete && !reducedMotion && (
            <div
              className="absolute inset-y-0 w-1/3 pointer-events-none forge-sweep-active"
              style={{
                background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%)`,
                mixBlendMode: 'overlay',
              }}
            />
          )}
        </div>
      </div>

      {/* Completion Flare: Real RP Chip & Next Rank Progression */}
      {isComplete && (hasEarnedRp || hasRpData) && (
        <div className="flex flex-col items-center gap-1 mt-2 animate-in fade-in zoom-in-95 duration-500 z-10">
          {hasEarnedRp && (
            <div
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold tracking-wide shadow-sm"
              style={{
                backgroundColor: `${palette.glow}20`,
                borderColor: `${palette.glow}40`,
                borderWidth: '1px',
                color: palette.light,
              }}
            >
              <span>+{earnedRp} RP</span>
            </div>
          )}

          {hasRpData && nextTier && (
            <div className="flex flex-col items-center gap-0.5 min-w-[140px] max-w-[200px]">
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${rpProgressPercent}%`,
                    backgroundColor: palette.light,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-[var(--text-dim)] truncate">
                {currentRp} / {nextTier.minRp} to {nextTier.name}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Idle Hint: Faint "Start to forge" without pulsing */}
      {status === 'idle' && showHint && (
        <span className="text-[11px] font-mono text-[var(--text-dim)] opacity-60 tracking-wider uppercase mt-1">
          Start to forge
        </span>
      )}
    </div>
  );
});

ForgeBadge.displayName = 'ForgeBadge';
