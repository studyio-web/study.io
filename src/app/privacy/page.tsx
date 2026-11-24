'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle2,
  Lock,
  EyeOff,
  Cpu,
  ExternalLink,
  ArrowLeft,
  Smartphone,
  HardDrive,
  FileCheck,
} from 'lucide-react';
import { Logo } from '@/components/Logo';

export default function PrivacyPage() {
  const virusTotalHash = 'fd3ee396cd5ff281b97eede5f522992e5e7a89951749bad2464c5b7d666b59d8';
  const virusTotalUrl = `https://www.virustotal.com/gui/file/${virusTotalHash}`;

  return (
    <div className="min-h-screen w-full bg-[#07090E] text-slate-100 select-none relative flex flex-col">
      {/* Background dot grid matching app layout */}
      <div className="fixed inset-0 pointer-events-none bg-dot-grid opacity-25 z-0" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[radial-gradient(circle,rgba(255,255,255,0.04)_0%,transparent_70%)] pointer-events-none z-0" />

      {/* Navigation Header */}
      <header className="relative z-10 w-full border-b border-white/[0.08] bg-[#07090E]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <Logo className="w-7 h-7" />
            <span className="text-base font-bold tracking-tight text-white font-sans">
              study.io
            </span>
          </Link>

          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to App</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10 space-y-8">
        {/* Title Block */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 font-mono text-xs">
            <ShieldCheck className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>Privacy Charter &amp; Security Architecture</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-hud font-bold tracking-tight text-white">
            How Study.io Protects Your Data &amp; Privacy
          </h1>

          <p className="text-sm text-slate-400 font-sans leading-relaxed max-w-2xl">
            Study.io is engineered for deep focus. To enforce strict distraction blocking without compromising user security, our architecture adheres to a strict on-device isolation standard.
          </p>
        </div>

        {/* VirusTotal Verification Banner */}
        <section className="p-5 rounded-2xl bg-[#0D1017] border border-emerald-500/25 relative overflow-hidden shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-hud font-bold uppercase tracking-wider text-emerald-300">
                  Third-Party Security Verification
                </span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                The official Study.io Android APK release has been independently audited and scanned across global antivirus engines on VirusTotal.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] font-mono text-slate-400">Scan Status:</span>
                <span className="text-[11px] font-mono font-bold text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                  Verified Clean &bull; Undetected
                </span>
              </div>
            </div>

            <a
              href={virusTotalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-[#07090E] text-xs font-hud font-bold uppercase tracking-wider transition-all shadow-md active:scale-95 shrink-0"
            >
              <span>View Scan Report</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-2 text-[10px] font-mono text-slate-500 overflow-x-auto">
            <span className="text-slate-400 shrink-0">SHA-256:</span>
            <code className="text-slate-300">{virusTotalHash}</code>
          </div>
        </section>

        {/* 3 Core Pillars */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-[#0F1117] border border-white/[0.08] space-y-2">
            <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white">
              <Cpu className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-hud font-bold text-white tracking-wide">
              100% On-Device
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              All app blocking and screen checks evaluate locally in real time. Zero screen captures or usage streams ever touch external servers.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#0F1117] border border-white/[0.08] space-y-2">
            <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white">
              <EyeOff className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-hud font-bold text-white tracking-wide">
              Zero Content Access
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              We never read keystrokes, personal chats, media files, passwords, or banking applications. Our logic checks only package bundle identifiers.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#0F1117] border border-white/[0.08] space-y-2">
            <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white">
              <Lock className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-hud font-bold text-white tracking-wide">
              Strictly Opt-In
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Standard timers require zero device permissions. Elevated shields are strictly activated only when you choose to turn on Strict Mode.
            </p>
          </div>
        </section>

        {/* Android Permissions Audit */}
        <section className="p-6 rounded-2xl bg-[#0D1017] border border-white/[0.08] space-y-5">
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
            <Smartphone className="w-4 h-4 text-slate-300" />
            <h2 className="text-sm font-hud font-bold text-white tracking-wide uppercase">
              Android Permission Disclosure &amp; Scope Audit
            </h2>
          </div>

          <div className="space-y-4">
            {/* Permission 1 */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-amber-300">
                  android.permission.BIND_ACCESSIBILITY_SERVICE
                </span>
                <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-white/[0.05] border border-white/10">
                  Opt-In
                </span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                <strong className="text-white">Technical Purpose:</strong> Used exclusively to detect when short-form video players (such as Instagram Reels or YouTube Shorts) are actively opened during an active countdown timer session.
              </p>
              <div className="space-y-1 text-xs text-slate-400 font-sans">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Listens strictly to window state transitions.</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Never monitors keyboard input, form fields, passwords, or messages.</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Automatically deactivated when your study session ends or pauses.</span>
                </div>
              </div>
            </div>

            {/* Permission 2 */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-amber-300">
                  android.permission.BIND_DEVICE_ADMIN
                </span>
                <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-white/[0.05] border border-white/10">
                  Ultra Strict Only
                </span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                <strong className="text-white">Technical Purpose:</strong> Guards against impulsive app uninstallation during committed Ultra Strict focus sessions.
              </p>
              <div className="space-y-1 text-xs text-slate-400 font-sans">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Restricted to the DevicePolicyManager package uninstallation block API.</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Does NOT manage lockscreen pins, erase storage, or lock the device outside sessions.</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Can be deactivated at any time when the timer is not actively running.</span>
                </div>
              </div>
            </div>

            {/* Permission 3 */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-amber-300">
                  android.permission.PACKAGE_USAGE_STATS
                </span>
                <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-white/[0.05] border border-white/10">
                  Strict Mode
                </span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                <strong className="text-white">Technical Purpose:</strong> Queries the package name of the active foreground application to match against your permitted apps whitelist.
              </p>
              <div className="space-y-1 text-xs text-slate-400 font-sans">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Evaluated purely in volatile memory on-device.</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Historical app usage charts or browsing habits are never stored or uploaded.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Data Storage & Account Privacy */}
        <section className="p-6 rounded-2xl bg-[#0D1017] border border-white/[0.08] space-y-4">
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
            <HardDrive className="w-4 h-4 text-slate-300" />
            <h2 className="text-sm font-hud font-bold text-white tracking-wide uppercase">
              Cloud Storage &amp; User Account Data
            </h2>
          </div>

          <div className="space-y-3 text-xs text-slate-300 font-sans leading-relaxed">
            <p>
              Study.io synchronizes your study progress securely using encrypted Supabase PostgreSQL infrastructure. The data stored includes:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li>Study session durations, timestamps, and chosen subject tags.</li>
              <li>Season Rank Points (RP), Level progression, and active daily streak counts.</li>
              <li>Your chosen display name, avatar configuration, and user ID.</li>
            </ul>
            <p className="text-slate-400 pt-1">
              We never sell user data, integrate third-party advertising tracking libraries, or share study profiles with external brokers.
            </p>
          </div>
        </section>

        {/* Footer info */}
        <footer className="pt-6 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-500 pb-12">
          <span>Study.io &bull; Version 2.5 Architecture</span>
          <div className="flex items-center gap-4">
            <a href={virusTotalUrl} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors inline-flex items-center gap-1">
              <span>VirusTotal Report</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <Link href="/" className="hover:text-slate-300 transition-colors">
              Return to App
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
