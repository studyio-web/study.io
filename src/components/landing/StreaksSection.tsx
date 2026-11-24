'use client';

import React from 'react';
import { Flame, Sparkles, Zap, Award, Target, Quote } from 'lucide-react';

export function StreaksSection() {
  return (
    <section id="streaks" className="py-24 px-4 sm:px-6 max-w-6xl mx-auto relative">
      {/* Ambient Flame Glow */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-orange-500/[0.05] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/[0.08] border border-orange-500/20 text-orange-400 text-xs font-mono uppercase tracking-wider mb-3">
          <Flame className="w-3.5 h-3.5" />
          <span>Section 05 • Consistency Engine</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-hud font-bold text-white tracking-tight">
          Streaks, XP & Scholar Levels. <br />
          <span className="text-slate-400 font-sans font-semibold text-2xl sm:text-3xl">
            Rewarded for showing up every single day.
          </span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans leading-relaxed">
          10 XP for every full minute of focus. +100 XP daily consistency bonus on your first study session of the day. Lifetime XP never resets.
        </p>
      </div>

      {/* Bento Grid: Streak Flame + Level Bar + Daily Boost */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
        {/* Card 1: Streak Flame Counter */}
        <div className="md:col-span-5 p-7 rounded-3xl bg-[#0F121C] border border-white/10 flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Active Streak
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px] font-mono">
              Daily Habit
            </span>
          </div>

          <div className="my-8 flex flex-col items-center text-center">
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-orange-600/30 to-amber-500/10 border border-orange-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.25)]">
              <Flame className="w-12 h-12 text-orange-400 fill-orange-400 animate-pulse" />
            </div>
            <span className="text-5xl font-hud font-bold text-white mt-4">
              42
            </span>
            <span className="text-xs font-mono uppercase tracking-widest text-orange-300 mt-1">
              Consecutive Days
            </span>
          </div>

          <p className="text-xs text-slate-400 font-sans text-center leading-relaxed">
            Record at least 60 seconds of valid focus each calendar day to keep your flame blazing and collect your +100 XP daily streak bonus.
          </p>
        </div>

        {/* Card 2: Scholar Level Progress */}
        <div className="md:col-span-7 p-7 rounded-3xl bg-[#0F121C] border border-white/10 flex flex-col justify-between shadow-xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Lifetime Scholar Progression
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-mono">
              Uncapped
            </span>
          </div>

          {/* Level Progress Visualizer */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-slate-400">Current Title</span>
                <h3 className="text-xl font-hud font-bold text-white">Apprentice Mind (Level 18)</h3>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-slate-400">Next Prestige</span>
                <span className="text-sm font-hud font-bold text-amber-400 block">Adept Inquirer (Level 25)</span>
              </div>
            </div>

            {/* Custom Glowing Progress Bar */}
            <div className="h-3.5 w-full rounded-full bg-white/[0.06] overflow-hidden p-0.5 border border-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-400 to-purple-500 shadow-[0_0_12px_rgba(245,158,11,0.6)] w-[68%]" />
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-1">
              <span>54,200 XP earned</span>
              <span>24,800 XP to next tier</span>
            </div>
          </div>

          {/* Prestige Milestones Grid */}
          <div className="grid grid-cols-4 gap-2 pt-2">
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
              <span className="text-[10px] font-mono text-slate-400 block">Lvl 1</span>
              <span className="text-xs font-semibold text-slate-300">Novice</span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
              <span className="text-[10px] font-mono text-amber-400 block">Lvl 10</span>
              <span className="text-xs font-semibold text-white">Apprentice</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
              <span className="text-[10px] font-mono text-slate-400 block">Lvl 75</span>
              <span className="text-xs font-semibold text-slate-300">Philosopher</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
              <span className="text-[10px] font-mono text-purple-400 block">Lvl 200+</span>
              <span className="text-xs font-semibold text-purple-200">Myth</span>
            </div>
          </div>

          {/* Daily Boost Feature Detail */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
            <Quote className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-left">
              <span className="text-xs font-hud font-bold text-white uppercase tracking-wider block">
                Daily Focus Directive & Quote
              </span>
              <p className="text-xs text-slate-400 font-sans mt-0.5 leading-relaxed">
                Every morning, study.io serves a curated daily focus quote to clarify your study goals before you begin your first timer session.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
