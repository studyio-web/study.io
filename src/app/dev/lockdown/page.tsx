'use client';

import React, { useState, useEffect } from 'react';
import { LockdownSheet } from '@/components/timer/LockdownSheet';

export default function DevLockdownPreviewPage() {
  const [isOpen, setIsOpen] = useState(true);
  const [mode, setMode] = useState<'strict' | 'ultra'>('strict');
  const [previewHoldProgress, setPreviewHoldProgress] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'ultra') {
        setMode('ultra');
      } else if (params.get('mode') === 'strict') {
        setMode('strict');
      }
      const holdParam = params.get('hold');
      if (holdParam) {
        setPreviewHoldProgress(parseFloat(holdParam));
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="z-[200] relative flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => { setMode('strict'); setPreviewHoldProgress(undefined); setIsOpen(true); }}
          className="px-3 py-1 bg-amber-500 text-black font-bold rounded text-xs cursor-pointer"
        >
          Strict Mode
        </button>
        <button
          onClick={() => { setMode('ultra'); setPreviewHoldProgress(undefined); setIsOpen(true); }}
          className="px-3 py-1 bg-red-600 text-white font-bold rounded text-xs cursor-pointer"
        >
          Ultra Strict Mode
        </button>
        <button
          onClick={() => { setMode('ultra'); setPreviewHoldProgress(0.55); setIsOpen(true); }}
          className="px-3 py-1 bg-red-900 text-white font-bold rounded text-xs cursor-pointer"
        >
          Ultra Mid-Hold (55%)
        </button>
        <button
          onClick={() => setIsOpen(false)}
          className="px-3 py-1 bg-neutral-800 rounded text-xs cursor-pointer"
        >
          Close
        </button>
      </div>

      <LockdownSheet
        isOpen={isOpen}
        mode={mode}
        countdownSeconds={1500}
        subjectName="Computer Architecture"
        allowedApps={['com.google.android.apps.docs', 'com.calculator', 'com.whatsapp']}
        allowedAppsCount={3}
        previewHoldProgress={previewHoldProgress}
        onConfirm={() => setIsOpen(false)}
        onCancel={() => setIsOpen(false)}
      />
    </div>
  );
}
