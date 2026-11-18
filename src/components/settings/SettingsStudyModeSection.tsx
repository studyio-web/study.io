'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStudyMode } from '../../context/StudyModeContext';
import { useStudy } from '../../context/StudyContext';
import { StudyMode } from '../../types';
import { Check, Compass, AlertCircle, Loader2 } from 'lucide-react';
import { registerBackButtonHandler } from '../../lib/native-feel';

export function SettingsStudyModeSection() {
  const { mode, setMode } = useStudyMode();
  const { isStudying, isPaused, isRunning } = useStudy();

  const isSessionActive = Boolean(isStudying || isPaused || isRunning);

  const [mounted, setMounted] = useState(false);
  const [pendingMode, setPendingMode] = useState<StudyMode | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Android Hardware Back Button: dismiss confirmation modal if open
  useEffect(() => {
    if (!pendingMode) return;
    return registerBackButtonHandler(() => {
      handleCancelSwitch();
      return true;
    });
  }, [pendingMode, isUpdating]);

  const handleSelectMode = (targetMode: StudyMode) => {
    if (isSessionActive || targetMode === mode || isUpdating) return;
    setPendingMode(targetMode);
  };

  const handleConfirmSwitch = async () => {
    if (!pendingMode || isUpdating) return;
    setIsUpdating(true);
    try {
      await setMode(pendingMode);
      setPendingMode(null);
    } catch {
      // Toast is handled in setMode
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelSwitch = () => {
    if (isUpdating) return;
    setPendingMode(null);
  };

  return (
    <div className="p-5 rounded-2xl hud-surface border border-[var(--border)] shadow-sm flex flex-col gap-3.5">
      {/* Section Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div
            className="w-10 h-10 rounded-xl bg-fg/[0.04] border border-[var(--border)] flex items-center justify-center flex-shrink-0"
            style={{ color: 'var(--accent)' }}
          >
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-hud font-bold tracking-wider text-[var(--text)] uppercase">
              STUDY MODE CONFIGURATION
            </div>
            <div className="text-[11px] text-[var(--text-dim)] mt-0.5">
              Switch between Focus mode (single timer) and Subject mode (subject tracking).
            </div>
          </div>
        </div>
      </div>

      {/* Active Session Warning Banner */}
      {isSessionActive && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Finish your current session to switch modes.</span>
        </div>
      )}

      {/* Compact Radiogroup */}
      <div
        role="radiogroup"
        aria-label="Study mode"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1"
      >
        {/* Option 1: Focus Mode */}
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'focus'}
          disabled={isSessionActive}
          onClick={() => handleSelectMode('focus')}
          className={`relative flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-150 ${
            mode === 'focus'
              ? 'bg-[var(--surface)] border-[var(--accent)] ring-1 ring-[var(--accent)]/40 shadow-sm'
              : 'bg-[var(--surface)]/60 hover:bg-[var(--surface)] border-[var(--border)] hover:border-white/20'
          } ${isSessionActive ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="min-w-0 pr-2">
            <div className="text-xs font-hud font-bold tracking-wider text-[var(--text)] uppercase flex items-center gap-2">
              <span>Focus mode</span>
            </div>
            <div className="text-[11px] text-[var(--text-dim)] font-sans truncate mt-0.5">
              Just press start. Total focus time only.
            </div>
          </div>
          <div
            className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              mode === 'focus'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'border border-[var(--border)] bg-transparent'
            }`}
          >
            {mode === 'focus' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
          </div>
        </button>

        {/* Option 2: Subject Mode */}
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'subject'}
          disabled={isSessionActive}
          onClick={() => handleSelectMode('subject')}
          className={`relative flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-150 ${
            mode === 'subject'
              ? 'bg-[var(--surface)] border-[var(--accent)] ring-1 ring-[var(--accent)]/40 shadow-sm'
              : 'bg-[var(--surface)]/60 hover:bg-[var(--surface)] border-[var(--border)] hover:border-white/20'
          } ${isSessionActive ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="min-w-0 pr-2">
            <div className="text-xs font-hud font-bold tracking-wider text-[var(--text)] uppercase flex items-center gap-2">
              <span>Subject mode</span>
            </div>
            <div className="text-[11px] text-[var(--text-dim)] font-sans truncate mt-0.5">
              Track each subject and category breakdown.
            </div>
          </div>
          <div
            className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              mode === 'subject'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'border border-[var(--border)] bg-transparent'
            }`}
          >
            {mode === 'subject' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
          </div>
        </button>
      </div>

      {/* Fullscreen Confirmation Dialog Modal (Portaled to document.body to break free of transformed containers) */}
      {mounted && typeof document !== 'undefined' && pendingMode && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isUpdating) {
              handleCancelSwitch();
            }
          }}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div className="w-full max-w-sm sm:max-w-md p-6 rounded-3xl bg-[#0c1017] border border-white/15 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 relative select-none">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0"
                style={{ color: 'var(--accent)' }}
              >
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-hud font-bold tracking-wider uppercase text-white">
                  Switch to {pendingMode === 'focus' ? 'Focus Mode' : 'Subject Mode'}?
                </h3>
                <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                  Study Mode Configuration
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-neutral-300 font-sans leading-relaxed">
              {pendingMode === 'focus'
                ? 'Focus mode hides subjects and displays your total focus time in a clean, distraction-free view.'
                : 'Subject mode brings back subjects and detailed study breakdowns. Sessions from Focus mode will appear under General Focus.'}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
              <button
                type="button"
                disabled={isUpdating}
                onClick={handleCancelSwitch}
                className="px-4 py-2 rounded-xl border border-white/10 text-xs font-hud font-bold tracking-wider uppercase text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdating}
                onClick={handleConfirmSwitch}
                className="px-5 py-2 rounded-xl bg-[var(--accent)] hover:opacity-95 text-[var(--accent-contrast)] text-xs font-hud font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Switching...</span>
                  </>
                ) : (
                  <span>Confirm</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
