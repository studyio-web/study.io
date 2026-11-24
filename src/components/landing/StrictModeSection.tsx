'use client';

import React, { useState } from 'react';
import { Shield, ShieldAlert, Lock, CheckCircle2, Smartphone, EyeOff, Award } from 'lucide-react';

type StrictTab = 'strict' | 'reels' | 'ultra';

export function StrictModeSection() {
  const [activeTab, setActiveTab] = useState<StrictTab>('strict');
  const [isSimulatingBlock, setIsSimulatingBlock] = useState(false);
  const [isSealed, setIsSealed] = useState(false);
  const [sealProgress, setSealProgress] = useState(0);

  // Hold to seal Ultra Strict simulation
  const handleHoldStart = () => {
    let p = 0;
    const interval = setInterval(() => {
      p += 10;
      setSealProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setIsSealed(true);
      }
    }, 100);

    const cleanup = () => {
      clearInterval(interval);
      if (p < 100) {
        setSealProgress(0);
      }
      window.removeEventListener('mouseup', cleanup);
      window.removeEventListener('touchend', cleanup);
    };

    window.addEventListener('mouseup', cleanup);
    window.addEventListener('touchend', cleanup);
  };

  const triggerBlockSimulation = () => {
    setIsSimulatingBlock(true);
    setTimeout(() => {
      setIsSimulatingBlock(false);
    }, 2800);
  };

  return (
    <section id="strict" className="py-24 px-4 sm:px-6 max-w-6xl mx-auto relative">
      {/* Background radial highlight */}
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-96 h-96 bg-red-500/[0.04] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/[0.08] border border-red-500/20 text-red-400 text-xs font-mono uppercase tracking-wider mb-3">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Section 02 • True On-Device Shield</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-hud font-bold text-white tracking-tight">
          Strict Mode & App Shield. <br />
          <span className="text-slate-400 font-sans font-semibold text-2xl sm:text-3xl">
            Blocks impulse opening at hardware speed.
          </span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans leading-relaxed">
          100% on-device blocking. Zero screen-reading, zero background browsing analysis. Powered by Android system usage events.
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center justify-center gap-2 max-w-md mx-auto mb-10 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
        <button
          type="button"
          onClick={() => {
            setActiveTab('strict');
            setIsSealed(false);
          }}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-hud font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'strict'
              ? 'bg-white text-[#07090E] shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Strict Mode
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('reels');
            setIsSealed(false);
          }}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-hud font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'reels'
              ? 'bg-white text-[#07090E] shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Reels & Shorts
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('ultra');
            setIsSealed(false);
          }}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-hud font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'ultra'
              ? 'bg-red-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Ultra Strict
        </button>
      </div>

      {/* Interactive Mockup Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Phone Mockup Simulation */}
        <div className="lg:col-span-6 flex justify-center">
          <div className="relative w-[280px] sm:w-[310px] h-[520px] rounded-[44px] bg-[#0A0D14] border-4 border-slate-700/60 p-3 shadow-[0_25px_60px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col justify-between">
            {/* Camera Speaker Notch */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-4 bg-slate-900 rounded-full z-30 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
            </div>

            {/* Simulated Phone Screen */}
            <div className="relative w-full h-full rounded-[34px] bg-[#07090E] overflow-hidden flex flex-col justify-between p-4 pt-8">
              {/* Fake Background App (Simulating Distraction) */}
              <div className="absolute inset-0 bg-[#161822] flex flex-col items-center justify-center p-6 text-center opacity-40">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-white font-bold text-xl mb-3">
                  App
                </div>
                <span className="text-xs font-sans text-slate-300">Social Feed</span>
                <span className="text-[10px] font-mono text-slate-500 mt-1">Infinite Scroll Active</span>
              </div>

              {/* Study.io Slide-in Shield Overlay when triggered */}
              <div
                className={`absolute inset-0 z-20 bg-[#07090E] p-6 flex flex-col justify-between items-center text-center transition-transform duration-300 ease-out ${
                  isSimulatingBlock || isSealed ? 'translate-y-0' : 'translate-y-full'
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center mt-8">
                  <Lock className="w-7 h-7" />
                </div>

                <div>
                  <h3 className="text-base font-hud font-bold text-white tracking-wide">
                    {activeTab === 'ultra'
                      ? 'SESSION LOCKED'
                      : activeTab === 'reels'
                      ? 'FEED BLOCKED'
                      : 'APP RESTRICTED'}
                  </h3>
                  <p className="text-xs text-slate-400 font-sans mt-2 leading-relaxed">
                    {activeTab === 'ultra'
                      ? 'Ultra Strict is active. You cannot stop or exit until your countdown finishes.'
                      : activeTab === 'reels'
                      ? 'Shorts & Reels feed was interrupted. Return to your study session.'
                      : 'This app is not on your allowed study list. Focus session is running.'}
                  </p>
                </div>

                <div className="w-full">
                  <div className="w-full py-2.5 rounded-xl bg-white text-[#07090E] font-hud font-bold text-xs uppercase tracking-wider">
                    Back to Study.io
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 mt-2 block">
                    Enforced by study.io on-device
                  </span>
                </div>
              </div>

              {/* Normal State: Study.io Running with Simulation Button */}
              <div className="relative z-10 flex flex-col items-center justify-between h-full pt-4">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white text-[11px] font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Focus: 32:45 remaining</span>
                </div>

                <div className="text-center my-auto">
                  <div className="w-20 h-20 rounded-3xl bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto mb-3">
                    <Shield className="w-9 h-9 text-emerald-400" />
                  </div>
                  <span className="text-sm font-hud font-bold text-white">Shield Guarding</span>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[190px]">
                    Simulate opening a restricted app during focus:
                  </p>
                </div>

                {activeTab === 'ultra' ? (
                  <div className="w-full">
                    {!isSealed ? (
                      <button
                        type="button"
                        onMouseDown={handleHoldStart}
                        onTouchStart={handleHoldStart}
                        className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-hud font-bold text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer select-none"
                      >
                        {sealProgress > 0 ? `Sealing (${sealProgress}%)...` : 'Hold to Seal Session'}
                      </button>
                    ) : (
                      <div className="w-full py-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 font-hud font-bold text-xs uppercase tracking-wider text-center">
                        Locked until 00:00:00
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={triggerBlockSimulation}
                    className="w-full py-3 rounded-xl bg-white text-[#07090E] font-hud font-bold text-xs uppercase tracking-wider shadow-md hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    Test App Block
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Technical Details & Privacy Assurances */}
        <div className="lg:col-span-6 space-y-6 text-left">
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-hud font-bold text-white tracking-wide">
                100% On-Device Execution
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
              Focus locking and short-form detection run strictly inside Android system memory. Your app usage, opened packages, and app switch logs are never sent across the internet.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-hud font-bold text-white tracking-wide">
                Ultra Strict & Device Admin Protection
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
              Countdown mode only. In Ultra Strict, the stop and pause controls are disabled until the timer ends. Optional Device Admin protection prevents app uninstallation or force-stop during an active session.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <EyeOff className="w-5 h-5" />
              </div>
              <h3 className="text-base font-hud font-bold text-white tracking-wide">
                Zero Content Inspection
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
              We never read your messages, screen text, banking apps, camera, or personal documents. The Reels & Shorts filter detects specific UI surface containers without reading what you watch.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
