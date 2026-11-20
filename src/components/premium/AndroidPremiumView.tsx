'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Crown,
  ChevronLeft,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Calendar,
  ShieldCheck,
  Flame,
  Check,
  Loader2,
  Clock,
  Layers,
  Palette,
  Volume2,
} from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { triggerHaptic, registerBackButtonHandler } from '../../lib/native-feel';
import { PAYMENTS_ENABLED } from '../../config/billing';
import { DEMO_PREMIUM_THEMES } from '../../app/premium/page';
import { ProAvatarRing } from '../ui/ProAvatarRing';
import { UserAvatar } from '../common/UserAvatar';
import { FlairCrown } from '../common/FlairBadge';

interface AndroidPremiumViewProps {
  isPremium: boolean;
  premiumUntil?: string | null;
  loading?: boolean;
  plans: any;
  isProcessing: boolean;
  startCheckout: (plan: 'monthly' | 'yearly') => void;
  userRank?: { tier: string; division?: string };
}

const PREMIUM_GOLD_GRADIENT =
  'linear-gradient(135deg, #F5E6A8 0%, #E6C15A 50%, #B8892B 100%)';

const DEMO_FOCUS_SCENES = [
  {
    id: 'forest',
    name: 'Moonlit Forest',
    tag: 'Emerald Mist',
    bg: 'linear-gradient(135deg, #030d14 0%, #0a2630 50%, #15494c 100%)',
    glow: 'rgba(16, 185, 129, 0.45)',
    accent: '#10B981',
  },
  {
    id: 'dusk',
    name: 'Dusk Peaks',
    tag: 'Sunset Glow',
    bg: 'linear-gradient(135deg, #171040 0%, #4a2372 40%, #b9487c 75%, #f58a69 100%)',
    glow: 'rgba(245, 138, 105, 0.45)',
    accent: '#f58a69',
  },
  {
    id: 'neon',
    name: 'Neon Skyline',
    tag: 'Cyber Rain',
    bg: 'linear-gradient(135deg, #06021a 0%, #1a0945 40%, #5a1a78 75%, #d1307f 100%)',
    glow: 'rgba(217, 70, 239, 0.45)',
    accent: '#d1307f',
  },
  {
    id: 'sakura',
    name: 'Sakura Night',
    tag: 'Cherry Blossom',
    bg: 'linear-gradient(135deg, #0d0a1a 0%, #2a1438 45%, #662249 75%, #cc5577 100%)',
    glow: 'rgba(244, 114, 182, 0.45)',
    accent: '#f472b6',
  },
  {
    id: 'campfire',
    name: 'Campfire Night',
    tag: 'Warm Embers',
    bg: 'linear-gradient(135deg, #0c1527 0%, #1b263b 40%, #5c2410 75%, #ff9800 100%)',
    glow: 'rgba(255, 152, 0, 0.45)',
    accent: '#ff9800',
  },
];

