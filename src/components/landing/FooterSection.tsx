'use client';

import React from 'react';
import Link from 'next/link';
import { Download, ArrowRight, ShieldCheck, Heart, ExternalLink } from 'lucide-react';
import { Logo } from '../Logo';
import { startApkDownload, LATEST_APK_CDN_URL } from '../../lib/apkDownload';

interface FooterSectionProps {
  onStartFree: () => void;
}

export function FooterSection({ onStartFree }: FooterSectionProps) {
  return (
    <footer className="relative border-t border-white/[0.08] bg-[#05060A] pt-20 pb-16 px-4 sm:px-6">
      {/* Big Final Call to Action Block */}
      <div className="max-w-4xl mx-auto rounded-[36px] bg-gradient-to-b from-[#0F1320] to-[#0A0D14] border border-white/10 p-8 sm:p-14 text-center shadow-2xl mb-20 relative overflow-hidden">
        {/* Glow behind final CTA */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-amber-500/[0.08] rounded-full blur-3xl pointer-events-none -z-10" />

        <h2 className="text-3xl sm:text-5xl font-hud font-bold text-white tracking-tight">
          Ready to Forge Your Focus?
        </h2>
        <p className="mt-4 text-sm sm:text-base text-slate-300 font-sans max-w-lg mx-auto leading-relaxed">
          Join thousands of dedicated scholars climbing the ranks. Distraction-free, zero ads, completely free to start.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
          <Link
            href="/login"
            onClick={(e) => {
              if (onStartFree) {
                e.preventDefault();
                onStartFree();
              }
            }}
            className="w-full sm:w-auto min-h-[50px] px-8 py-3.5 rounded-2xl bg-white text-[#07090E] font-hud font-bold text-sm tracking-wide flex items-center justify-center gap-2.5 shadow-[0_0_30px_rgba(255,255,255,0.25)] hover:bg-slate-100 transition-all duration-150 active:scale-[0.98] cursor-pointer"
          >
            <span>Start studying free</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </Link>

          <a
            href={LATEST_APK_CDN_URL}
            target="_blank"
            rel="noopener noreferrer"
            download="studyio-v2.5.apk"
            onClick={(e) => {
              e.preventDefault();
              startApkDownload(LATEST_APK_CDN_URL);
            }}
            className="w-full sm:w-auto min-h-[50px] px-7 py-3.5 rounded-2xl bg-white/[0.05] hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-200 font-sans font-medium text-sm transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4 stroke-[2]" />
            <span>Download for Android (APK v2.5)</span>
          </a>
        </div>

        <div className="flex items-center justify-center gap-4 mt-6 text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Verified Clean • Direct APK</span>
          </span>
          <span>•</span>
          <span className="text-slate-500">Google Play Store coming soon</span>
        </div>
      </div>

      {/* Main Footer Links & Copyright */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 pt-10 border-t border-white/[0.06] text-xs font-sans text-slate-400">
        {/* Brand */}
        <div className="flex flex-col items-center md:items-start gap-2">
          <div className="flex items-center gap-2.5">
            <Logo className="w-6 h-6" />
            <span className="text-base font-bold text-white font-sans tracking-tight">
              study.io
            </span>
          </div>
          <p className="text-slate-500 text-center md:text-left">
            The competitive study sanctuary. Timers, monthly rank climb & study rooms.
          </p>
        </div>

        {/* Links */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-slate-400 font-sans">
          <Link
            href="/privacy"
            className="hover:text-white transition-colors"
          >
            Privacy Policy
          </Link>
          <a
            href="#hero"
            className="hover:text-white transition-colors"
          >
            Features Overview
          </a>
          <a
            href="mailto:support@studyio.app"
            className="hover:text-white transition-colors"
          >
            Contact & Support
          </a>
          <Link
            href="/login"
            className="hover:text-white transition-colors inline-flex items-center gap-1"
          >
            <span>Launch Web App</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
        </div>

        {/* Copyright */}
        <div className="text-slate-500 font-mono text-[11px] text-center md:text-right">
          © {new Date().getFullYear()} study.io • All rights reserved
        </div>
      </div>
    </footer>
  );
}
