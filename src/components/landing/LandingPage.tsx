'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Logo } from '../Logo';
import { ProCrown } from '../common/ProCrown';
import { RankCrestBadge } from '../common/RankCrestBadge';
import { RANK_TIERS } from '../../lib/rankedSystem';
import { startApkDownload, LATEST_APK_CDN_URL } from '../../lib/apkDownload';
import {
  ArrowRight,
  Download,
  ChevronDown,
  ExternalLink,
  Laptop,
  Smartphone,
  ShieldCheck,
  Flame,
  Volume2,
  Users,
} from 'lucide-react';

export interface LandingPageProps {
  onOpenAuth: () => void;
}

interface PhoneFrameProps {
  src: string;
  alt: string;
  glowColor?: string;
  priority?: boolean;
  className?: string;
}

function PhoneFrame({
  src,
  alt,
  glowColor = 'rgba(245, 158, 11, 0.25)',
  priority = false,
  className = '',
}: PhoneFrameProps) {
  return (
    <div className={`relative mx-auto w-full max-w-[310px] sm:max-w-[340px] aspect-[390/844] ${className}`}>
      {/* Soft ambient radial glow */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 sm:-inset-10 -z-10 rounded-full blur-[70px] pointer-events-none opacity-50"
        style={{ backgroundColor: glowColor }}
      />

      {/* Hardware Phone Shell */}
      <div className="relative w-full h-full rounded-[48px] p-[8px] sm:p-[10px] bg-gradient-to-b from-[#282A34] via-[#14151B] to-[#0A0B0E] border border-white/[0.1] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_0_1px_rgba(0,0,0,0.8)]">
        {/* Screen container */}
        <div className="relative w-full h-full rounded-[38px] overflow-hidden bg-[#07090E]">
          {/* Screenshot */}
          <Image
            src={src}
            alt={alt}
            fill
            unoptimized
            priority={priority}
            fetchPriority={priority ? 'high' : undefined}
            loading={priority ? 'eager' : 'lazy'}
            className="object-cover object-top select-none pointer-events-none"
          />
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ onOpenAuth }: LandingPageProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 24);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <main className="w-full min-h-screen bg-[#0A0A0B] text-white selection:bg-amber-500/30 selection:text-amber-300 font-sans antialiased overflow-x-hidden">
      {/* ============================================================ */}
      {/* 1. MINIMAL STICKY NAVIGATION BAR                              */}
      {/* ============================================================ */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-[#0A0A0B]/85 backdrop-blur-md border-b border-white/[0.08] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          {/* Brand Logo & Name */}
          <Link
            href="/"
            className="flex items-center gap-2.5 group cursor-pointer"
            aria-label="study.io home"
          >
            <Logo className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow-[0_0_16px_rgba(16,185,129,0.35)]" />
            <span className="font-hud font-bold text-xl sm:text-2xl text-white tracking-wider">
              study<span className="text-amber-500">.io</span>
            </span>
          </Link>

          {/* Action Links */}
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              type="button"
              onClick={onOpenAuth}
              className="text-sm font-medium text-white/80 hover:text-white transition-colors px-3 py-2 cursor-pointer"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('download')}
              className="min-h-[44px] px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.14] text-white text-xs sm:text-sm font-semibold font-hud tracking-wider uppercase transition-all shadow-sm cursor-pointer"
            >
              Get the app
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* 2. HERO SECTION                                               */}
      {/* ============================================================ */}
      <section className="relative pt-12 sm:pt-20 lg:pt-28 pb-20 sm:pb-32 px-4 sm:px-6 overflow-hidden">
        {/* Subtle center background radiant glow */}
        <div
          aria-hidden="true"
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-amber-500/[0.07] rounded-full blur-[140px] pointer-events-none -z-10"
        />

        <div className="max-w-5xl mx-auto text-center flex flex-col items-center">
          {/* Small Category Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/[0.08] border border-amber-500/25 text-amber-400 text-xs font-mono tracking-widest uppercase mb-6 sm:mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>SEASONAL RANKED FOCUS</span>
          </div>

          {/* Big Hero Display Headline (64-80px desktop, 40px mobile) */}
          <h1 className="font-hud font-bold text-[40px] sm:text-6xl md:text-7xl lg:text-[76px] text-white tracking-tight leading-[1.05] max-w-4xl mx-auto text-balance">
            The focus app built for rank-chasing students
          </h1>

          {/* Subtext: one accurate sentence */}
          <p className="mt-6 sm:mt-8 text-base sm:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed text-balance">
            Lock down distractions on your phone, track deep work with precision timers, and climb 23 seasonal ranks from Bronze to Grandmaster.
          </p>

          {/* Action CTAs */}
          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
            {/* Primary Study On Web Button */}
            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[48px] w-full sm:w-auto px-7 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0A0A0B] font-hud font-bold text-base tracking-wider uppercase transition-all shadow-[0_0_28px_rgba(245,158,11,0.28)] hover:shadow-[0_0_36px_rgba(245,158,11,0.42)] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <span>Study on the web</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Google Play Store Badge with Coming Soon */}
            <div className="min-h-[48px] w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.12] flex items-center justify-center gap-3 text-left">
              <svg className="w-5 h-5 fill-white shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a2.003 2.003 0 0 1-.61-1.436V3.25c0-.54.22-1.045.61-1.436zm11.233 11.236l2.164 2.164-11.89 6.865 9.726-9.029zm0-2.1l-9.726-9.03 11.89 6.866-2.164 2.164zm1.484 1.05l3.85-2.223a1.996 1.996 0 0 1 0 3.46l-3.85-2.237z" />
              </svg>
              <div>
                <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-300 leading-tight">Android App</div>
                <div className="text-xs sm:text-sm font-semibold text-white leading-tight">Google Play</div>
              </div>
              <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Coming soon
              </span>
            </div>

            {/* Direct Android APK Download */}
            <button
              type="button"
              onClick={() => startApkDownload()}
              className="min-h-[48px] w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] hover:border-white/20 text-white text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Download APK (105 MB)</span>
            </button>
          </div>

          {/* Large Hero Phone Screen Visual with overlapping Rank Badge */}
          <div className="mt-14 sm:mt-20 relative w-full max-w-[340px] sm:max-w-[380px] mx-auto animate-landing-float">
            <PhoneFrame
              src="/landing-shots/hero-timer.webp"
              alt="study.io focus timer app interface running on Android"
              glowColor="rgba(245, 158, 11, 0.22)"
              priority
            />

            {/* Overlapping Floating Rank Card */}
            <div className="absolute -bottom-4 -right-2 sm:-bottom-6 sm:-right-8 p-3.5 sm:p-4 rounded-2xl bg-[#12131A]/95 border border-amber-500/30 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex items-center gap-3.5 z-30">
              <div className="w-12 h-12 flex items-center justify-center shrink-0">
                <Image
                  src="/images/ranks/gold-4.webp"
                  alt="Gold IV rank crest"
                  width={48}
                  height={48}
                  unoptimized
                  priority
                  className="w-12 h-12 object-contain select-none pointer-events-none"
                />
              </div>
              <div className="text-left">
                <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-semibold leading-tight">
                  SEASON 1 CLIMB
                </div>
                <div className="text-sm sm:text-base font-hud font-bold text-white tracking-wide leading-tight mt-0.5">
                  GOLD IV
                </div>
                <div className="text-xs text-zinc-300 font-sans mt-0.5">
                  8,800 RP · 88 Focus Hours
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. RANK STRIP (23 TIERS LOOPING HORIZONTALLY)                  */}
      {/* ============================================================ */}
      <section className="py-12 sm:py-16 border-y border-white/[0.06] bg-[#070709] overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 mb-6 text-center">
          <p className="font-hud font-bold uppercase tracking-[0.22em] text-xs sm:text-sm text-zinc-300">
            Climb 23 ranks. Season by season.
          </p>
        </div>

        {/* Looping Row with all 23 real tiers from RANK_TIERS */}
        <div className="relative w-full overflow-hidden mask-gradient-x">
          <div className="flex gap-6 sm:gap-8 w-max animate-landing-marquee hover:[animation-play-state:paused]">
            {/* Render 2 duplicates of the 23-tier list for a seamless loop */}
            {[...RANK_TIERS, ...RANK_TIERS].map((tier, idx) => (
              <div
                key={`${tier.fullTitle}-${idx}`}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] shrink-0"
              >
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  <Image
                    src={`/images/ranks/${(tier.imagePath || 'bronze-1.png').replace('/images/ranks/', '').replace(/\.png$/, '.webp')}`}
                    alt={tier.fullTitle}
                    width={32}
                    height={32}
                    unoptimized
                    loading="lazy"
                    className="w-8 h-8 object-contain select-none pointer-events-none"
                  />
                </div>
                <div className="text-left">
                  <div className="font-hud font-bold text-xs sm:text-sm text-white tracking-wider">
                    {tier.fullTitle}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-400">
                    {tier.minRP.toLocaleString()} RP
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. BOLD STATEMENT SECTION                                     */}
      {/* ============================================================ */}
      <section className="py-24 sm:py-36 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          <div className="font-mono text-xs sm:text-sm uppercase tracking-[0.25em] text-red-400 font-semibold mb-4">
            RADICAL FOCUS
          </div>
          <h2 className="font-hud font-bold text-[40px] sm:text-6xl lg:text-7xl text-white tracking-tight leading-[1.05] text-balance">
            Study more. Scroll less.
          </h2>
          <p className="mt-6 text-base sm:text-xl text-white/70 max-w-xl mx-auto leading-relaxed text-balance">
            On-device app blocking that intercepts social distraction before it steals your focus.
          </p>

          <div className="mt-12 sm:mt-16 w-full max-w-[320px] sm:max-w-[360px] mx-auto">
            <PhoneFrame
              src="/landing-shots/blocked-app.webp"
              alt="study.io on-device app blocking shield intercepting a distracting app"
              glowColor="rgba(239, 68, 68, 0.22)"
            />
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. SIX ALTERNATING FEATURE BLOCKS                             */}
      {/* ============================================================ */}
      <div className="space-y-24 sm:space-y-36 lg:space-y-40 px-4 sm:px-6 max-w-6xl mx-auto">
        {/* BLOCK 1: STRICT MODE (Device Admin on-device blocking) */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="text-left lg:pr-6">
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-amber-500 font-semibold block mb-3">
              ON-DEVICE BLOCKING
            </span>
            <h3 className="font-hud font-bold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.1] mb-5">
              Lock distracting apps during deep work
            </h3>
            <p className="text-base sm:text-lg text-white/70 leading-relaxed">
              Device Admin blocks uninstalling and System Shield guards system settings to prevent force-stopping until your countdown finishes. Blocked apps stay sealed until your session ends.
            </p>
          </div>
          <div className="order-last lg:order-none">
            <PhoneFrame
              src="/landing-shots/strict-mode.webp"
              alt="Strict mode lockdown confirmation sheet in study.io"
              glowColor="rgba(245, 166, 35, 0.18)"
            />
          </div>
        </section>

        {/* BLOCK 2: REELS & SHORTS BLOCKER (Targeted restriction) */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="order-last lg:order-first">
            <PhoneFrame
              src="/landing-shots/reels-blocker.webp"
              alt="Reels and shorts blocker settings interface in study.io"
              glowColor="rgba(244, 63, 94, 0.18)"
            />
          </div>
          <div className="text-left lg:pl-6">
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-rose-400 font-semibold block mb-3">
              TARGETED RESTRICTION
            </span>
            <h3 className="font-hud font-bold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.1] mb-5">
              Block doomscrolling, keep the rest of your phone
            </h3>
            <p className="text-base sm:text-lg text-white/70 leading-relaxed">
              Automatically exits short-form video feeds like Instagram Reels and YouTube Shorts while leaving reference chats, search, and class tools open.
            </p>
          </div>
        </section>

        {/* BLOCK 3: TIMER ENGINE (Stopwatch, Countdown, Pomodoro) */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="text-left lg:pr-6">
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-emerald-400 font-semibold block mb-3">
              PRECISION TIMERS
            </span>
            <h3 className="font-hud font-bold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.1] mb-5">
              Stopwatch, Pomodoro, and 24-hour countdowns
            </h3>
            <p className="text-base sm:text-lg text-white/70 leading-relaxed">
              Switch between open-ended focus, structured work and break intervals, and multi-hour countdowns with audible alarms, subject tagging, and auto-logging.
            </p>
          </div>
          <div className="order-last lg:order-none">
            <PhoneFrame
              src="/landing-shots/timer-modes.webp"
              alt="study.io precision focus timer with countdown and pomodoro intervals"
              glowColor="rgba(16, 185, 129, 0.18)"
            />
          </div>
        </section>

        {/* BLOCK 4: RANKS & SEASONS (RP progression, leaderboards) */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="order-last lg:order-first">
            <PhoneFrame
              src="/landing-shots/ranks-leaderboard.webp"
              alt="Monthly season leaderboard and rank crest progression in study.io"
              glowColor="rgba(139, 92, 246, 0.18)"
            />
          </div>
          <div className="text-left lg:pl-6">
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-violet-400 font-semibold block mb-3">
              COMPETITIVE PROGRESSION
            </span>
            <h3 className="font-hud font-bold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.1] mb-5">
              Climb from Bronze to Grandmaster
            </h3>
            <p className="text-base sm:text-lg text-white/70 leading-relaxed">
              Every hour of focus earns 100 Rank Points. Compete across monthly seasons with fair soft resets and track your standing on Today, Week, Month, and All-Time leaderboards.
            </p>
          </div>
        </section>

        {/* BLOCK 5: STUDY ROOMS (Presence & silent accountability) */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="text-left lg:pr-6">
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-blue-400 font-semibold block mb-3">
              VIRTUAL LIBRARY
            </span>
            <h3 className="font-hud font-bold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.1] mb-5">
              Study together with live presence and silent accountability
            </h3>
            <p className="text-base sm:text-lg text-white/70 leading-relaxed">
              Join quiet study rooms with peers worldwide. See live status dots, track shared pomodoros, and send quick check-ins without distractions.
            </p>
          </div>
          <div className="order-last lg:order-none">
            <PhoneFrame
              src="/landing-shots/study-rooms.webp"
              alt="Live virtual study room with peer avatars and focused statuses"
              glowColor="rgba(59, 130, 246, 0.18)"
            />
          </div>
        </section>

        {/* BLOCK 6: THEMES & SOUNDSCAPES (18 themes, 8 soundscapes) */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="order-last lg:order-first">
            <PhoneFrame
              src="/landing-shots/themes-sounds.webp"
              alt="18 custom color themes and 8 ambient audio soundscapes in study.io"
              glowColor="rgba(245, 158, 11, 0.18)"
            />
          </div>
          <div className="text-left lg:pl-6">
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-amber-400 font-semibold block mb-3">
              ATMOSPHERE
            </span>
            <h3 className="font-hud font-bold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.1] mb-5">
              18 themes and 8 ambient soundscapes
            </h3>
            <p className="text-base sm:text-lg text-white/70 leading-relaxed">
              Tune your environment with deep-focus rain, forest, cafe, and campfire soundscapes paired with custom dark mode themes that match your rank.
            </p>
          </div>
        </section>
      </div>

      {/* ============================================================ */}
      {/* 6. WORKS EVERYWHERE (DESKTOP & MOBILE SYNC)                   */}
      {/* ============================================================ */}
      <section className="py-24 sm:py-36 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-14 sm:mb-20">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-emerald-400 font-semibold block mb-3">
            CROSS-PLATFORM
          </span>
          <h2 className="font-hud font-bold text-3xl sm:text-5xl lg:text-6xl text-white tracking-tight leading-[1.1] mb-4">
            Seamless sync between desk and mobile
          </h2>
          <p className="text-base sm:text-lg text-white/70 leading-relaxed">
            Start a session at your desk, track deep work during lectures on your phone. Every hour, task, and rank point synchronizes across all your devices in real time.
          </p>
        </div>

        {/* Side-by-side or Layered PC Browser and Mobile Mockup */}
        <div className="relative mx-auto max-w-4xl">
          {/* Desktop Browser Window Mockup */}
          <div className="rounded-2xl border border-white/[0.1] bg-[#10121A] shadow-[0_30px_90px_rgba(0,0,0,0.85)] overflow-hidden">
            {/* Minimal Dark Browser Bar */}
            <div className="h-10 px-4 bg-[#161822] border-b border-white/[0.08] flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-white/15" />
                <div className="w-3 h-3 rounded-full bg-white/15" />
                <div className="w-3 h-3 rounded-full bg-white/15" />
              </div>
              <div className="mx-auto px-4 py-1 rounded-md bg-black/40 border border-white/[0.06] text-xs font-mono text-zinc-300 truncate max-w-xs sm:max-w-md">
                https://studyio-web.vercel.app/dashboard
              </div>
            </div>
            {/* Screenshot of Real Desktop UI */}
            <div className="relative w-full aspect-[16/9] bg-black">
              <Image
                src="/landing-shots/desktop-sync.webp"
                alt="study.io desktop web dashboard with full timer dial and dark hud theme"
                fill
                unoptimized
                loading="lazy"
                className="object-contain object-center select-none pointer-events-none"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 7. PRO SECTION (ONE COMPACT LINE, NO PRICING TABLE)           */}
      {/* ============================================================ */}
      <section className="py-12 sm:py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="p-6 sm:p-8 rounded-2xl bg-[#12131A] border border-white/[0.1] shadow-lg flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                <ProCrown size={24} variant="gold" />
              </div>
              <div>
                <div className="font-hud font-bold text-lg sm:text-xl text-white tracking-wide flex items-center gap-2.5 justify-center sm:justify-start">
                  <span>study.io Pro</span>
                  <span className="text-xs font-mono font-normal text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded">
                    ₹499/mo · ₹4,999/yr
                  </span>
                </div>
                <p className="text-sm text-zinc-300 mt-1">
                  Unlimited virtual study rooms, all 8 soundscapes, and advanced analytics.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[44px] shrink-0 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0A0A0B] font-hud font-bold text-sm tracking-wider uppercase transition-all shadow-md cursor-pointer active:scale-[0.98]"
            >
              Upgrade to Pro
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 8. FAQ ACCORDION (5 SHORT ACCURATE QUESTIONS)                 */}
      {/* ============================================================ */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 max-w-3xl mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-300 font-semibold block mb-3">
            QUESTIONS &amp; ANSWERS
          </span>
          <h2 className="font-hud font-bold text-3xl sm:text-4xl text-white tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          {/* FAQ 1 */}
          <details className="group rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 sm:p-6 transition-all duration-200 open:bg-white/[0.04] open:border-white/[0.14]">
            <summary className="font-hud font-bold text-base sm:text-lg text-white flex items-center justify-between cursor-pointer list-none select-none">
              <span>Is study.io free?</span>
              <ChevronDown className="w-4 h-4 text-zinc-300 transition-transform duration-200 group-open:rotate-180 shrink-0 ml-3" />
            </summary>
            <p className="mt-3 text-sm sm:text-base text-zinc-300 leading-relaxed font-sans">
              Yes. Core focus timers (stopwatch, countdown, pomodoro), rank tracking from Bronze to Grandmaster, daily task management, and community leaderboards are 100% free.
            </p>
          </details>

          {/* FAQ 2 */}
          <details className="group rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 sm:p-6 transition-all duration-200 open:bg-white/[0.04] open:border-white/[0.14]">
            <summary className="font-hud font-bold text-base sm:text-lg text-white flex items-center justify-between cursor-pointer list-none select-none">
              <span>Which platforms are supported?</span>
              <ChevronDown className="w-4 h-4 text-zinc-300 transition-transform duration-200 group-open:rotate-180 shrink-0 ml-3" />
            </summary>
            <p className="mt-3 text-sm sm:text-base text-zinc-300 leading-relaxed font-sans">
              study.io runs as a modern web app on desktop browsers and as a native Android app featuring on-device app blocking and Device Admin protection. Sessions sync across your account.
            </p>
          </details>

          {/* FAQ 3 */}
          <details className="group rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 sm:p-6 transition-all duration-200 open:bg-white/[0.04] open:border-white/[0.14]">
            <summary className="font-hud font-bold text-base sm:text-lg text-white flex items-center justify-between cursor-pointer list-none select-none">
              <span>How does Strict Mode work?</span>
              <ChevronDown className="w-4 h-4 text-zinc-300 transition-transform duration-200 group-open:rotate-180 shrink-0 ml-3" />
            </summary>
            <p className="mt-3 text-sm sm:text-base text-zinc-300 leading-relaxed font-sans">
              On Android, Strict Mode uses on-device Accessibility and Device Admin permissions to prevent opening distracting apps while your timer is running. Device Admin blocks uninstalling and System Shield guards phone settings to prevent force-stopping until the countdown finishes.
            </p>
          </details>

          {/* FAQ 4 */}
          <details className="group rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 sm:p-6 transition-all duration-200 open:bg-white/[0.04] open:border-white/[0.14]">
            <summary className="font-hud font-bold text-base sm:text-lg text-white flex items-center justify-between cursor-pointer list-none select-none">
              <span>Can I block just Reels and Shorts?</span>
              <ChevronDown className="w-4 h-4 text-zinc-300 transition-transform duration-200 group-open:rotate-180 shrink-0 ml-3" />
            </summary>
            <p className="mt-3 text-sm sm:text-base text-zinc-300 leading-relaxed font-sans">
              Yes. When the Reels &amp; Shorts blocker is active, study.io detects and exits short-form video feeds inside apps like Instagram and YouTube while leaving direct messages, study materials, and searches accessible.
            </p>
          </details>

          {/* FAQ 5 */}
          <details className="group rounded-2xl bg-white/[0.02] border border-white/[0.08] p-5 sm:p-6 transition-all duration-200 open:bg-white/[0.04] open:border-white/[0.14]">
            <summary className="font-hud font-bold text-base sm:text-lg text-white flex items-center justify-between cursor-pointer list-none select-none">
              <span>What are study rooms?</span>
              <ChevronDown className="w-4 h-4 text-zinc-300 transition-transform duration-200 group-open:rotate-180 shrink-0 ml-3" />
            </summary>
            <p className="mt-3 text-sm sm:text-base text-zinc-300 leading-relaxed font-sans">
              Virtual co-studying rooms where you can see real-time focus statuses of peers, track shared pomodoros, and maintain quiet accountability without video calls or social noise.
            </p>
          </details>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 9. FINAL CTA & PLAIN FOOTER                                   */}
      {/* ============================================================ */}
      <section id="download" className="pt-20 sm:pt-28 pb-12 sm:pb-16 px-4 sm:px-6 border-t border-white/[0.08] bg-[#070709]">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          <h2 className="font-hud font-bold text-4xl sm:text-6xl text-white tracking-tight leading-[1.05] text-balance">
            Turn every study hour into seasonal rank.
          </h2>
          <p className="mt-4 sm:mt-6 text-base sm:text-lg text-zinc-300 max-w-lg mx-auto leading-relaxed text-balance">
            No ads, no bloatware, no social noise. Just honest focus hours and true progression.
          </p>

          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[48px] w-full sm:w-auto px-8 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0A0A0B] font-hud font-bold text-base tracking-wider uppercase transition-all shadow-[0_0_24px_rgba(245,158,11,0.25)] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <span>Study on the web</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => startApkDownload()}
              className="min-h-[48px] w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.14] text-white text-sm font-semibold font-hud tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Download Android APK</span>
            </button>
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            By continuing, you agree to our{' '}
            <Link href="/privacy" className="underline hover:text-white transition-colors">
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline hover:text-white transition-colors">
              Terms of Service
            </Link>
            .
          </p>
        </div>

        {/* Plain Minimal Footer */}
        <footer className="mt-20 pt-8 border-t border-white/[0.06] max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <Logo className="w-4 h-4" />
            <span>&copy; {new Date().getFullYear()} study.io. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/privacy" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <a
              href="mailto:web.study.io@gmail.com"
              className="hover:text-white transition-colors"
            >
              Contact
            </a>
          </div>
        </footer>
        {/* Plain Minimal Footer */}
        <footer className="mt-20 pt-8 border-t border-white/[0.06] max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <Logo className="w-4 h-4" />
            <span>&copy; {new Date().getFullYear()} study.io. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/privacy" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <a
              href="mailto:web.study.io@gmail.com"
              className="hover:text-white transition-colors"
            >
              Contact
            </a>
          </div>
        </footer>
      </section>

      {/* ============================================================ */}
      {/* 10. MOBILE STICKY BOTTOM BAR (UNDER 768PX)                     */}
      {/* ============================================================ */}
      {scrolled && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0A0A0B]/95 backdrop-blur-md border-t border-white/[0.1] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2">
            <Logo className="w-6 h-6" />
            <span className="font-hud font-bold text-sm text-white">study.io</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startApkDownload()}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/[0.08] border border-white/[0.14] text-white text-xs font-hud font-semibold tracking-wider uppercase cursor-pointer"
            >
              Get App
            </button>
            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 text-[#0A0A0B] text-xs font-hud font-bold tracking-wider uppercase shadow-md cursor-pointer"
            >
              Start Free
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
