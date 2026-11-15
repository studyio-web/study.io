'use client';

import React, { useState } from 'react';
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
          ? 'px-3 py-1 text-[10px] tracking-wider rounded-md min-w-[68px] h-[24px]'
          : 'px-5 py-2 text-xs tracking-widest rounded-lg min-w-[100px] h-[36px]'
      } ${
        isOnCooldown
          ? 'bg-[#10131b] text-slate-500 border border-[#1b2230] shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)] cursor-not-allowed opacity-75'
          : 'bg-[#141824] text-slate-200 border border-[#2b3348] hover:border-[#3e4a64] hover:bg-[#181d2c] hover:text-white shadow-[inset_0_1.5px_0_rgba(255,255,255,0.16),0_2.5px_0_#06080e,0_4px_8px_rgba(0,0,0,0.6)] active:translate-y-[2px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.7),0_0.5px_0_#06080e] cursor-pointer'
      } ${className}`}
    >
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
