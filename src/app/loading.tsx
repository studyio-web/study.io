import React from 'react';
import { Logo } from '../components/Logo';

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#050507]">
      <div className="flex flex-col items-center justify-center animate-pulse">
        <Logo className="w-20 h-20 drop-shadow-[0_0_28px_rgba(16,185,129,0.35)]" />
      </div>
    </div>
  );
}
