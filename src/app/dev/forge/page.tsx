'use client';

import React, { useState, useEffect } from 'react';
import { ForgeBadge } from '../../../components/timer/ForgeBadge';
import { TimerDial } from '../../../components/timer/TimerDial';
import { RANK_TIERS, RankTier } from '../../../lib/ranks';
import { ForgeStatus } from '../../../lib/useForgeProgress';

const INSPECTION_RANKS = [
  RANK_TIERS.find((r) => r.tier.toLowerCase() === 'bronze' && r.division === 'I') || RANK_TIERS[0],
  RANK_TIERS.find((r) => r.tier.toLowerCase() === 'silver' && r.division === 'I') || RANK_TIERS[4],
  RANK_TIERS.find((r) => r.tier.toLowerCase() === 'gold' && r.division === 'I') || RANK_TIERS[8],
  RANK_TIERS.find((r) => r.tier.toLowerCase() === 'platinum' && r.division === 'I') || RANK_TIERS[12],
  RANK_TIERS.find((r) => r.tier.toLowerCase() === 'diamond' && r.division === 'I') || RANK_TIERS[16],
  RANK_TIERS.find((r) => r.tier.toLowerCase() === 'grandmaster') || RANK_TIERS[RANK_TIERS.length - 1],
];

const FORGE_STAGES = [
  { label: 'Forge 0.0 (Cold & Cracked)', forge: 0, status: 'idle' as ForgeStatus },
  { label: 'Forge 0.25 (Inner Light)', forge: 0.25, status: 'running' as ForgeStatus },
  { label: 'Forge 0.50 (Middle Heating)', forge: 0.5, status: 'running' as ForgeStatus },
  { label: 'Forge 0.75 (Outer Luminescence)', forge: 0.75, status: 'running' as ForgeStatus },
  { label: 'Forge 1.0 (Healed & Whole)', forge: 1.0, status: 'running' as ForgeStatus },
  { label: 'Complete (+RP Flare)', forge: 1.0, status: 'complete' as ForgeStatus },
];

