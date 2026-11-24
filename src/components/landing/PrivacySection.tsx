'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Lock, Trash2, ArrowUpRight, CheckCircle2 } from 'lucide-react';

export function PrivacySection() {
  return (
    <section id="privacy" className="py-24 px-4 sm:px-6 max-w-5xl mx-auto relative text-center">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/[0.04] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 text-xs font-mono uppercase tracking-wider mb-3">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Section 11 • Honest Privacy Guarantee</span>
      </div>
      <h2 className="text-3xl sm:text-4xl font-hud font-bold text-white tracking-tight">
        Privacy & Data Control. <br />
        <span className="text-slate-400 font-sans font-semibold text-2xl sm:text-3xl">
          Zero data monetization. 100% on-device blocking.
        </span>
      </h2>
      <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans max-w-2xl mx-auto leading-relaxed">
        Study.io was engineered as a sanctum for focus. We do not track your browsing, read your screens, or sell personal profiles to ad networks.
      </p>

      {/* 3 Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 text-left">
        <div className="p-6 rounded-3xl bg-[#0F121C] border border-white/10 space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-base font-hud font-bold text-white">
            100% On-Device Blocking
          </h3>
          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            Distraction locking runs directly inside Android system memory. The list of apps installed on your device is never transmitted to any cloud servers.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-[#0F121C] border border-white/10 space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-base font-hud font-bold text-white">
            Zero Sensitive Access
          </h3>
          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            Never reads chats, keystrokes, personal media, passwords, or banking applications. The short-form video blocker detects feed UI containers without inspecting content.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-[#0F121C] border border-white/10 space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400">
            <Trash2 className="w-5 h-5" />
          </div>
          <h3 className="text-base font-hud font-bold text-white">
            One-Click Data Deletion
          </h3>
          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            You own your history. A prominent &ldquo;Delete My Data&rdquo; button inside Settings allows you to immediately and permanently erase all account records, stats, and saved sessions.
          </p>
        </div>
      </div>

      {/* Link to Full Privacy Charter */}
      <div className="mt-8 flex justify-center">
        <Link
          href="/privacy"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400 hover:text-emerald-300 underline underline-offset-4 transition-colors"
        >
          <span>Read our complete Privacy Policy & Charter</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}
