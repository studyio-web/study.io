'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Medal, Flame, TrendingUp, Sparkles, Trophy } from 'lucide-react';
import { ProCrown } from '../common/ProCrown';

type Timeframe = 'today' | 'week' | 'month' | 'all';

interface LeaderboardUser {
  id: string;
  rank: number;
  name: string;
  avatar: string;
  rankBadge: string;
  rankTitle: string;
  hours: number;
  rp: number;
  isPro?: boolean;
}

const DATA_BY_TIMEFRAME: Record<Timeframe, LeaderboardUser[]> = {
  today: [
    { id: '1', rank: 1, name: 'Sample: Elena Rostova', avatar: '/images/avatars/scholars/sage1.webp?v=3', rankBadge: '/images/ranks/diamond-2.webp', rankTitle: 'Diamond II', hours: 7.4, rp: 740, isPro: true },
    { id: '2', rank: 2, name: 'Sample: Marcus Vance', avatar: '/images/avatars/scholars/cipher.webp?v=3', rankBadge: '/images/ranks/diamond-1.webp', rankTitle: 'Diamond I', hours: 6.8, rp: 680 },
    { id: '3', rank: 3, name: 'Sample: Sarah Chen', avatar: '/images/avatars/scholars/lyra.webp?v=3', rankBadge: '/images/ranks/platinum-4.webp', rankTitle: 'Platinum IV', hours: 6.1, rp: 610, isPro: true },
    { id: '4', rank: 4, name: 'Sample: Dev K.', avatar: '/images/avatars/scholars/atlas.webp?v=3', rankBadge: '/images/ranks/platinum-2.webp', rankTitle: 'Platinum II', hours: 5.5, rp: 550 },
    { id: '5', rank: 5, name: 'Sample: Liam Thorne', avatar: '/images/avatars/scholars/zenith.webp?v=3', rankBadge: '/images/ranks/gold-4.webp', rankTitle: 'Gold IV', hours: 5.0, rp: 500 },
  ],
  week: [
    { id: '2', rank: 1, name: 'Sample: Marcus Vance', avatar: '/images/avatars/scholars/cipher.webp?v=3', rankBadge: '/images/ranks/diamond-3.webp', rankTitle: 'Diamond III', hours: 38.5, rp: 3850 },
    { id: '1', rank: 2, name: 'Sample: Elena Rostova', avatar: '/images/avatars/scholars/sage1.webp?v=3', rankBadge: '/images/ranks/diamond-2.webp', rankTitle: 'Diamond II', hours: 36.2, rp: 3620, isPro: true },
    { id: '3', rank: 3, name: 'Sample: Sarah Chen', avatar: '/images/avatars/scholars/lyra.webp?v=3', rankBadge: '/images/ranks/platinum-4.webp', rankTitle: 'Platinum IV', hours: 32.1, rp: 3210, isPro: true },
    { id: '5', rank: 4, name: 'Sample: Liam Thorne', avatar: '/images/avatars/scholars/zenith.webp?v=3', rankBadge: '/images/ranks/gold-4.webp', rankTitle: 'Gold IV', hours: 28.0, rp: 2800 },
    { id: '4', rank: 5, name: 'Sample: Dev K.', avatar: '/images/avatars/scholars/atlas.webp?v=3', rankBadge: '/images/ranks/platinum-2.webp', rankTitle: 'Platinum II', hours: 26.4, rp: 2640 },
  ],
  month: [
    { id: '1', rank: 1, name: 'Sample: Elena Rostova', avatar: '/images/avatars/scholars/sage1.webp?v=3', rankBadge: '/images/ranks/grandmaster.webp', rankTitle: 'Grandmaster', hours: 142.0, rp: 14200, isPro: true },
    { id: '3', rank: 2, name: 'Sample: Sarah Chen', avatar: '/images/avatars/scholars/lyra.webp?v=3', rankBadge: '/images/ranks/master.webp', rankTitle: 'Master', hours: 128.5, rp: 12850, isPro: true },
    { id: '2', rank: 3, name: 'Sample: Marcus Vance', avatar: '/images/avatars/scholars/cipher.webp?v=3', rankBadge: '/images/ranks/champion.webp', rankTitle: 'Champion', hours: 119.2, rp: 11920 },
    { id: '4', rank: 4, name: 'Sample: Dev K.', avatar: '/images/avatars/scholars/atlas.webp?v=3', rankBadge: '/images/ranks/diamond-4.webp', rankTitle: 'Diamond IV', hours: 94.6, rp: 9460 },
    { id: '5', rank: 5, name: 'Sample: Liam Thorne', avatar: '/images/avatars/scholars/zenith.webp?v=3', rankBadge: '/images/ranks/diamond-2.webp', rankTitle: 'Diamond II', hours: 88.0, rp: 8800 },
  ],
  all: [
    { id: '1', rank: 1, name: 'Sample: Elena Rostova', avatar: '/images/avatars/scholars/sage1.webp?v=3', rankBadge: '/images/ranks/grandmaster.webp', rankTitle: 'Grandmaster', hours: 890.0, rp: 89000, isPro: true },
    { id: '2', rank: 2, name: 'Sample: Marcus Vance', avatar: '/images/avatars/scholars/cipher.webp?v=3', rankBadge: '/images/ranks/grandmaster.webp', rankTitle: 'Grandmaster', hours: 742.0, rp: 74200 },
    { id: '3', rank: 3, name: 'Sample: Sarah Chen', avatar: '/images/avatars/scholars/lyra.webp?v=3', rankBadge: '/images/ranks/master.webp', rankTitle: 'Master', hours: 680.0, rp: 68000, isPro: true },
    { id: '5', rank: 4, name: 'Sample: Liam Thorne', avatar: '/images/avatars/scholars/zenith.webp?v=3', rankBadge: '/images/ranks/champion.webp', rankTitle: 'Champion', hours: 510.0, rp: 51000 },
    { id: '4', rank: 5, name: 'Sample: Dev K.', avatar: '/images/avatars/scholars/atlas.webp?v=3', rankBadge: '/images/ranks/diamond-4.webp', rankTitle: 'Diamond IV', hours: 495.0, rp: 49500 },
  ],
};