export function AndroidPremiumView({
  isPremium,
  premiumUntil,
  loading: premiumLoading,
  plans,
  isProcessing,
  startCheckout,
}: AndroidPremiumViewProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  // Selected state
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [activeThemeId, setActiveThemeId] = useState<string>('sakura');
  const [activeSceneId, setActiveSceneId] = useState<string>('forest');
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Auto-scroll refs for theme and scene horizontal chip rows
  const themeChipsRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Pricing formatting
  const monthlyFormatted = plans?.monthly?.formattedAmount || '₹499';
  const yearlyFormatted = plans?.yearly?.formattedAmount || '₹4,999';
  const monthlyAmount = plans?.monthly?.amount ? plans.monthly.amount / 100 : 499;
  const yearlyAmount = plans?.yearly?.amount ? plans.yearly.amount / 100 : 4999;
  const savingPercentage = Math.max(
    0,
    Math.round((1 - yearlyAmount / (monthlyAmount * 12)) * 100)
  );

  // Hardware Back Button integration for Android
  useEffect(() => {
    return registerBackButtonHandler(() => {
      triggerHaptic('light');
      router.push('/dashboard');
      return true;
    });
  }, [router]);

  // Handle Carousel Swipe Scroll & Pagination Indicator Sync
  const handleCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const cardWidth = el.offsetWidth * 0.84;
    const index = Math.round(el.scrollLeft / cardWidth);
    setCarouselIndex(Math.min(Math.max(index, 0), 4));
  }, []);

  // Handle Theme Selection with haptics & auto-scroll into view
  const handleThemeSelect = (themeId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic('selection');
    setActiveThemeId(themeId);
    e.currentTarget.scrollIntoView({
      behavior: shouldReduceMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  };

  // Handle Scene Selection with haptics & auto-scroll
  const handleSceneSelect = (sceneId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic('selection');
    setActiveSceneId(sceneId);
    e.currentTarget.scrollIntoView({
      behavior: shouldReduceMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  };

  // Primary CTA click handler
  const handleCtaClick = () => {
    triggerHaptic('medium');
    if (isPremium) {
      router.push('/dashboard');
    } else {
      startCheckout(selectedPlan);
    }
  };

  const currentTheme =
    DEMO_PREMIUM_THEMES.find((t) => t.id === activeThemeId) ||
    DEMO_PREMIUM_THEMES[2]; // Sakura default

  const currentScene =
    DEMO_FOCUS_SCENES.find((s) => s.id === activeSceneId) ||
    DEMO_FOCUS_SCENES[0]; // Moonlit forest default

  const formattedExpiry = premiumUntil
    ? new Date(premiumUntil).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="min-h-screen bg-[#070709] text-white selection:bg-[#E6C15A]/30 selection:text-[#F6EFD9] flex flex-col overflow-x-hidden relative">
      {/* ═════════════════════════════════════════════════════════════════════
          1. SLIM 48PX NATIVE ANDROID HEADER
          ═════════════════════════════════════════════════════════════════════ */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#070709]/95 backdrop-blur-md border-b border-white/[0.08] pt-[env(safe-area-inset-top,0px)]">
        <div className="h-12 px-2 flex items-center justify-between relative">
          {/* Back button with generous >=44px tap target */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              router.push('/dashboard');
            }}
            className="w-11 h-11 flex items-center justify-center rounded-full text-white/80 active:text-white active:bg-white/10 active:scale-95 transition-all cursor-pointer"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* Centered Title (Crown + Study.io Pro) */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none">
            <Crown className="w-4 h-4 text-[#E6C15A] fill-current" />
            <span className="font-hud font-bold text-sm tracking-wide text-white">
              Study.io <span className="text-[#E6C15A]">Pro</span>
            </span>
          </div>

          {/* Clean spacer balance */}
          <div className="w-11 h-11" aria-hidden="true" />
        </div>
      </header>

      {/* ═════════════════════════════════════════════════════════════════════
          MAIN SCROLLABLE CONTENT (Safe offset below 48px header + insets)
          ═════════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 w-full flex flex-col pt-[calc(48px+env(safe-area-inset-top,0px)+12px)] pb-36 overflow-x-hidden">
        {/* ═══════════════════════════════════════════════════════════════════
            2. COMPACT HERO SECTION
            ═══════════════════════════════════════════════════════════════════ */}
        <section className="relative px-5 pt-3 pb-5 flex flex-col items-center text-center">
          {/* Subtle warm radial gradient behind the hero */}
          <div
            className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 w-72 h-44 rounded-full blur-[80px] opacity-25"
            style={{ backgroundColor: '#E6C15A' }}
          />

          {/* Small gold crown with soft glow */}
          <div className="relative mb-3 flex items-center justify-center">
            <div className="absolute w-12 h-12 rounded-full bg-[#E6C15A]/20 blur-md animate-pulse" />
            <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-b from-[#E6C15A]/20 to-[#E6C15A]/5 border border-[#E6C15A]/30 flex items-center justify-center shadow-sm">
              <Crown className="w-5 h-5 text-[#E6C15A] fill-current" />
            </div>
          </div>

          {/* Headline (2 lines max) */}
          <h1 className="font-hud font-extrabold text-2xl tracking-tight text-white leading-tight">
            Study with an unfair advantage
          </h1>

          {/* One-line readable subtext */}
          <p className="mt-1.5 text-[14px] text-white/70 max-w-xs leading-normal">
            Handcrafted luxury themes, atmospheric scenes, and prestige recognition.
          </p>

          {/* Quiet price line using real data */}
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[12px] text-[#E6C15A] font-medium">
            <span>Plans start at {monthlyFormatted}/mo</span>
            <span className="text-white/30">•</span>
            <span className="text-white/60">Cancel anytime</span>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            3. FEATURE PREVIEWS: HORIZONTAL SNAP CAROUSEL
            ═══════════════════════════════════════════════════════════════════ */}
        <section className="w-full mt-2">
          <div className="px-5 mb-2.5 flex items-center justify-between">
            <span className="text-[12px] font-hud font-bold uppercase tracking-wider text-white/50">
              Interactive Previews
            </span>
            <span className="text-[11px] text-white/40">Swipe to explore</span>
          </div>

          {/* Snap-scrolling Carousel Container */}
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar gap-3 px-5 py-1 w-full"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {/* ── CARD 1: 7 LUXURY THEMES ── */}
            <div
              className="w-[84vw] max-w-[340px] shrink-0 snap-center rounded-2xl p-4 bg-white/[0.035] border border-white/[0.08] flex flex-col justify-between relative shadow-lg"
              style={{
                borderLeft: `2.5px solid ${currentTheme.accent}`,
              }}
            >
              {/* Header with Icon + PRO badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-[#E6C15A]" />
                  <span className="text-xs font-semibold text-white/80">Themes</span>
                </div>
                <span className="bg-[#E6C15A]/15 border border-[#E6C15A]/30 text-[#E6C15A] text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider">
                  PRO
                </span>
              </div>

              {/* Live Miniature: Timer Preview */}
              <div
                className="w-full rounded-xl border p-3 transition-all duration-500 shadow-inner"
                style={{
                  backgroundColor: currentTheme.bg,
                  borderColor: currentTheme.border,
                  boxShadow: `0 0 20px ${currentTheme.accent}15`,
                }}
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shadow-xs"
                      style={{ backgroundColor: currentTheme.accent }}
                    />
                    <span
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: currentTheme.accent }}
                    >
                      {currentTheme.name}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-white/50">25:00</span>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: currentTheme.progress,
                        backgroundColor: currentTheme.accent,
                      }}
                    />
                  </div>
                  <span
                    className="text-[10px] font-mono font-bold"
                    style={{ color: currentTheme.text }}
                  >
                    {currentTheme.progress}
                  </span>
                </div>
              </div>

              {/* Theme Chips: 36px tall, 10px dot, fade mask on right edge */}
              <div className="mt-3 relative w-full">
                <div
                  ref={themeChipsRef}
                  className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 w-full"
                  style={{
                    maskImage: 'linear-gradient(to right, black 82%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, black 82%, transparent 100%)',
                  }}
                >
                  {DEMO_PREMIUM_THEMES.map((theme) => {
                    const isSelected = activeThemeId === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={(e) => handleThemeSelect(theme.id, e)}
                        className={`h-9 px-3 rounded-full flex items-center gap-1.5 shrink-0 transition-all cursor-pointer text-xs font-medium ${
                          isSelected
                            ? 'border font-semibold scale-100 shadow-sm'
                            : 'bg-white/[0.04] text-white/50 border border-transparent'
                        }`}
                        style={{
                          backgroundColor: isSelected ? `${theme.accent}20` : undefined,
                          borderColor: isSelected ? theme.accent : 'transparent',
                          color: isSelected ? theme.accent : undefined,
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: theme.accent }}
                        />
                        <span className="text-[11px] uppercase tracking-wider">{theme.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title & One-line Description (Shown ONCE only) */}
              <div className="mt-3 text-left pt-2 border-t border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white">
                  7 Luxury Themes — {currentTheme.name}
                </h3>
                <p className="mt-0.5 text-xs text-white/60 line-clamp-1">
                  {currentTheme.desc}
                </p>
              </div>
            </div>

            {/* ── CARD 2: ANIMATED FOCUS SCENES ── */}
            <div
              className="w-[84vw] max-w-[340px] shrink-0 snap-center rounded-2xl p-4 bg-white/[0.035] border border-white/[0.08] flex flex-col justify-between relative shadow-lg"
              style={{
                borderLeft: `2.5px solid ${currentScene.accent}`,
              }}
            >
              {/* Header with Icon + PRO badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#E6C15A]" />
                  <span className="text-xs font-semibold text-white/80">Atmosphere</span>
                </div>
                <span className="bg-[#E6C15A]/15 border border-[#E6C15A]/30 text-[#E6C15A] text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider">
                  PRO
                </span>
              </div>

              {/* Live Miniature: Scene Preview */}
              <div
                className="w-full rounded-xl border p-3.5 transition-all duration-500 shadow-inner flex flex-col justify-between"
                style={{
                  background: currentScene.bg,
                  borderColor: 'rgba(255,255,255,0.15)',
                  boxShadow: `0 0 20px ${currentScene.glow}`,
                }}
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    {currentScene.name}
                  </span>
                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-black/40 text-white/80">
                    {currentScene.tag}
                  </span>
                </div>

                <div className="py-2.5 flex flex-col items-center justify-center">
                  <span className="font-hud text-2xl font-bold tracking-wider text-white">
                    25:00
                  </span>
                  <span className="text-[9px] uppercase tracking-widest text-white/70">
                    Deep Focus
                  </span>
                </div>
              </div>

              {/* Scene Chips Row: 36px tall, fade mask */}
              <div className="mt-3 relative w-full">
                <div
                  className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 w-full"
                  style={{
                    maskImage: 'linear-gradient(to right, black 82%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, black 82%, transparent 100%)',
                  }}
                >
                  {DEMO_FOCUS_SCENES.map((scene) => {
                    const isSelected = activeSceneId === scene.id;
                    return (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={(e) => handleSceneSelect(scene.id, e)}
                        className={`h-9 px-3 rounded-full flex items-center gap-1.5 shrink-0 transition-all cursor-pointer text-xs font-medium ${
                          isSelected
                            ? 'border font-semibold shadow-sm'
                            : 'bg-white/[0.04] text-white/50 border border-transparent'
                        }`}
                        style={{
                          backgroundColor: isSelected ? 'rgba(255,255,255,0.12)' : undefined,
                          borderColor: isSelected ? scene.accent : 'transparent',
                          color: isSelected ? scene.accent : undefined,
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: scene.accent }}
                        />
                        <span className="text-[11px] uppercase tracking-wider">{scene.name.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title & One-line Description */}
              <div className="mt-3 text-left pt-2 border-t border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white">
                  Animated focus scenes
                </h3>
                <p className="mt-0.5 text-xs text-white/60 line-clamp-1">
                  Living atmospheric environments for deep flow & serenity.
                </p>
              </div>
            </div>

            {/* ── CARD 3: PRO AVATARS & STUDY ROOM FLAIRS ── */}
            <div
              className="w-[84vw] max-w-[340px] shrink-0 snap-center rounded-2xl p-4 bg-white/[0.035] border border-white/[0.08] flex flex-col justify-between relative shadow-lg"
              style={{
                borderLeft: '2.5px solid #F59E0B',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-white/80">Social Flair</span>
                </div>
                <span className="bg-[#E6C15A]/15 border border-[#E6C15A]/30 text-[#E6C15A] text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider">
                  PRO
                </span>
              </div>

              <div className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3.5 flex items-center gap-3.5 shadow-inner">
                <ProAvatarRing isPro={true} isStudying={true} size="md" defaultBorder>
                  <UserAvatar
                    src="https://api.dicebear.com/9.x/micah/svg?seed=CyberScholar&backgroundColor=0d1117"
                    name="Cyber Scholar"
                    size={48}
                    className="pointer-events-none"
                  />
                </ProAvatarRing>
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="font-hud text-xs font-bold text-white truncate">
                      Cyber Scholar
                    </span>
                    <FlairCrown frame="gold" size={13} />
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                      VIP
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 font-mono text-[11px] text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                    <span>00:25:00 · Focusing</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-left pt-2 border-t border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white">
                  Pro avatars & room flairs
                </h3>
                <p className="mt-0.5 text-xs text-white/60 line-clamp-1">
                  Exclusive Cyber Visor avatar and pulsing focus rings in study rooms.
                </p>
              </div>
            </div>

            {/* ── CARD 4: HISTORICAL TIME TRAVEL ── */}
            <div
              className="w-[84vw] max-w-[340px] shrink-0 snap-center rounded-2xl p-4 bg-white/[0.035] border border-white/[0.08] flex flex-col justify-between relative shadow-lg"
              style={{
                borderLeft: '2.5px solid #3B82F6',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-semibold text-white/80">Time Travel</span>
                </div>
                <span className="bg-[#E6C15A]/15 border border-[#E6C15A]/30 text-[#E6C15A] text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider">
                  PRO
                </span>
              </div>

              <div className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 shadow-inner">
                <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06]">
                  <span className="text-xs font-bold text-[#E6C15A]">NOVEMBER 2026</span>
                  <span className="text-[10px] font-mono text-white/40">Archives</span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5 text-center font-mono text-[10px]">
                  {[4, 7, 14, 18, 21, 24, 28, 29].map((d) => (
                    <div
                      key={d}
                      className={`h-6 flex items-center justify-center rounded-md ${
                        d === 18
                          ? 'border border-[#E6C15A] bg-[#E6C15A] text-black font-bold'
                          : 'text-white/40 bg-white/[0.02]'
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 text-left pt-2 border-t border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white">
                  Historical time travel
                </h3>
                <p className="mt-0.5 text-xs text-white/60 line-clamp-1">
                  Browse every past day and month with full session records.
                </p>
              </div>
            </div>

            {/* ── CARD 5: WEEKLY REPORT CARD ── */}
            <div
              className="w-[84vw] max-w-[340px] shrink-0 snap-center rounded-2xl p-4 bg-white/[0.035] border border-white/[0.08] flex flex-col justify-between relative shadow-lg"
              style={{
                borderLeft: '2.5px solid #10B981',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-white/80">Weekly Analytics</span>
                </div>
                <span className="bg-[#E6C15A]/15 border border-[#E6C15A]/30 text-[#E6C15A] text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider">
                  PRO
                </span>
              </div>

              <div className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 shadow-inner">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-white/40">vs last week</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                    <TrendingUp className="w-3 h-3" />
                    +18%
                  </span>
                </div>
                <div className="flex h-12 items-end justify-between gap-1.5 px-1">
                  {[40, 65, 30, 85, 55, 95, 75].map((pct, idx) => (
                    <div
                      key={idx}
                      className="w-full rounded-t-xs bg-[#E6C15A]"
                      style={{ height: `${pct}%`, opacity: idx === 5 ? 1 : 0.7 }}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-3 text-left pt-2 border-t border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white">
                  Weekly report card
                </h3>
                <p className="mt-0.5 text-xs text-white/60 line-clamp-1">
                  Compare weekly study volume and subject focus balance.
                </p>
              </div>
            </div>
          </div>

          {/* Pagination Dots */}
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {[0, 1, 2, 3, 4].map((idx) => (
              <span
                key={idx}
                className={`transition-all duration-300 rounded-full ${
                  carouselIndex === idx
                    ? 'w-4 h-1.5 bg-[#E6C15A]'
                    : 'w-1.5 h-1.5 bg-white/20'
                }`}
              />
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            4. COMPACT 2-COLUMN GRID OF REMAINING PRO PERKS
            ═══════════════════════════════════════════════════════════════════ */}
        <section className="px-5 mt-7">
          <h2 className="text-xs font-hud font-bold uppercase tracking-wider text-white/50 mb-3 text-left">
            Included With Pro
          </h2>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Perk 1: Verified Badge */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3 flex flex-col gap-1.5 text-left shadow-xs">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#E6C15A]">
                <Crown className="w-3.5 h-3.5" />
              </div>
              <span className="text-[13px] font-semibold text-white">Verified Scholar</span>
              <p className="text-[11px] text-white/60 leading-snug">
                Distinctive gold verified crest badge on your profile.
              </p>
            </div>

            {/* Perk 2: Room Recognition */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3 flex flex-col gap-1.5 text-left shadow-xs">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Flame className="w-3.5 h-3.5" />
              </div>
              <span className="text-[13px] font-semibold text-white">Room Aura</span>
              <p className="text-[11px] text-white/60 leading-snug">
                Pulsing focus ring & VIP tag in live study rooms.
              </p>
            </div>

            {/* Perk 3: Full Archives */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3 flex flex-col gap-1.5 text-left shadow-xs">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <span className="text-[13px] font-semibold text-white">Full History</span>
              <p className="text-[11px] text-white/60 leading-snug">
                Access every past study session and calendar day.
              </p>
            </div>

            {/* Perk 4: Unlimited Limits */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3 flex flex-col gap-1.5 text-left shadow-xs">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="text-[13px] font-semibold text-white">All Themes</span>
              <p className="text-[11px] text-white/60 leading-snug">
                Unlock all 7 luxury themes and ambient scenes.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            5. PRICING SELECTOR TOGGLE (Free users) / STATUS (Pro users)
            ═══════════════════════════════════════════════════════════════════ */}
        <section className="px-5 mt-7">
          {premiumLoading ? (
            <div className="h-28 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
          ) : isPremium ? (
            <div className="rounded-2xl bg-[#E6C15A]/10 border border-[#E6C15A]/30 p-4 text-center">
              <div className="inline-flex items-center gap-1 text-[#E6C15A] font-bold text-sm">
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Study.io Pro is Active</span>
              </div>
              <p className="text-xs text-white/70 mt-1">
                {formattedExpiry ? `Valid until ${formattedExpiry}` : 'All Pro benefits are active.'}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-3.5 flex flex-col gap-2.5">
              <span className="text-xs font-hud font-bold uppercase tracking-wider text-white/60 text-left">
                Choose Plan
              </span>

              <div className="grid grid-cols-2 gap-2">
                {/* Monthly selector */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setSelectedPlan('monthly');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedPlan === 'monthly'
                      ? 'border-[#E6C15A] bg-[#E6C15A]/10 shadow-sm'
                      : 'border-white/[0.08] bg-white/[0.02] text-white/60'
                  }`}
                >
                  <span className="text-[11px] font-hud uppercase tracking-wider text-white/60">
                    Monthly
                  </span>
                  <div className="text-base font-bold text-white mt-0.5">
                    {monthlyFormatted}
                    <span className="text-[10px] font-normal text-white/50">/mo</span>
                  </div>
                  <span className="text-[10px] text-white/40 block mt-0.5">Cancel anytime</span>
                </button>

                {/* Yearly selector */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setSelectedPlan('yearly');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                    selectedPlan === 'yearly'
                      ? 'border-[#E6C15A] bg-[#E6C15A]/15 shadow-sm'
                      : 'border-white/[0.08] bg-white/[0.02] text-white/60'
                  }`}
                >
                  {savingPercentage > 0 && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-[#E6C15A] text-black">
                      Save {savingPercentage}%
                    </span>
                  )}
                  <span className="text-[11px] font-hud uppercase tracking-wider text-[#E6C15A] font-bold">
                    Yearly
                  </span>
                  <div className="text-base font-bold text-white mt-0.5">
                    {yearlyFormatted}
                    <span className="text-[10px] font-normal text-white/50">/yr</span>
                  </div>
                  <span className="text-[10px] text-white/40 block mt-0.5">Best value</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ═════════════════════════════════════════════════════════════════════
          6. STICKY BOTTOM PURCHASE CTA (Android Only)
          ═════════════════════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pt-3 pb-[max(env(safe-area-inset-bottom,0px)+12px,24px)] bg-[#070709]/95 backdrop-blur-xl border-t border-white/[0.08] shadow-[0_-12px_28px_rgba(0,0,0,0.7)]">
        {/* Soft top gradient overlay so content slides under softly */}
        <div className="pointer-events-none absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-[#070709] to-transparent" />

        <div className="max-w-md mx-auto flex flex-col items-center gap-1.5">
          {!isPremium && (
            <div className="text-[11px] font-mono text-white/60">
              {selectedPlan === 'yearly'
                ? `Start Pro · ${yearlyFormatted}/yr (${Math.round(yearlyAmount / 12)}/mo)`
                : `Start Pro · ${monthlyFormatted}/mo`}
            </div>
          )}

          <button
            type="button"
            onClick={handleCtaClick}
            disabled={isProcessing || (!isPremium && !PAYMENTS_ENABLED)}
            className="w-full h-[52px] rounded-2xl font-hud font-bold text-sm tracking-wider uppercase text-[#141006] shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all disabled:opacity-50 relative overflow-hidden"
            style={{
              background: PREMIUM_GOLD_GRADIENT,
              boxShadow: '0 4px 20px rgba(230,193,90,0.3)',
            }}
          >
            {/* Shimmer animation */}
            <div
              className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
              }}
            />

            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#141006]" />
            ) : isPremium ? (
              <>
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <Crown className="w-4 h-4 fill-current" />
                <span>Get Premium</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
