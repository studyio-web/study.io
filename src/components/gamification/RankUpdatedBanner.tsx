'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, X, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRank } from '../../context/RankContext';
import { getRankBadgePath } from '../../lib/rankedSystem';

const STORAGE_KEY_PREFIX = 'studyio_rank_update_dismissed_v2_';

export function RankUpdatedBanner() {
  const { user } = useAuth();
  const { userRank } = useRank();
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (!user) return;
    try {
      const storageKey = `${STORAGE_KEY_PREFIX}${user.id}`;
      const dismissed = localStorage.getItem(storageKey);
      if (!dismissed) {
        setIsVisible(true);
      }
    } catch {}
  }, [user]);

  const handleDismiss = () => {
    if (isExiting) return;
    setIsExiting(true);
    try {
      if (user?.id) {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${user.id}`, 'true');
      }
    } catch {}
    setTimeout(() => {
      setIsVisible(false);
    }, 450);
  };

  if (!isVisible) return null;

  const currentRankTitle = userRank?.rankTitle || userRank?.tier?.name || 'Bronze I';
  const badgeSrc = getRankBadgePath(currentRankTitle);

  return (
    <div
      className={`relative w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4 z-20 duration-500 ${
        isExiting
          ? 'animate-out slide-out-to-top-4 fade-out fill-mode-forwards'
          : 'animate-in slide-in-from-top-4'
      }`}
    >
      <div className="relative overflow-hidden bg-[#0c0d12]/90 border border-cyan-500/25 rounded-2xl p-3.5 sm:p-4 backdrop-blur-md shadow-2xl shadow-cyan-500/10">
        {/* Ambient Cyan / Indigo Glow */}
        <div className="absolute top-0 right-1/4 w-96 h-24 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* Left: Crest Badge & Text */}
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 flex items-center justify-center p-1 shadow-lg shadow-cyan-500/20 flex-shrink-0">
              <img
                src={badgeSrc}
                alt={currentRankTitle}
                className="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]"
              />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] sm:text-xs font-black tracking-widest uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-cyan-300" />
                  SYSTEM UPDATE
                </span>
                <span className="text-[10px] sm:text-xs font-mono text-zinc-400">
                  New Rank Curve
                </span>
              </div>

              <h4 className="text-sm sm:text-base font-extrabold text-white mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Ranks have been updated!</span>
                <span className="text-xs font-normal text-slate-300">
                  Current Tier: <strong className="font-bold text-cyan-300">{currentRankTitle}</strong>
                </span>
              </h4>

              <p className="text-xs text-slate-400 mt-0.5">
                Early ranks now progress significantly faster, and later ranks reward sustained mastery. Your current rank has been smoothly adjusted.
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 self-end md:self-center w-full md:w-auto justify-end flex-wrap">
            <button
              onClick={handleDismiss}
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:brightness-110 text-black font-bold text-xs py-2 px-4 rounded-xl shadow-lg shadow-cyan-500/20 uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>GOT IT</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleDismiss}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
