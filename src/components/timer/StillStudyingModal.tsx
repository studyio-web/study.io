'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, CheckCircle2, StopCircle, AlertCircle } from 'lucide-react';
import { CONFIRM_WINDOW_MINUTES } from '@/config/timerConfig';

export interface StillStudyingModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onStop?: () => void;
  onStopAndSave?: () => void;
  onDismiss?: () => void;
  promptTriggerTime?: number; // epoch ms when prompt was triggered
  promptStartTime?: number;
}

export function StillStudyingModal({
  isOpen,
  onConfirm,
  onStop,
  onStopAndSave,
  onDismiss,
  promptTriggerTime,
  promptStartTime,
}: StillStudyingModalProps) {
  const [mounted, setMounted] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(CONFIRM_WINDOW_MINUTES * 60);

  const effectiveTriggerTime = promptStartTime ?? promptTriggerTime ?? Date.now();
  const handleStop = onStopAndSave ?? onStop ?? onDismiss ?? (() => {});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - effectiveTriggerTime) / 1000);
      const remaining = Math.max(0, CONFIRM_WINDOW_MINUTES * 60 - elapsed);
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        handleStop();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, effectiveTriggerTime, handleStop]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const timeFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-6 shadow-2xl flex flex-col gap-5 text-white">
        {/* Header Icon & Title */}
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="font-hud text-lg font-bold tracking-wide uppercase text-[var(--text)]">
              Still studying?
            </h3>
            <p className="text-xs text-[var(--text-dim)] mt-1 leading-relaxed">
              You&apos;ve reached 12 continuous hours of focus. Please confirm you are still studying so your focus time is recorded accurately.
            </p>
          </div>
        </div>

        {/* Grace Window Countdown */}
        <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[var(--text-dim)]">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Auto-saving in:</span>
          </div>
          <span className="font-mono font-bold text-amber-400 text-sm tracking-wider">
            {timeFormatted}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full sm:flex-1 py-3 px-4 rounded-xl text-xs font-hud font-bold tracking-wider uppercase bg-[#E6C15A] text-[#1A1405] hover:brightness-105 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Yes, continue</span>
          </button>

          <button
            type="button"
            onClick={handleStop}
            className="w-full sm:flex-1 py-3 px-4 rounded-xl text-xs font-hud font-semibold tracking-wider uppercase bg-transparent text-[var(--text-dim)] hover:text-white border border-[var(--border)] hover:bg-[var(--surface-3)] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <StopCircle className="w-4 h-4" />
            <span>Stop and save</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