export default function DevForgePage() {
  const [selectedRank, setSelectedRank] = useState<RankTier>(INSPECTION_RANKS[2]); // Gold I default
  const [sliderForge, setSliderForge] = useState(0.5);
  const [status, setStatus] = useState<ForgeStatus>('running');
  const [activeView, setActiveView] = useState<string>('all');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      if (view) setActiveView(view);
    }
  }, []);

  // Isolated Android 360 View
  if (activeView === 'android360') {
    return (
      <div className="w-[360px] h-[640px] bg-[#09090B] text-white p-4 flex flex-col justify-between overflow-hidden mx-auto font-sans">
        <div className="text-[11px] font-mono text-zinc-400 text-center tracking-wider uppercase border-b border-zinc-800 pb-2">
          Android Compact · 360px Width
        </div>

        <div className="my-auto w-full flex items-center justify-center">
          <TimerDial
            displayTime="00:24:59"
            ringPercent={75}
            litCount={45}
            statusText="Studying"
            isRunning={true}
            isPaused={false}
            isStudying={true}
            timerMode="countdown"
            isForgeEnabled={true}
            forgeProgress={0.75}
            forgeStatus="running"
            rankTier={selectedRank}
            earnedRp={35}
            currentRp={selectedRank.minRp + 35}
            nextTier={RANK_TIERS[RANK_TIERS.indexOf(selectedRank) + 1] || null}
          />
        </div>

        <div className="text-[10px] font-mono text-emerald-400 text-center border-t border-zinc-800 pt-2">
          Crest is Progress Indicator · Digits Cleanly Below · Zero Overlap
        </div>
      </div>
    );
  }

  // Isolated Android 412 View
  if (activeView === 'android412') {
    return (
      <div className="w-[412px] h-[720px] bg-[#09090B] text-white p-5 flex flex-col justify-between overflow-hidden mx-auto font-sans">
        <div className="text-[12px] font-mono text-zinc-400 text-center tracking-wider uppercase border-b border-zinc-800 pb-2">
          Android Standard · 412px Width
        </div>

        <div className="my-auto w-full flex items-center justify-center">
          <TimerDial
            displayTime="00:00:00"
            ringPercent={100}
            litCount={60}
            statusText="Completed"
            isRunning={false}
            isPaused={false}
            isStudying={false}
            timerMode="countdown"
            isForgeEnabled={true}
            forgeProgress={1.0}
            forgeStatus="complete"
            rankTier={selectedRank}
            earnedRp={50}
            currentRp={selectedRank.minRp + 50}
            nextTier={RANK_TIERS[RANK_TIERS.indexOf(selectedRank) + 1] || null}
          />
        </div>

        <div className="text-[11px] font-mono text-amber-400 text-center border-t border-zinc-800 pt-2">
          Completion Flare Burst · Real +50 RP Chip · Next Tier Bar
        </div>
      </div>
    );
  }

  // Isolated Matrix View
  if (activeView === 'matrix') {
    return (
      <div className="bg-[#09090B] text-white p-8 font-sans min-h-screen">
        <div className="max-w-[1240px] mx-auto space-y-6">
          <div className="border-b border-zinc-800 pb-4">
            <h1 className="text-2xl font-bold text-amber-400 tracking-tight">
              Forge Animation Stages Across All 6 Rank Tiers
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Deterministic hairline cracks strictly masked inside badge shape. Lighting in 3 stages: Inner (0-0.35), Middle (0.35-0.70), Outer (0.70-1.0), and Healed (0.85-1.0).
            </p>
          </div>

          <div className="space-y-6">
            {INSPECTION_RANKS.map((rank) => (
              <div key={rank.fullTitle} className="bg-zinc-950/90 p-4 rounded-xl border border-zinc-850">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-hud font-bold tracking-wider uppercase text-amber-300">
                      {rank.fullTitle}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      ({rank.minRp} RP)
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">
                    Badge Silhouette Masked
                  </span>
                </div>

                <div className="grid grid-cols-6 gap-3">
                  {FORGE_STAGES.map((stg) => (
                    <div
                      key={stg.label}
                      className="flex flex-col items-center justify-between p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800/80 min-h-[190px]"
                    >
                      <span className="text-[10px] font-mono text-zinc-300 text-center mb-1">
                        {stg.label}
                      </span>

                      <div className="relative flex items-center justify-center my-auto">
                        <ForgeBadge
                          forge={stg.forge}
                          status={stg.status}
                          rankTier={rank}
                          size={105}
                          earnedRp={stg.status === 'complete' ? 45 : undefined}
                          currentRp={rank.minRp + 45}
                          nextTier={RANK_TIERS[RANK_TIERS.indexOf(rank) + 1] || null}
                          showHint={false}
                        />
                      </div>

                      <span className="text-[9px] font-mono text-zinc-500 mt-1">
                        forge={stg.forge.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Full Overview View (Default)
  return (
    <div className="min-h-screen bg-[#09090B] text-white p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-amber-400">
              Forge Badge Inspection Lab
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Visual inspection matrix across Bronze I, Silver I, Gold I, Platinum I, Diamond I, Grandmaster.
            </p>
          </div>
          <div className="flex gap-2">
            <a href="?view=matrix" className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-mono text-zinc-300 hover:text-white">
              Matrix View
            </a>
            <a href="?view=android360" className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-mono text-zinc-300 hover:text-white">
              Android 360px
            </a>
            <a href="?view=android412" className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-mono text-zinc-300 hover:text-white">
              Android 412px
            </a>
          </div>
        </div>

        {/* 1. All-Ranks Stage Matrix */}
        <div id="forge-matrix" className="space-y-8 bg-zinc-950/70 p-6 rounded-2xl border border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-200">
            Inspection Matrix (6 Ranks x 6 Stages)
          </h2>

          <div className="space-y-8">
            {INSPECTION_RANKS.map((rank) => (
              <div key={rank.fullTitle} className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-hud font-bold tracking-wider uppercase text-amber-300">
                    {rank.fullTitle}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">
                    ({rank.minRp} RP threshold)
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {FORGE_STAGES.map((stg) => (
                    <div
                      key={stg.label}
                      className="flex flex-col items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 min-h-[220px]"
                    >
                      <span className="text-[11px] font-mono text-zinc-400 text-center mb-2">
                        {stg.label}
                      </span>

                      <div className="relative flex items-center justify-center my-auto">
                        <ForgeBadge
                          forge={stg.forge}
                          status={stg.status}
                          rankTier={rank}
                          size={110}
                          earnedRp={stg.status === 'complete' ? 42 : undefined}
                          currentRp={rank.minRp + 42}
                          nextTier={RANK_TIERS[RANK_TIERS.indexOf(rank) + 1] || null}
                          showHint={false}
                        />
                      </div>

                      <span className="text-[10px] font-mono text-zinc-500 mt-2">
                        forge={stg.forge.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Interactive Timer Dial Bench */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="p-6 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-6">
            <h2 className="text-lg font-bold text-zinc-200">Interactive Controls</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-zinc-400 block mb-2">
                  Forge Progress: {(sliderForge * 100).toFixed(0)}% ({sliderForge.toFixed(2)})
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={sliderForge}
                  onChange={(e) => setSliderForge(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-400 block mb-2">Status</label>
                <div className="flex flex-wrap gap-2">
                  {(['idle', 'running', 'paused', 'break', 'complete'] as ForgeStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono capitalize transition-colors ${
                        status === st
                          ? 'bg-amber-500 text-black font-bold'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-400 block mb-2">Rank</label>
                <div className="flex flex-wrap gap-2">
                  {INSPECTION_RANKS.map((r) => (
                    <button
                      key={r.fullTitle}
                      type="button"
                      onClick={() => setSelectedRank(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                        selectedRank.fullTitle === r.fullTitle
                          ? 'bg-amber-500 text-black font-bold'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {r.fullTitle}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Dial Preview */}
          <div
            id="dial-preview"
            className="p-6 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex flex-col items-center justify-center min-h-[380px]"
          >
            <TimerDial
              displayTime="25:00"
              ringPercent={sliderForge * 100}
              litCount={Math.round(sliderForge * 60)}
              statusText={status === 'complete' ? 'Completed' : status === 'break' ? 'Break' : status === 'paused' ? 'Paused' : 'Studying'}
              isRunning={status === 'running'}
              isPaused={status === 'paused'}
              isStudying={status !== 'idle'}
              timerMode="countdown"
              isForgeEnabled={true}
              forgeProgress={sliderForge}
              forgeStatus={status}
              rankTier={selectedRank}
              earnedRp={45}
              currentRp={selectedRank.minRp + 45}
              nextTier={RANK_TIERS[RANK_TIERS.indexOf(selectedRank) + 1] || null}
            />
          </div>
        </div>

        {/* 3. Android Viewport Simulations */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-zinc-200">
            Android Phone Viewport Checks (360px & 412px Widths)
          </h2>

          <div className="flex flex-wrap gap-8 items-start justify-center">
            {/* 360px Phone Frame */}
            <div
              id="phone-360"
              className="w-[360px] h-[640px] bg-[#09090B] border-2 border-zinc-700 rounded-3xl p-4 flex flex-col justify-between shadow-2xl relative overflow-hidden"
            >
              <div className="text-[10px] font-mono text-zinc-500 text-center">
                Android Compact: 360px Width
              </div>

              <div className="my-auto w-full flex items-center justify-center">
                <TimerDial
                  displayTime="00:24:59"
                  ringPercent={75}
                  litCount={45}
                  statusText="Studying"
                  isRunning={true}
                  isPaused={false}
                  isStudying={true}
                  timerMode="countdown"
                  isForgeEnabled={true}
                  forgeProgress={0.75}
                  forgeStatus="running"
                  rankTier={selectedRank}
                />
              </div>

              <div className="text-[10px] font-mono text-emerald-400 text-center">
                Digits cleanly below crest · Zero overlap
              </div>
            </div>

            {/* 412px Phone Frame */}
            <div
              id="phone-412"
              className="w-[412px] h-[640px] bg-[#09090B] border-2 border-zinc-700 rounded-3xl p-4 flex flex-col justify-between shadow-2xl relative overflow-hidden"
            >
              <div className="text-[10px] font-mono text-zinc-500 text-center">
                Android Standard: 412px Width
              </div>

              <div className="my-auto w-full flex items-center justify-center">
                <TimerDial
                  displayTime="00:00:00"
                  ringPercent={100}
                  litCount={60}
                  statusText="Completed"
                  isRunning={false}
                  isPaused={false}
                  isStudying={false}
                  timerMode="countdown"
                  isForgeEnabled={true}
                  forgeProgress={1.0}
                  forgeStatus="complete"
                  rankTier={selectedRank}
                  earnedRp={50}
                  currentRp={selectedRank.minRp + 50}
                  nextTier={RANK_TIERS[RANK_TIERS.indexOf(selectedRank) + 1] || null}
                />
              </div>

              <div className="text-[10px] font-mono text-amber-400 text-center">
                Completion Flare Burst + RP Progress Chip
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
