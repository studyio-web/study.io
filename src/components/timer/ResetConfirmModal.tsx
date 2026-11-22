'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import { triggerHaptic } from '@/lib/native-feel';

export interface ResetConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  elapsedSeconds?: number;
}

function formatDuration(seconds: number): string {
  const safeSec = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safeSec / 3600);
  const m = Math.floor((safeSec % 3600) / 60);
  const s = safeSec % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

export function ResetConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  elapsedSeconds = 0,
}: ResetConfirmModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-title"
      aria-describedby="reset-modal-desc"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[340px] rounded-2xl bg-[var(--surface-2,#11141c)] border border-white/10 p-6 shadow-2xl flex flex-col items-center gap-4 text-white text-center animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Icon */}
        <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/70 shrink-0">
          <RotateCcw className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="space-y-1.5">
          <h3
            id="reset-modal-title"
            className="font-hud text-base font-bold tracking-wide uppercase text-white"
          >
            Reset timer
          </h3>
          <p
            id="reset-modal-desc"
            className="text-xs text-[var(--text-dim,#94a3b8)] leading-relaxed"
          >
            {elapsedSeconds > 0 ? (
              <>
                Are you sure you want to reset? Current progress of{' '}
                <span className="font-mono text-white font-medium">
                  {formatDuration(elapsedSeconds)}
                </span>{' '}
                will be discarded without saving.
              </>
            ) : (
              'Are you sure you want to reset the timer? Current session will be discarded.'
            )}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 w-full pt-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onCancel();
            }}
            className="flex-1 h-10 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-[var(--text-dim,#94a3b8)] hover:text-white text-xs font-semibold tracking-wide transition-colors cursor-pointer active:scale-95"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onConfirm();
            }}
            className="flex-1 h-10 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-rose-100 text-xs font-semibold tracking-wide transition-colors cursor-pointer active:scale-95"
          >
            Reset
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
