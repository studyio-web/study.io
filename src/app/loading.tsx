import React from 'react';
import { Logo } from '../components/Logo';

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#050507]">
      <div className="flex flex-col items-center justify-center animate-pulse">
        <Logo className="w-16 h-16 drop-shadow-[0_0_24px_rgba(16,185,129,0.3)]" />
      </div>
    </div>
  );
}
