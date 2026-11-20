'use client';

import React, { useState } from 'react';
import { TimerAlarmModal } from '@/components/timer/TimerAlarmModal';

export default function DevAlarmPreviewPage() {
  const [isOpen, setIsOpen] = useState(true);
  const [mode, setMode] = useState<'countdown' | 'pomodoro'>('pomodoro');
  const [phase, setPhase] = useState<'work' | 'break'>('break');
  const [isUltraStrict, setIsUltraStrict] = useState(false);

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="z-10 relative flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setIsOpen(true)}
          className="px-3 py-1 bg-amber-500 text-black font-bold rounded"
        >
          Open Alarm
        </button>
        <button
          onClick={() => { setMode('countdown'); setPhase('work'); setIsUltraStrict(false); setIsOpen(true); }}
          className="px-3 py-1 bg-neutral-800 rounded text-xs"
        >
          Countdown Focus
        </button>
        <button
          onClick={() => { setMode('pomodoro'); setPhase('break'); setIsUltraStrict(false); setIsOpen(true); }}
          className="px-3 py-1 bg-neutral-800 rounded text-xs"
        >
          Pomodoro Break
        </button>
      </div>

      <TimerAlarmModal
        isOpen={isOpen}
        mode={mode}
        phase={phase}
        isUltraStrict={isUltraStrict}
        subjectName="Computer Architecture"
        focusedDurationSeconds={1500}
        seasonRp={1994}
        onDismiss={() => setIsOpen(false)}
        onSnooze={() => setIsOpen(false)}
        onSave={() => setIsOpen(false)}
      />
    </div>
  );
}
