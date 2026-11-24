'use client';

import React, { useState } from 'react';
import { Smartphone, Monitor, WifiOff, Wifi, RefreshCw, CheckCircle2, Bell } from 'lucide-react';

export function WorksEverywhereSection() {
  const [offlineSimStep, setOfflineSimStep] = useState<0 | 1 | 2>(0);

  const triggerSyncSim = () => {
    setOfflineSimStep(1); // Studying offline
    setTimeout(() => {
      setOfflineSimStep(2); // Reconnected & syncing
      setTimeout(() => {
        setOfflineSimStep(0); // Synced cleanly
      }, 3000);
    }, 2500);
  };

  return (
    <section id="platform" className="py-24 px-4 sm:px-6 max-w-6xl mx-auto relative">
      {/* Background glow */}
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-96 h-96 bg-cyan-500/[0.04] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 text-cyan-300 text-xs font-mono uppercase tracking-wider mb-3">
          <Monitor className="w-3.5 h-3.5" />
          <span>Section 10 • Cross-Platform & Sync</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-hud font-bold text-white tracking-tight">
          Works on Web & Native Android. <br />
          <span className="text-slate-400 font-sans font-semibold text-2xl sm:text-3xl">
            Offline outbox queues your study seamlessly.
          </span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans leading-relaxed">
          Lose connection in the library? Your focus timer, task checks, and XP queue locally in an offline outbox and flush automatically the second you reconnect.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Device Sync & Notification Mockup */}
        <div className="lg:col-span-6 p-7 rounded-3xl bg-[#0F121C] border border-white/10 flex flex-col justify-between shadow-xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              <h3 className="text-base font-hud font-bold text-white">
                Android Foreground Service
              </h3>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
              Native Android
            </span>
          </div>

          {/* Android Persistent Notification Mockup */}
          <div className="p-4 rounded-2xl bg-[#141724] border border-white/10 shadow-lg text-left">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-white text-black flex items-center justify-center text-[10px] font-bold">
                  S
                </div>
                <span className="text-xs font-sans font-medium text-slate-200">study.io</span>
                <span className="text-[10px] text-slate-500">• now</span>
              </div>
              <Bell className="w-3.5 h-3.5 text-slate-400" />
            </div>

            <div className="mt-1">
              <span className="text-xs font-bold text-white block">Focus Session Active</span>
              <span className="text-xs text-slate-400 font-sans mt-0.5 block">
                Countdown: 28:44 remaining • Strict Mode Guard Active
              </span>
            </div>

            <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-white/[0.06] text-xs font-semibold text-cyan-400">
              <button type="button" className="hover:text-cyan-300">PAUSE</button>
              <button type="button" className="hover:text-cyan-300">ALLOW EMERGENCY APP</button>
            </div>
          </div>

          <div className="space-y-2 text-xs text-slate-400 font-sans">
            <p>
              • <strong>Persistent Notification:</strong> Always-on foreground notification keeps Android OS from terminating your timer during deep work.
            </p>
            <p>
              • <strong>Web & Desktop App:</strong> Full-screen immersion on your laptop with identical ranks, soundscapes, and cloud sync.
            </p>
          </div>
        </div>

        {/* Right: Offline Outbox Animation & Rules */}
        <div className="lg:col-span-6 p-7 rounded-3xl bg-[#0F121C] border border-white/10 flex flex-col justify-between shadow-xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-400" />
              <h3 className="text-base font-hud font-bold text-white">
                Offline Outbox Architecture
              </h3>
            </div>
            <button
              type="button"
              onClick={triggerSyncSim}
              className="text-[10px] font-mono text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-3 py-1 rounded-full cursor-pointer transition-colors"
            >
              Test Offline Sync
            </button>
          </div>

          {/* Interactive Simulation Graphic */}
          <div className="p-5 rounded-2xl bg-[#090C14] border border-white/[0.08] text-center space-y-4">
            <div className="flex items-center justify-center gap-4">
              <div className={`p-3 rounded-2xl border transition-colors ${
                offlineSimStep === 1
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-white/[0.03] border-white/10 text-slate-400'
              }`}>
                <WifiOff className="w-6 h-6" />
                <span className="text-[10px] font-mono block mt-1">Airplane / Offline</span>
              </div>

              <div className="w-12 h-0.5 bg-gradient-to-r from-white/20 to-emerald-400" />

              <div className={`p-3 rounded-2xl border transition-colors ${
                offlineSimStep === 2
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-white/[0.03] border-white/10 text-slate-400'
              }`}>
                <Wifi className="w-6 h-6" />
                <span className="text-[10px] font-mono block mt-1">Reconnected</span>
              </div>
            </div>

            <div className="text-xs font-mono">
              {offlineSimStep === 0 && (
                <span className="text-slate-400">All local sessions in sync with database</span>
              )}
              {offlineSimStep === 1 && (
                <span className="text-amber-400 animate-pulse">
                  Device Offline • 45m study session saved in local Outbox
                </span>
              )}
              {offlineSimStep === 2 && (
                <span className="text-emerald-400 animate-pulse">
                  Connection restored • Flushing outbox to cloud & updating rank!
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2 text-xs text-slate-400 font-sans">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Works 100% Offline:</strong> Timers, local soundscapes, task binder, and strict app locking.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span><strong>Requires Internet:</strong> Live Study Rooms audio/chat presence and real-time multiplayer leaderboard rankings.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
