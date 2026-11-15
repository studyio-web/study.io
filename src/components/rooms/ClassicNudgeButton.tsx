'use client';

import React, { useState } from 'react';
import { Bell, Zap } from 'lucide-react';
import { formatNudgeCooldown } from '../../lib/nudge';

interface ClassicNudgeButtonProps {
  targetUserId: string;
  targetUsername: string;
  onNudge: (e: React.MouseEvent) => void;
  cooldownSeconds?: number;
  isNudgedRecently?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}

export function ClassicNudgeButton({
  targetUserId,
  targetUsername,
  onNudge,
  cooldownSeconds = 0,
  isNudgedRecently = false,
  size = 'sm',
  className = '',
  label,
}: ClassicNudgeButtonProps) {
  const [justPressed, setJustPressed] = useState(false);
  const isOnCooldown = cooldownSeconds > 0;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOnCooldown) return;

    setJustPressed(true);
    setTimeout(() => setJustPressed(false), 1400);

    onNudge(e);
  };

  const isSmall = size === 'sm';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isOnCooldown}
      title={
        isOnCooldown
          ? `Cooldown: wait ${formatNudgeCooldown(cooldownSeconds)} before nudging ${targetUsername} again`
          : `Send a focus nudge to ${targetUsername}`
      }
      className={`group relative inline-flex items-center justify-center font-mono font-bold uppercase select-none transition-all duration-100 ${
        isSmall
          ? 'px-2.5 py-1 text-[10px] tracking-wider rounded-md gap-1.5 min-w-[76px] h-[24px]'
          : 'px-4 py-2 text-xs tracking-widest rounded-lg gap-2 min-w-[120px] h-[36px]'
      } ${
        isOnCooldown
          ? 'bg-[#10131b] text-slate-500 border border-[#1b2230] shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)] cursor-not-allowed opacity-75'
          : 'bg-[#141824] text-slate-200 border border-[#2b3348] hover:border-[#3e4a64] hover:bg-[#181d2c] hover:text-white shadow-[inset_0_1.5px_0_rgba(255,255,255,0.16),0_2.5px_0_#06080e,0_4px_8px_rgba(0,0,0,0.6)] active:translate-y-[2px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.7),0_0.5px_0_#06080e] cursor-pointer'
      } ${className}`}
    >
      {/* Physical Hardware Indicator LED */}
      <span
        className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
          justPressed
            ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] scale-125'
            : isOnCooldown
            ? 'bg-zinc-700 shadow-none'
            : 'bg-amber-400/90 shadow-[0_0_5px_rgba(245,158,11,0.75)] group-hover:brightness-125'
        }`}
      />

      {/* Retro Iconography */}
      <Zap
        className={`transition-transform duration-100 ${
          isSmall ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
        } ${
          justPressed
            ? 'text-emerald-400 scale-110'
            : isOnCooldown
            ? 'text-zinc-600'
            : 'text-amber-400 group-hover:scale-105'
        }`}
      />

      {/* Button Text */}
      <span className="truncate">
        {justPressed
          ? 'NUDGED!'
          : isOnCooldown
          ? formatNudgeCooldown(cooldownSeconds)
          : label || 'NUDGE'}
      </span>
    </button>
  );
}