export function LeaderboardSection() {
  const [timeframe, setTimeframe] = useState<Timeframe>('month');
  const [list, setList] = useState<LeaderboardUser[]>(DATA_BY_TIMEFRAME.month);
  const [overtakingId, setOvertakingId] = useState<string | null>(null);

  useEffect(() => {
    setList(DATA_BY_TIMEFRAME[timeframe]);
  }, [timeframe]);

  // Simulated live overtake moment every 6s
  useEffect(() => {
    const timer = setInterval(() => {
      setList((prev) => {
        if (prev.length < 2) return prev;
        const copy = [...prev];
        // Swap rank 2 and rank 1
        const temp = copy[0];
        copy[0] = { ...copy[1], rank: 1, hours: +(copy[0].hours + 0.5).toFixed(1) };
        copy[1] = { ...temp, rank: 2 };
        setOvertakingId(copy[0].id);
        setTimeout(() => setOvertakingId(null), 1800);
        return copy;
      });
    }, 6000);

    return () => clearInterval(timer);
  }, []);

  return (
    <section id="leaderboard" className="py-24 px-4 sm:px-6 max-w-5xl mx-auto relative">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-96 h-96 bg-amber-500/[0.04] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/[0.08] border border-amber-500/20 text-amber-400 text-xs font-mono uppercase tracking-wider mb-3">
          <Medal className="w-3.5 h-3.5" />
          <span>Section 04 • Live Standings</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-hud font-bold text-white tracking-tight">
          Real-Time Scholar Leaderboard. <br />
          <span className="text-slate-400 font-sans font-semibold text-2xl sm:text-3xl">
            Watch positions shift as hours clock in.
          </span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans leading-relaxed">
          Clean rankings based on verified focus minutes. Filter across Today, This Week, This Month, or All-Time.
        </p>
      </div>

      {/* Leaderboard Shell */}
      <div className="rounded-[32px] bg-[#0E1119] border border-white/10 p-4 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
        {/* Timeframe Filter Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-5 mb-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            {(['today', 'week', 'month', 'all'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`py-1.5 px-3.5 rounded-lg text-xs font-hud font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  timeframe === tf
                    ? 'bg-white text-[#07090E] shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf === 'today'
                  ? 'Today'
                  : tf === 'week'
                  ? 'This Week'
                  : tf === 'month'
                  ? 'This Month'
                  : 'All Time'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Simulated Live Standings (Sample data)</span>
          </div>
        </div>

        {/* Rows List with smooth animated swap transition */}
        <div className="space-y-2.5">
          {list.map((u, index) => {
            const isOvertaking = overtakingId === u.id;
            return (
              <div
                key={u.id}
                className={`flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border transition-all duration-500 ${
                  isOvertaking
                    ? 'bg-amber-500/15 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.25)] scale-[1.01]'
                    : index === 0
                    ? 'bg-white/[0.05] border-amber-500/30'
                    : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                }`}
              >
                {/* Left: Position Rank, Avatar & Name */}
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center font-hud font-bold text-xs sm:text-sm shrink-0 ${
                      index === 0
                        ? 'bg-amber-400 text-black shadow-md'
                        : index === 1
                        ? 'bg-slate-300 text-black'
                        : index === 2
                        ? 'bg-amber-700 text-white'
                        : 'bg-white/[0.06] text-slate-400'
                    }`}
                  >
                    {index + 1}
                  </div>

                  {/* Avatar */}
                  <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden bg-slate-800 border border-white/10 shrink-0">
                    <Image
                      src={u.avatar}
                      alt={u.name}
                      width={40}
                      height={40}
                      className="object-cover"
                    />
                  </div>

                  {/* Name & Title */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs sm:text-sm font-semibold text-white truncate">
                        {u.name}
                      </span>
                      {u.isPro && (
                        <ProCrown size={14} variant="gold" className="shrink-0" />
                      )}
                      {isOvertaking && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded animate-pulse">
                          <TrendingUp className="w-2.5 h-2.5" />
                          <span>Overtake!</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                      {u.rankTitle}
                    </span>
                  </div>
                </div>

                {/* Right: Rank Crest & Focus Hours */}
                <div className="flex items-center gap-3 sm:gap-5 shrink-0">
                  <div className="w-8 h-8 relative flex items-center justify-center">
                    <Image
                      src={u.rankBadge}
                      alt={u.rankTitle}
                      width={32}
                      height={32}
                      className="object-contain"
                    />
                  </div>

                  <div className="text-right">
                    <span className="text-xs sm:text-sm font-hud font-bold text-white block">
                      {u.hours} hrs
                    </span>
                    <span className="text-[10px] font-mono text-amber-400 block">
                      +{u.rp} RP
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
