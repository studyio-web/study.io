'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import { Trophy, ChevronLeft, ChevronRight, Calendar, Sparkles, Flame, Clock } from 'lucide-react';
import { RANK_TIERS, RankTierConfig } from '../../lib/rankedSystem';
import { RankCrestBadge } from '../common/RankCrestBadge';

export function RanksSection() {
  const [selectedRankIdx, setSelectedRankIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedTier = RANK_TIERS[selectedRankIdx] || RANK_TIERS[0];

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const offset = direction === 'left' ? -280 : 280;
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const handleSelectTier = (index: number) => {
    setSelectedRankIdx(index);
    if (scrollRef.current) {
      const items = scrollRef.current.querySelectorAll('.rank-card-item');
      if (items[index]) {
        (items[index] as HTMLElement).scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        });
      }
    }
  };

  return (
    <section id="ranks" className="py-24 px-4 sm:px-6 max-w-7xl mx-auto relative overflow-hidden">
      {/* Dynamic Background Glow changing per selected tier */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[140px] pointer-events-none transition-all duration-700 -z-10"
        style={{
          background: selectedTier.glowColor || 'rgba(217, 119, 6, 0.15)',
          opacity: 0.35,
        }}
      />

      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-14">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/[0.08] border border-amber-500/20 text-amber-300 text-xs font-mono uppercase tracking-wider mb-3">
          <Trophy className="w-3.5 h-3.5" />
          <span>Section 03 • 23-Tier Competitive Ladder</span>
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-hud font-bold text-white tracking-tight">
          From Bronze I to Grandmaster. <br />
          <span className="text-slate-400 font-sans font-semibold text-2xl sm:text-3xl">
            A real monthly climb built on pure focus hours.
          </span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans leading-relaxed">
          1 hour of deep study = 100 RP. Progress through 23 distinct tiers, each featuring unique metallic crests, animated glints, and crowned wings.
        </p>
      </div>

      {/* Selected Rank Hero Preview */}
      <div className="max-w-md mx-auto mb-12 p-6 rounded-3xl bg-[#0F121A]/80 border border-white/10 backdrop-blur-md shadow-2xl flex flex-col items-center text-center">
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 my-2 flex items-center justify-center filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)]">
          <RankCrestBadge
            tier={selectedTier.tier}
            division={selectedTier.division}
            size={180}
            interactive={true}
          />
        </div>

        <div className="mt-3">
          <h3 className="text-2xl font-hud font-bold text-white tracking-wider">
            {selectedTier.fullTitle}
          </h3>
          <div className="flex items-center justify-center gap-3 mt-1.5 text-xs font-mono text-slate-300">
            <span className="text-amber-400 font-bold">{selectedTier.minRP.toLocaleString()} RP</span>
            <span>•</span>
            <span>~{selectedTier.minHours} Hours Required</span>
          </div>
          <span className="mt-2 inline-block px-3 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-white/[0.06] border border-white/10 text-slate-300">
            Tier {selectedRankIdx + 1} of 23
          </span>
        </div>
      </div>

      {/* Horizontal Carousel Controls & Track */}
      <div className="relative mb-16">
        {/* Controls */}
        <div className="flex items-center justify-between mb-4 px-2">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
            Browse all 23 rank tiers
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleScroll('left')}
              className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleScroll('right')}
              className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Badges Strip */}
        <div
          ref={scrollRef}
          className="flex items-center gap-3.5 overflow-x-auto pb-4 pt-2 px-2 scroll-smooth no-scrollbar snap-x snap-mandatory"
        >
          {RANK_TIERS.map((tier, idx) => {
            const isSelected = selectedRankIdx === idx;
            return (
              <div
                key={tier.fullTitle}
                onClick={() => handleSelectTier(idx)}
                className={`rank-card-item flex-shrink-0 w-36 sm:w-40 p-3 rounded-2xl border transition-all cursor-pointer snap-start flex flex-col items-center text-center ${
                  isSelected
                    ? 'bg-white/[0.08] border-white/30 shadow-lg scale-105'
                    : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/15'
                }`}
              >
                <div className="w-20 h-20 relative flex items-center justify-center my-1">
                  <Image
                    src={tier.imagePath ? tier.imagePath.replace('.png', '.webp') : '/images/ranks/bronze-1.webp'}
                    alt={tier.fullTitle}
                    width={80}
                    height={80}
                    className="object-contain"
                  />
                </div>
                <span className="text-xs font-hud font-bold text-white tracking-wide truncate w-full">
                  {tier.fullTitle}
                </span>
                <span className="text-[10px] font-mono text-slate-400 mt-0.5">
                  {tier.minRP} RP
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Season Reset Explainer & Sample Recap Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-8 border-t border-white/[0.08]">
        {/* Left: Monthly Reset Mechanics */}
        <div className="lg:col-span-6 space-y-4 text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/[0.08] border border-blue-500/20 text-blue-400 text-xs font-mono uppercase tracking-wider">
            <Calendar className="w-3.5 h-3.5" />
            <span>Monthly Reset System</span>
          </div>
          <h3 className="text-2xl font-hud font-bold text-white tracking-tight">
            Fair competition every single month.
          </h3>
          <p className="text-sm text-slate-300 font-sans leading-relaxed">
            At midnight on the 1st of every month, a new season begins. High-ranking scholars receive a calibrated soft-reset carryover (capped at Diamond IV / 12,800 RP) so newcomers can compete alongside veterans.
          </p>
          <ul className="space-y-2 text-xs sm:text-sm text-slate-400 font-sans">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Full Season Recap card generated automatically on Day 1.</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>Historical season archives saved permanently in your profile.</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Carryover rewards consistent grind without locking out newcomers.</span>
            </li>
          </ul>
        </div>

        {/* Right: Authentic Season Recap Card Sample */}
        <div className="lg:col-span-6 flex justify-center">
          <div className="w-full max-w-sm rounded-[28px] bg-gradient-to-b from-[#141824] to-[#0A0D14] border border-amber-500/30 p-6 shadow-2xl relative overflow-hidden text-center">
            {/* Header Badge */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider">
                Season 23 Recap
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                October 2026
              </span>
            </div>

            {/* Crest & Finish Rank */}
            <div className="my-4 flex flex-col items-center">
              <div className="w-24 h-24 relative flex items-center justify-center">
                <Image
                  src="/images/ranks/diamond-1.webp"
                  alt="Diamond I Season Finish"
                  width={96}
                  height={96}
                  className="object-contain drop-shadow-[0_10px_20px_rgba(168,85,247,0.4)]"
                />
              </div>
              <span className="text-lg font-hud font-bold text-white mt-2">
                DIAMOND I
              </span>
              <span className="text-xs font-mono text-purple-300">
                Top 2.4% of Global Scholars
              </span>
            </div>

            {/* Recap Stats Grid */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center my-3">
              <div>
                <span className="text-base font-hud font-bold text-white">84.2h</span>
                <span className="text-[10px] font-mono text-slate-400 block mt-0.5">Focus Time</span>
              </div>
              <div>
                <span className="text-base font-hud font-bold text-amber-400">8,420</span>
                <span className="text-[10px] font-mono text-slate-400 block mt-0.5">Total RP</span>
              </div>
              <div>
                <span className="text-base font-hud font-bold text-emerald-400">28d</span>
                <span className="text-[10px] font-mono text-slate-400 block mt-0.5">Best Streak</span>
              </div>
            </div>

            <span className="text-[10px] font-mono text-slate-500 block">
              Sample Season Archive Card
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
