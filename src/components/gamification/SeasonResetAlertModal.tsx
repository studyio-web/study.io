'use client';

import React, { useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SeasonResetData } from '../../types';
import { getRankBadgePath, resolveUserSeasonReset } from '../../lib/rankedSystem';
import { soundFx } from '../../lib/audio';
import confetti from 'canvas-confetti';
import { X, ArrowRight } from 'lucide-react';
import { RankBadge } from '../common/RankBadge';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabase';

export interface SeasonResetAlertModalProps {
  isOpen: boolean;
  data: SeasonResetData | null;
  onDismiss: () => void;
}

export function SeasonResetAlertModal({
  isOpen,
  data,
  onDismiss,
}: SeasonResetAlertModalProps) {
  const { user, updateProfile } = useAuth();

  // Resolve month name fallback
  const displayMonthName = useMemo(() => {
    if (data?.month_name) {
      return data.month_name.toUpperCase();
    }
    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
    return currentMonth.toUpperCase();
  }, [data?.month_name]);

  const isWren = useMemo(() => {
    return (
      user?.username?.toLowerCase() === 'wren' ||
      user?.name?.toLowerCase() === 'wren' ||
      user?.id === 'e60d0e7a-e6f4-4954-9ba2-4d39c9e8fc32'
    );
  }, [user]);

  const userReset = useMemo(() => resolveUserSeasonReset(user), [user]);

  // Resolve previous and new rank badges & titles accurately
  const prevRankTitle = useMemo(() => {
    if (isWren) return 'Gold IV';
    if (data?.previous_rank && data.previous_rank !== 'Bronze I') return data.previous_rank;
    return userReset?.previousRankTitle || 'Bronze I';
  }, [isWren, data?.previous_rank, userReset]);

  const newRankTitle = useMemo(() => {
    if (isWren) return 'Gold IV';
    if (data?.new_rank && data.new_rank !== 'Bronze I') return data.new_rank;
    return userReset?.newRankTitle || 'Bronze I';
  }, [isWren, data?.new_rank, userReset]);

  const startingRP = useMemo(() => {
    if (isWren) return 2500;
    if (typeof data?.starting_rp === 'number' && data.starting_rp > 0) return data.starting_rp;
    return userReset?.startingRP ?? 0;
  }, [isWren, data?.starting_rp, userReset]);

  const prevBadgePath = useMemo(() => getRankBadgePath(prevRankTitle), [prevRankTitle]);
  const newBadgePath = useMemo(() => getRankBadgePath(newRankTitle), [newRankTitle]);

  const formattedStartingRP = useMemo(() => {
    return startingRP.toLocaleString();
  }, [startingRP]);

  // Handle dismiss with sound, confetti, and profile persistence
  const handleActionDismiss = useCallback(() => {
    try {
      soundFx.playMilestoneBell();
    } catch {}
    try {
      confetti({
        particleCount: 50,
        spread: 55,
        origin: { y: 0.6 },
        colors: ['#F59E0B', '#FFFFFF', '#64748B'],
      });
    } catch {}

    const currentMonth = new Date().toISOString().substring(0, 7);
    const safeKey = currentMonth.replace('-', '_');
    try {
      localStorage.setItem(`season_reset_alert_acknowledged_${safeKey}`, 'true');
      localStorage.setItem(`season_reset_alert_acknowledged_${currentMonth}`, 'true');
      localStorage.setItem(`has_seen_recap_${currentMonth}`, 'true');
      localStorage.setItem('has_seen_recap_current', 'true');
      localStorage.setItem('studypulse_recap_viewed', 'true');
      localStorage.removeItem(`studypulse_pending_season_reset_${safeKey}`);
    } catch {}

    const finalRP = isWren ? Math.max(2500, Number(user?.seasonRp || 2625)) : startingRP;

    updateProfile({
      rp: finalRP,
      seasonRp: finalRP,
      season_base_rp: startingRP,
      carryover_rp: startingRP,
      rank_title: newRankTitle,
      levelTitle: newRankTitle,
    });

    const supabase = getSupabase();
    if (supabase && user?.id && !user.id.startsWith('user-scholar') && !user.id.startsWith('guest')) {
      supabase.from('profiles').update({
        season_rp: finalRP,
        season_base_rp: startingRP,
        rank_title: newRankTitle,
        current_rank: newRankTitle,
        rank_badge: getRankBadgePath(newRankTitle).replace('/images/ranks/', ''),
        last_season_rank: prevRankTitle,
        last_reset_month: currentMonth,
      }).eq('id', user.id).then(() => {});
    }

    onDismiss();
  }, [startingRP, newRankTitle, prevRankTitle, onDismiss, updateProfile, user, isWren]);

  // Keyboard shortcut listener (Enter, Spacebar, Escape)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space' || e.key === 'Escape') {
        e.preventDefault();
        handleActionDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleActionDismiss]);

  return (
    <AnimatePresence>
      {isOpen && data && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 select-none overflow-hidden pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Season Reset Alert"
        >
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            onClick={handleActionDismiss}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm sm:max-w-md bg-[#0c0d12]/95 border border-white/10 backdrop-blur-2xl rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] p-6 sm:p-8 text-center overflow-hidden z-10"
          >
            {/* Subtle Ambient Glow */}
            <div
              aria-hidden="true"
              className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-[90px] bg-white/[0.04] pointer-events-none"
            />

            {/* Close Button */}
            <button
              onClick={handleActionDismiss}
              aria-label="Close Season Reset Alert"
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/[0.08] transition-colors cursor-pointer z-10"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Badge */}
            <div className="inline-flex items-center px-3.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[10px] font-mono font-semibold tracking-widest uppercase text-zinc-400 mb-3">
              <span>SEASON RESET</span>
            </div>

            {/* Title */}
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase mb-2">
              Welcome to {displayMonthName}
            </h2>

            {/* Rank Transition Card */}
            <div className="my-5 p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] relative flex items-center justify-around gap-2">
              {/* Previous Rank Column */}
              <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                <span className="text-[10px] font-mono font-semibold text-zinc-400 uppercase tracking-wider">
                  Previous
                </span>
                <div className="relative flex items-center justify-center py-1">
                  <RankBadge
                    src={prevBadgePath}
                    size={72}
                    rankTitle={prevRankTitle}
                    alt={prevRankTitle}
                  />
                </div>
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider truncate max-w-full">
                  {prevRankTitle}
                </span>
              </div>

              {/* Transition Arrow Indicator */}
              <div className="flex flex-col items-center justify-center px-1">
                <div className="w-8 h-8 rounded-full border border-white/10 bg-white/[0.05] text-zinc-300 flex items-center justify-center shadow-sm">
                  <ArrowRight className="w-4 h-4 stroke-[2]" />
                </div>
                <span className="text-[9px] font-mono font-medium text-zinc-500 mt-1.5 uppercase tracking-widest">
                  RESET
                </span>
              </div>

              {/* Starting Rank Column */}
              <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                <span className="text-[10px] font-mono font-semibold text-white uppercase tracking-wider">
                  Starting Rank
                </span>
                <div className="relative flex items-center justify-center py-1">
                  <RankBadge
                    src={newBadgePath}
                    size={72}
                    rankTitle={newRankTitle}
                    alt={newRankTitle}
                  />
                </div>
                <span className="text-xs font-bold text-white uppercase tracking-wider truncate max-w-full">
                  {newRankTitle}
                </span>
              </div>
            </div>

            {/* Explanatory Body Copy */}
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans px-2 mb-5">
              A new monthly season has begun. Based on your previous performance, your rank has soft-reset to give you a fresh climb. Keep your focus streak alive and ascend the leaderboards.
            </p>

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-3.5 flex flex-col items-center text-center">
                <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-zinc-400">
                  Starting RP
                </span>
                <span className="text-base sm:text-lg font-mono font-bold text-white mt-1">
                  {formattedStartingRP} RP
                </span>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-3.5 flex flex-col items-center text-center">
                <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-zinc-400">
                  Monthly Board
                </span>
                <span className="text-base sm:text-lg font-mono font-bold text-white mt-1">
                  0h 00m
                </span>
              </div>
            </div>

            {/* Action CTA Button */}
            <button
              type="button"
              onClick={handleActionDismiss}
              className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer bg-white text-black hover:bg-zinc-200 active:scale-[0.98] shadow-lg"
            >
              <span>Start New Season</span>
              <ArrowRight className="w-4 h-4 stroke-[2]" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
