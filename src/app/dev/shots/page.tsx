'use client';

import React, { useState, useEffect } from 'react';
import {
  Timer,
  Trophy,
  Users,
  Flame,
  Volume2,
  Palette,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Play,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Sliders,
  VolumeX,
  Smartphone,
  Laptop,
  Check,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { RankCrestBadge } from '@/components/common/RankCrestBadge';
import { ProCrown } from '@/components/common/ProCrown';

export default function DevShotsPage() {
  const [shot, setShot] = useState<string>('hero-timer');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('shot');
      if (s) setShot(s);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#07090E] text-white flex flex-col items-center justify-center p-0 select-none overflow-hidden font-sans">
      {/* 390x844 Mobile Device Viewport Canvas */}
      {shot !== 'desktop-sync' ? (
        <div
          id="shot-container"
          className="w-[390px] h-[844px] bg-[#07090E] relative overflow-hidden flex flex-col justify-between border border-white/[0.08]"
          style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}
        >
          {/* Subtle ambient lighting */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[340px] h-[340px] bg-[radial-gradient(circle,rgba(255,255,255,0.04)_0%,transparent_70%)] pointer-events-none" />

          {/* Shot 1: Hero Timer Screen */}
          {shot === 'hero-timer' && (
            <div className="w-full h-full flex flex-col justify-between p-6 pt-10">
              {/* App Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Logo className="w-7 h-7" />
                  <span className="font-bold text-base tracking-tight text-white">study.io</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
                  <RankCrestBadge tier="Gold" division="IV" size={20} interactive={false} />
                  <span className="text-xs font-mono font-bold text-amber-400">GOLD IV</span>
                </div>
              </div>

              {/* Mode Tabs */}
              <div className="flex items-center justify-center">
                <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/10">
                  <span className="px-3.5 py-1 rounded-full bg-white text-[#07090E] font-bold text-xs">
                    Pomodoro
                  </span>
                  <span className="px-3 py-1 text-white/40 text-xs font-medium">Stopwatch</span>
                  <span className="px-3 py-1 text-white/40 text-xs font-medium">Countdown</span>
                </div>
              </div>

              {/* Subject Tag Chip */}
              <div className="flex justify-center -my-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono font-medium tracking-wide text-slate-300 uppercase">
                    Linear Algebra
                  </span>
                  <span className="text-[10px] font-mono text-white/30">LOCKED</span>
                </div>
              </div>

              {/* Timer Dial with Arc */}
              <div className="relative w-64 h-64 mx-auto flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="4"
                    fill="none"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="#FFFFFF"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray="263.89"
                    strokeDashoffset="65"
                    fill="none"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-5xl font-black font-mono tracking-tight text-white">
                    25:00
                  </span>
                  <span className="text-xs font-mono font-semibold text-slate-400 tracking-widest uppercase mt-2">
                    Deep Focus
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-col gap-3 pb-4">
                <div className="w-full py-3.5 rounded-2xl bg-white text-[#07090E] font-bold text-sm tracking-wide text-center shadow-[0_4px_20px_rgba(255,255,255,0.15)] flex items-center justify-center gap-2">
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Focus Session</span>
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-mono">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>Live Study Room · 14 scholars active</span>
                </div>
              </div>
            </div>
          )}

          {/* Shot 2: Blocked App Screen */}
          {shot === 'blocked-app' && (
            <div className="w-full h-full flex flex-col justify-between p-6 pt-16 bg-[#07090E]">
              <div className="flex flex-col items-center text-center my-auto">
                <div className="w-20 h-20 rounded-3xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(244,63,94,0.25)]">
                  <ShieldAlert className="w-10 h-10" />
                </div>

                <span className="text-[11px] font-mono uppercase tracking-widest px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold mb-4">
                  Strict Mode Violation
                </span>

                <h2 className="text-2xl font-black text-white tracking-tight">
                  App Blocked: Instagram
                </h2>

                <p className="mt-3 text-sm text-slate-300 leading-relaxed max-w-xs">
                  <strong>Instagram</strong> is not on your allowed apps list. Strict Mode is protecting your focus session from distractions.
                </p>

                <div className="mt-3 px-3 py-1 rounded bg-white/[0.04] border border-white/10 font-mono text-[11px] text-slate-400">
                  com.instagram.android
                </div>

                <div className="mt-8 flex items-center gap-2 text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full">
                  <Lock className="w-3.5 h-3.5" />
                  <span>18m 42s remaining in session</span>
                </div>
              </div>

              <div className="w-full pb-6 flex flex-col gap-3">
                <div className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm tracking-wide text-center">
                  Back to Focus Timer
                </div>
                <div className="w-full py-2.5 rounded-xl border border-white/10 text-slate-400 font-mono text-xs text-center">
                  Emergency Exit (Costs 50 RP)
                </div>
              </div>
            </div>
          )}

          {/* Shot 3: Strict Mode / Lockdown Sheet */}
          {shot === 'strict-mode' && (
            <div className="w-full h-full flex flex-col justify-between p-6 pt-12">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Strict Mode Lockdown</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">On-device study shield</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-mono font-bold uppercase">
                  Active Shield
                </span>
              </div>

              <div className="flex flex-col gap-4 my-auto">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Device Admin Protection</div>
                    <div className="text-xs text-slate-400 leading-snug mt-0.5">
                      Prevents uninstallation or force-stop while session is running.
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Allowed Apps List</div>
                    <div className="text-xs text-slate-400 leading-snug mt-0.5">
                      3 apps permitted: Notion, Calculator, Anki. All others blocked.
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">100% On-Device Privacy</div>
                    <div className="text-xs text-slate-400 leading-snug mt-0.5">
                      No screen content or private chats are ever read or transmitted.
                    </div>
                  </div>
                </div>
              </div>

              <div className="pb-6">
                <div className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-sm tracking-wide text-center flex items-center justify-center gap-2 shadow-[0_4px_25px_rgba(245,158,11,0.3)]">
                  <Lock className="w-4 h-4" />
                  <span>Lockdown Active · 45:00</span>
                </div>
              </div>
            </div>
          )}

          {/* Shot 4: Reels & Shorts Blocker */}
          {shot === 'reels-blocker' && (
            <div className="w-full h-full flex flex-col justify-between p-6 pt-12">
              <div className="border-b border-white/[0.08] pb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  Accessibility Blocker
                </span>
                <h3 className="text-xl font-bold text-white tracking-tight mt-1">Reels & Shorts Blocker</h3>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Targeted short-form video containment
                </p>
              </div>

              <div className="flex flex-col gap-4 my-auto">
                <div className="p-5 rounded-2xl bg-white/[0.04] border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-white">Auto-Exit Shorts & Reels</span>
                    <div className="w-12 h-6 rounded-full bg-cyan-400 p-0.5 flex items-center justify-end">
                      <div className="w-5 h-5 rounded-full bg-black shadow" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                    Automatically navigates back when you scroll into Instagram Reels or YouTube Shorts, keeping messaging and research tools functional.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-xs text-slate-300">Instagram direct messages remain accessible</span>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-xs text-slate-300">YouTube tutorial videos remain playable</span>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <span className="text-xs text-slate-300">Shorts feed instantly closes upon launch</span>
                </div>
              </div>

              <div className="pb-6">
                <div className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm text-center">
                  Settings Saved
                </div>
              </div>
            </div>
          )}

          {/* Shot 5: Timer Modes */}
          {shot === 'timer-modes' && (
            <div className="w-full h-full flex flex-col justify-between p-6 pt-12">
              <div className="border-b border-white/[0.08] pb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                  Engine Flexibility
                </span>
                <h3 className="text-xl font-bold text-white tracking-tight mt-1">Three Timer Modes</h3>
                <p className="text-xs text-slate-400 font-mono mt-1">Tailored for every study protocol</p>
              </div>

              <div className="flex flex-col gap-3 my-auto">
                <div className="p-4 rounded-2xl bg-white/[0.05] border border-amber-500/40">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Pomodoro (25m / 5m)</span>
                    <span className="text-[10px] font-mono text-amber-400 uppercase font-bold">Active</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Structured 25-minute sprints with automatic break chimes and cycle counters.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Countdown (up to 24h)</span>
                    <span className="text-[10px] font-mono text-slate-500">24h hard cap</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Set targeted exam simulations or deep study sessions with loud audible completion alarms.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Stopwatch</span>
                    <span className="text-[10px] font-mono text-slate-500">Open-ended</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Track natural focus endurance with 12h confirmation checks and milestone dings.
                  </p>
                </div>
              </div>

              <div className="pb-6">
                <div className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm text-center">
                  Ready to Study
                </div>
              </div>
            </div>
          )}

          {/* Shot 6: Ranks & Seasons */}
          {shot === 'ranks-leaderboard' && (
            <div className="w-full h-full flex flex-col justify-between p-6 pt-12">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                    Competitive Study
                  </span>
                  <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">Season Leaderboard</h3>
                </div>
                <div className="px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-xs font-mono">
                  Season 4
                </div>
              </div>

              <div className="flex flex-col gap-2.5 my-auto">
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 to-transparent border border-amber-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-amber-400 text-sm">#1</span>
                    <RankCrestBadge tier="Master" division="" size={28} interactive={false} />
                    <div>
                      <div className="text-xs font-bold text-white">Aura Scholar</div>
                      <div className="text-[10px] font-mono text-slate-400">Master · 4,820 RP</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400">+180 RP</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-slate-300 text-sm">#2</span>
                    <RankCrestBadge tier="Diamond" division="I" size={28} interactive={false} />
                    <div>
                      <div className="text-xs font-bold text-white">CipherMind</div>
                      <div className="text-[10px] font-mono text-slate-400">Diamond I · 3,940 RP</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400">+120 RP</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-amber-600 text-sm">#3</span>
                    <RankCrestBadge tier="Diamond" division="III" size={28} interactive={false} />
                    <div>
                      <div className="text-xs font-bold text-white">AtlasFocus</div>
                      <div className="text-[10px] font-mono text-slate-400">Diamond III · 3,420 RP</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400">+90 RP</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-between shadow-[0_0_15px_rgba(245,158,11,0.15)] mt-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-amber-300 text-sm">#14</span>
                    <RankCrestBadge tier="Gold" division="IV" size={28} interactive={false} />
                    <div>
                      <div className="text-xs font-bold text-amber-300">You (@wren)</div>
                      <div className="text-[10px] font-mono text-slate-400">Gold IV · 1,420 RP</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-300">Top 5%</span>
                </div>
              </div>

              <div className="pb-6 text-center text-xs text-slate-400 font-mono">
                Monthly season reset with dynamic carryover RP
              </div>
            </div>
          )}

          {/* Shot 7: Study Rooms */}
          {shot === 'study-rooms' && (
            <div className="w-full h-full flex flex-col justify-between p-6 pt-12">
              <div className="border-b border-white/[0.08] pb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Library Room #04</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">8 scholars studying now</p>
                </div>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  Live Room
                </span>
              </div>

              <div className="flex flex-col gap-3 my-auto">
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-500/40 flex items-center justify-center font-bold text-xs text-emerald-300">
                      A
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Aura · Organic Chemistry</div>
                      <div className="text-[10px] font-mono text-emerald-400">Focusing (42m elapsed)</div>
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-amber-950 border border-amber-500/40 flex items-center justify-center font-bold text-xs text-amber-300">
                      K
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Kaelen · Linear Algebra</div>
                      <div className="text-[10px] font-mono text-amber-400">Short Break (3m left)</div>
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-cyan-950 border border-cyan-500/40 flex items-center justify-center font-bold text-xs text-cyan-300">
                      W
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Wren (You) · Data Structures</div>
                      <div className="text-[10px] font-mono text-cyan-400">Deep Focus (25m timer)</div>
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                </div>
              </div>

              <div className="pb-6">
                <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-mono text-slate-300 flex items-center justify-between">
                  <span>Send a message or encouragement...</span>
                  <span className="text-slate-500">↵</span>
                </div>
              </div>
            </div>
          )}

          {/* Shot 8: Themes & Sounds */}
          {shot === 'themes-sounds' && (
            <div className="w-full h-full flex flex-col justify-between p-6 pt-12">
              <div className="border-b border-white/[0.08] pb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-purple-400 font-bold">
                  Atmosphere
                </span>
                <h3 className="text-xl font-bold text-white tracking-tight mt-1">Soundscapes & Looks</h3>
                <p className="text-xs text-slate-400 font-mono mt-1">18 themes · 8 ambient focus tracks</p>
              </div>

              <div className="flex flex-col gap-3 my-auto">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">Rainstorm on Glass</span>
                    <span className="text-xs font-mono text-cyan-400">65%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="w-[65%] h-full bg-cyan-400 rounded-full" />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">Deep Forest Birds</span>
                    <span className="text-xs font-mono text-emerald-400">40%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="w-[40%] h-full bg-emerald-400 rounded-full" />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">Campfire Embers</span>
                    <span className="text-xs font-mono text-amber-400">25%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="w-[25%] h-full bg-amber-400 rounded-full" />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">Active Theme: Obsidian Gold</span>
                  <div className="flex gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[#0A0A0B] border border-amber-500" />
                    <span className="w-4 h-4 rounded-full bg-[#0D1117] border border-slate-600" />
                    <span className="w-4 h-4 rounded-full bg-[#18181B] border border-purple-500" />
                  </div>
                </div>
              </div>

              <div className="pb-6">
                <div className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm text-center">
                  Mixer Active
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Shot 9: Desktop Sync Screen (1280x800) */
        <div
          id="shot-container"
          className="w-[1280px] h-[800px] bg-[#07090E] relative overflow-hidden flex flex-col p-8 border border-white/[0.08]"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-3">
              <Logo className="w-8 h-8" />
              <span className="text-xl font-bold tracking-tight text-white">study.io</span>
              <div className="flex items-center gap-1.5 ml-6 bg-white/[0.04] p-1 rounded-full border border-white/10">
                <span className="px-4 py-1 rounded-full bg-white text-black font-bold text-xs">TIMER</span>
                <span className="px-4 py-1 text-slate-400 font-medium text-xs">TASKS</span>
                <span className="px-4 py-1 text-slate-400 font-medium text-xs">STATS</span>
                <span className="px-4 py-1 text-slate-400 font-medium text-xs">ROOMS</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-amber-500/30">
                <RankCrestBadge tier="Gold" division="IV" size={22} interactive={false} />
                <span className="text-xs font-mono font-bold text-amber-400">GOLD IV</span>
              </div>
              <div className="flex items-center gap-2 pl-3 border-l border-white/10">
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/20 flex items-center justify-center font-bold text-xs">
                  W
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-white">wren</div>
                  <div className="text-[10px] font-mono text-slate-400">@wren · Lv. 15</div>
                </div>
              </div>
            </div>
          </div>

          {/* Center Main Stage */}
          <div className="flex-1 flex items-center justify-center relative my-auto">
            <div className="relative w-80 h-80 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.06)" strokeWidth="3" fill="none" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="#FFFFFF"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray="263.89"
                  strokeDashoffset="75"
                  fill="none"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-6xl font-black font-mono tracking-tight text-white">25:00</span>
                <span className="text-xs font-mono font-semibold text-slate-400 tracking-widest uppercase mt-3">
                  Deep Focus · Linear Algebra
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="flex items-center justify-between border-t border-white/[0.08] pt-4">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Synced with Android App · 18s ago</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-6 py-2.5 rounded-xl bg-white text-black font-bold text-xs tracking-wider uppercase">
                Start Session
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
