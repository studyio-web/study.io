'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ShieldCheck,
  Lock,
  Check,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { triggerHaptic, registerBackButtonHandler, updateNativeStatusBar } from '../../lib/native-feel';
import { DEMO_PREMIUM_THEMES } from '../../lib/premiumThemes';
import { getSvgScene } from '../focus/scenes/svgScenes';
import { useAuth } from '../../context/AuthContext';
import { RankCrestBadge } from '../common/RankCrestBadge';
import { UserAvatar } from '../common/UserAvatar';
import { getRankTier } from '../../lib/ranks';

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

const PREMIUM_AVATARS = [
  { name: 'Astral Monk', file: 'astral-monk.png' },
  { name: 'Arcane Scholar', file: 'arcane-scholar.png' },
  { name: 'Alchemist', file: 'alchemist.png' },
  { name: 'Celestial Cartographer', file: 'celestial-cartographer.png' },
  { name: 'Clockwork Inventor', file: 'clockwork-inventor.png' },
  { name: 'Crystal Mage', file: 'crystal-mage.png' },
  { name: 'Cyber Librarian', file: 'cyber-librarian.png' },
  { name: 'Dragon Sage', file: 'dragon-sage.png' },
  { name: 'Moon Oracle', file: 'moon-oracle.png' },
  { name: 'Phoenix Archivist', file: 'phoenix-archivist.png' },
  { name: 'Samurai Scholar', file: 'samurai-scholar.png' },
  { name: 'Void Walker', file: 'void-walker.png' },
];

export interface DemoPremiumScene {
  id: string;
  name: string;
  accent: string;
  glow: string;
  border: string;
  desc: string;
}

export const DEMO_PREMIUM_SCENES: DemoPremiumScene[] = [
  {
    id: 'forest',
    name: 'Moonlit Forest',
    accent: '#10B981',
    glow: 'rgba(16, 185, 129, 0.45)',
    border: 'rgba(16, 185, 129, 0.35)',
    desc: 'Pines, mist, and fireflies under the moon',
  },
  {
    id: 'dusk',
    name: 'Dusk Peaks',
    accent: '#F58A69',
    glow: 'rgba(245, 138, 105, 0.45)',
    border: 'rgba(245, 138, 105, 0.35)',
    desc: 'Sunset mountain ridges with warm glowing sky',
  },
  {
    id: 'neon',
    name: 'Neon Skyline',
    accent: '#D946EF',
    glow: 'rgba(217, 70, 239, 0.45)',
    border: 'rgba(217, 70, 239, 0.35)',
    desc: 'Rainy city night with illuminated skyline',
  },
  {
    id: 'sakura',
    name: 'Sakura Night',
    accent: '#F472B6',
    glow: 'rgba(244, 114, 182, 0.45)',
    border: 'rgba(244, 114, 182, 0.35)',
    desc: 'Moonlit cherry blossoms drifting in the night breeze',
  },
  {
    id: 'campfire',
    name: 'Campfire Night',
    accent: '#FF9800',
    glow: 'rgba(255, 152, 0, 0.45)',
    border: 'rgba(255, 152, 0, 0.35)',
    desc: 'Warm glowing embers rising into the starry forest sky',
  },
];

export function AndroidPremiumView({
  isPremium,
  premiumUntil,
  loading: premiumLoading,
  plans,
  isProcessing,
  startCheckout,
  userRank,
}: AndroidPremiumViewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  // Scroll header transparency state
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Selected plan: 'monthly' | 'yearly' (default 'yearly')
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');

  // Selected theme in Themes miniature
  const [activeThemeId, setActiveThemeId] = useState<string>('sakura');
  const themeDotsRowRef = useRef<HTMLDivElement>(null);

  // Selected scene in Animated Focus Scenes miniature
  const [activeSceneId, setActiveSceneId] = useState<string>('forest');
  const sceneDotsRowRef = useRef<HTMLDivElement>(null);

  // Intersection observers to pause off-screen animations
  const sceneRef = useRef<HTMLDivElement>(null);
  const [isSceneVisible, setIsSceneVisible] = useState(true);
  const avatarsRef = useRef<HTMLDivElement>(null);
  const [isAvatarsVisible, setIsAvatarsVisible] = useState(false);

  // Real pricing from plans
  const monthlyFormatted = plans?.monthly?.formattedAmount || '₹99';
  const yearlyFormatted = plans?.yearly?.formattedAmount || '₹999';

  // Current rank of user
  const effectiveUserRankTier = useMemo(() => {
    if (userRank?.tier) return userRank.tier;
    if (user?.seasonRp) return getRankTier(user.seasonRp).tier;
    return 'Silver';
  }, [userRank, user?.seasonRp]);

  const effectiveUserDivision = useMemo(() => {
    if (userRank?.division) return userRank.division;
    if (user?.seasonRp) return getRankTier(user.seasonRp).division;
    return 'I';
  }, [userRank, user?.seasonRp]);

  // Hardware back button and status bar styling
  useEffect(() => {
    updateNativeStatusBar('#0A0A0B', true);
    return registerBackButtonHandler(() => {
      triggerHaptic('light');
      router.back();
      return true;
    });
  }, [router]);

  // Track scroll position for header blur
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      setIsScrolled(scrollY > 24);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Intersection observer for scene and avatars animation pause
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === sceneRef.current) {
            setIsSceneVisible(entry.isIntersecting);
          } else if (entry.target === avatarsRef.current) {
            setIsAvatarsVisible(entry.isIntersecting);
          }
        });
      },
      { threshold: 0.1 }
    );

    if (sceneRef.current) observer.observe(sceneRef.current);
    if (avatarsRef.current) observer.observe(avatarsRef.current);

    return () => observer.disconnect();
  }, []);

  // Handle Theme Selection with haptic feedback & auto-scroll into view
  const handleSelectTheme = (themeId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic('selection');
    setActiveThemeId(themeId);
    e.currentTarget.scrollIntoView({
      behavior: shouldReduceMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  };

  // Handle Scene Selection with haptic feedback & auto-scroll into view
  const handleSelectScene = (sceneId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic('selection');
    setActiveSceneId(sceneId);
    e.currentTarget.scrollIntoView({
      behavior: shouldReduceMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  };

  // Primary CTA click
  const handleCtaClick = () => {
    triggerHaptic('medium');
    if (isPremium) {
      router.push('/dashboard');
    } else {
      startCheckout(selectedPlan);
    }
  };

  const currentTheme = useMemo(() => {
    return (
      DEMO_PREMIUM_THEMES.find((t) => t.id === activeThemeId) ||
      DEMO_PREMIUM_THEMES[2] // Sakura fallback
    );
  }, [activeThemeId]);

  const currentScene = useMemo(() => {
    return (
      DEMO_PREMIUM_SCENES.find((s) => s.id === activeSceneId) ||
      DEMO_PREMIUM_SCENES[0] // Forest fallback
    );
  }, [activeSceneId]);

  return (
    <div
      ref={scrollContainerRef}
      className="min-h-screen bg-[#0A0A0B] text-white selection:bg-[#E6C15A]/30 selection:text-[#F6EFD9] flex flex-col overflow-x-hidden relative"
      style={{
        paddingLeft: 'max(1.25rem, env(safe-area-inset-left, 1.25rem))',
        paddingRight: 'max(1.25rem, env(safe-area-inset-right, 1.25rem))',
      }}
    >
      <style>{`
        @keyframes heroFloatTrio {
          0%, 100% { transform: translateY(-6px); }
          50% { transform: translateY(6px); }
        }
        @keyframes heroShineSweep {
          0%, 80% { transform: translateX(-150%) rotate(25deg); opacity: 0; }
          90% { opacity: 0.35; }
          100% { transform: translateX(250%) rotate(25deg); opacity: 0; }
        }
        @keyframes avatarsDriftMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes ctaInitialShimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(200%); }
        }
        @keyframes sceneFireflyFloat1 {
          0%, 100% { transform: translate(0, 0) scale(0.9); opacity: 0.3; }
          50% { transform: translate(6px, -12px) scale(1.2); opacity: 0.85; }
        }
        @keyframes sceneFireflyFloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
          50% { transform: translate(-8px, -14px) scale(1.3); opacity: 0.9; }
        }
        .hero-float-animation {
          animation: ${shouldReduceMotion ? 'none' : 'heroFloatTrio 6s ease-in-out infinite'};
        }
        .hero-shine-animation {
          animation: ${shouldReduceMotion ? 'none' : 'heroShineSweep 6s ease-in-out infinite'};
        }
        .avatars-marquee {
          animation: ${shouldReduceMotion ? 'none' : 'avatarsDriftMarquee 26s linear infinite'};
        }
        .cta-shimmer-sweep {
          animation: ${shouldReduceMotion ? 'none' : 'ctaInitialShimmer 2.4s ease-out 0.6s 1'};
        }
        .firefly-1 {
          animation: ${shouldReduceMotion ? 'none' : 'sceneFireflyFloat1 4.5s ease-in-out infinite'};
        }
        .firefly-2 {
          animation: ${shouldReduceMotion ? 'none' : 'sceneFireflyFloat2 5.5s ease-in-out infinite 1.2s'};
        }
      `}</style>

      {/* ═════════════════════════════════════════════════════════════════════
          2. HEADER: Transparent 48px Header -> Blurred dark bar on scroll
          ═════════════════════════════════════════════════════════════════════ */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 h-12 transition-all duration-200 flex items-center px-2 pt-[env(safe-area-inset-top,0px)] ${
          isScrolled
            ? 'bg-[#0A0A0B]/90 backdrop-blur-md border-b border-white/[0.06]'
            : 'bg-transparent'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            router.back();
          }}
          className="w-12 h-12 flex items-center justify-center rounded-full text-white/80 active:text-white active:bg-white/10 active:scale-95 transition-all cursor-pointer"
          aria-label="Back"
        >
          <ChevronLeft className="w-6 h-6 stroke-[2.25]" />
        </button>
      </header>

      {/* Ambient Warm Gold Radial Glow behind the hero */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(480px,100vw)] h-[480px] pointer-events-none -z-10 overflow-hidden">
        <div
          className="w-full h-full rounded-full blur-[100px]"
          style={{
            background:
              'radial-gradient(circle at 50% 35%, rgba(232, 196, 106, 0.20) 0%, rgba(201, 160, 74, 0.08) 45%, transparent 70%)',
          }}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto pt-16 pb-36 flex flex-col">
        {/* ═════════════════════════════════════════════════════════════════════
            3. HERO: The Signature Moment
            ═════════════════════════════════════════════════════════════════════ */}
        <section className="flex flex-col items-center text-center pt-4 pb-6">
          {/* Trio Showpiece: ~300px Tall Container */}
          <div className="relative w-full h-[260px] sm:h-[280px] flex items-center justify-center select-none">
            {/* Subtle central glow halo */}
            <div className="absolute w-44 h-44 rounded-full bg-[#E6C15A]/20 blur-[50px] pointer-events-none" />

            {/* Overlapping Trio Wrapper with slow 6s float animation */}
            <div className="hero-float-animation relative w-[260px] h-[200px] flex items-center justify-center">
              {/* Left: Premium Avatar */}
              <div
                className="absolute left-1 bottom-4 w-20 h-20 rounded-full border border-[#E6C15A]/40 overflow-hidden shadow-xl bg-[#141822] z-10 transition-transform"
                style={{
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6), 0 0 16px rgba(230,193,90,0.2)',
                }}
              >
                <img
                  src="/images/avatars/premium/astral-monk.png"
                  alt="Premium Avatar"
                  className="w-full h-full object-cover"
                  loading="eager"
                />
              </div>

              {/* Right: Half-faded Grandmaster / Diamond crest (Behind & Above) */}
              <div
                className="absolute -right-2 top-0 w-24 h-24 opacity-45 pointer-events-none z-10 scale-95"
                style={{
                  filter: 'drop-shadow(0 0 20px rgba(230,193,90,0.3))',
                }}
              >
                <img
                  src="/images/ranks/grandmaster.png"
                  alt="Grandmaster Prestige"
                  className="w-full h-full object-contain"
                  loading="eager"
                />
              </div>

              {/* Center: User's CURRENT Rank Badge (Prominent in front) */}
              <div
                className="relative z-20 w-36 h-36 flex items-center justify-center"
                style={{
                  filter: 'drop-shadow(0 14px 28px rgba(0,0,0,0.85)) drop-shadow(0 0 25px rgba(230,193,90,0.35))',
                }}
              >
                <RankCrestBadge
                  tier={effectiveUserRankTier}
                  division={effectiveUserDivision}
                  size={136}
                  priority
                />

                {/* Faint shine sweep over central crest */}
                <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                  <div
                    className="hero-shine-animation absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Headline */}
          <h1 className="font-hud text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2 leading-[1.15]">
            Study like it matters.
          </h1>

          {/* Subtext */}
          <p className="text-base text-white/70 max-w-sm mb-3.5 leading-relaxed">
            Handcrafted luxury themes, atmospheric scenes, and prestige recognition.
          </p>

          {/* Facts line: Plain text with dot separators, NO chips and NO boxes */}
          <div className="text-[11px] sm:text-xs font-mono text-zinc-400 select-none whitespace-nowrap">
            7 themes <span className="text-[#E6C15A] mx-1.5">·</span> Animated scenes <span className="text-[#E6C15A] mx-1.5">·</span> Full history
          </div>
        </section>

        {/* ═════════════════════════════════════════════════════════════════════
            4. FEATURE SHOWCASE: Full-width Borderless Story (1px 8% dividers)
            ═════════════════════════════════════════════════════════════════════ */}

        {/* ─── FEATURE 1: 7 LUXURY THEMES ─── */}
        <div className="border-t border-white/[0.08] my-7" />

        <section className="flex flex-col gap-3.5">
          {/* Big Visual on top: Live Mini Timer Dial */}
          <div
            className="w-full h-52 rounded-2xl overflow-hidden relative flex flex-col justify-between p-5 transition-colors duration-300"
            style={{
              backgroundColor: currentTheme.bg,
              border: `1px solid ${currentTheme.border}`,
            }}
          >
            {/* PRO Badge in Corner */}
            <div className="absolute top-3.5 right-3.5 px-2.5 py-0.5 rounded-full bg-[#E6C15A]/15 border border-[#E6C15A]/35 text-[10px] font-mono font-bold text-[#E6C15A]">
              PRO
            </div>

            {/* Theme Header info */}
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                style={{ backgroundColor: currentTheme.accent }}
              />
              <span className="text-xs font-mono uppercase tracking-wider font-semibold text-white/90">
                {currentTheme.name}
              </span>
            </div>

            {/* Live Center Timer Display in Theme Palettes */}
            <div className="my-auto flex flex-col items-center justify-center text-center">
              <div
                className="text-4xl font-mono tabular-nums font-bold tracking-tight mb-2 leading-none"
                style={{ color: currentTheme.text }}
              >
                25:00
              </div>
              {/* Mini themed progress bar */}
              <div className="w-48 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: currentTheme.progress,
                    backgroundColor: currentTheme.accent,
                    boxShadow: `0 0 10px ${currentTheme.accent}`,
                  }}
                />
              </div>
            </div>

            {/* Subtle theme subcaption */}
            <div className="text-[11px] font-mono text-white/50 truncate">
              {currentTheme.desc}
            </div>
          </div>

          {/* Horizontally scrollable single row of 28px colored dots with right-edge fade */}
          <div className="relative w-full">
            <div
              ref={themeDotsRowRef}
              className="flex items-center gap-3 overflow-x-auto py-1.5 px-1 no-scrollbar scroll-smooth"
              style={{
                maskImage: 'linear-gradient(to right, black 86%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to right, black 86%, transparent 100%)',
              }}
            >
              {DEMO_PREMIUM_THEMES.map((theme) => {
                const isSelected = theme.id === activeThemeId;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={(e) => handleSelectTheme(theme.id, e)}
                    className="relative shrink-0 flex items-center justify-center p-1 rounded-full transition-transform active:scale-90 cursor-pointer"
                    aria-label={`Select ${theme.name} theme`}
                  >
                    <span
                      className={`w-7 h-7 rounded-full shrink-0 transition-all ${
                        isSelected
                          ? 'ring-2 ring-[#E6C15A] ring-offset-2 ring-offset-[#0A0A0B] scale-110'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: theme.accent,
                        boxShadow: isSelected ? `0 0 12px ${theme.accent}` : 'none',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title & Description */}
          <div>
            <h2 className="font-hud text-xl font-bold text-white mb-1">
              7 Luxury Themes
            </h2>
            <p className="text-[15px] text-white/70 leading-relaxed">
              Crafted visual palettes designed for calm, immersive focus.
            </p>
          </div>
        </section>

        {/* ─── FEATURE 2: ANIMATED FOCUS SCENES ─── */}
        <div className="border-t border-white/[0.08] my-7" />

        <section className="flex flex-col gap-3.5">
          {/* Big Visual: Animated Scene Preview */}
          <div
            ref={sceneRef}
            className={`w-full h-48 rounded-2xl overflow-hidden relative flex flex-col justify-between p-5 border select-none transition-all duration-300 ${
              !isSceneVisible || shouldReduceMotion ? 'scene-hidden' : ''
            }`}
            style={{
              backgroundColor: '#030712',
              borderColor: currentScene.border,
              boxShadow: `0 0 24px ${currentScene.glow}`,
            }}
          >
            {/* Background SVG Scene Renderer */}
            <div
              key={currentScene.id}
              className="absolute inset-0 pointer-events-none select-none [&_svg]:w-full [&_svg]:h-full [&_svg]:object-cover"
              dangerouslySetInnerHTML={{ __html: getSvgScene(currentScene.id) }}
            />

            {/* Dark vignette overlay for crisp legibility of headers and captions */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/85 via-black/10 to-black/50" />

            {/* PRO Badge in Corner */}
            <div className="absolute top-3.5 right-3.5 px-2.5 py-0.5 rounded-full bg-[#E6C15A]/15 border border-[#E6C15A]/35 text-[10px] font-mono font-bold text-[#E6C15A] z-20">
              PRO
            </div>

            {/* Scene Header */}
            <div className="relative z-10 flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm transition-colors duration-300"
                style={{
                  backgroundColor: currentScene.accent,
                  boxShadow: `0 0 8px ${currentScene.accent}`,
                }}
              />
              <span className="text-xs font-mono uppercase tracking-wider font-semibold text-white/95">
                {currentScene.name}
              </span>
            </div>

            {/* Scene Status caption */}
            <div className="relative z-10 text-[11px] font-mono text-white/70">
              {currentScene.desc}
            </div>
          </div>

          {/* Horizontally scrollable single row of 28px colored dots with right-edge fade */}
          <div className="relative w-full">
            <div
              ref={sceneDotsRowRef}
              className="flex items-center gap-3 overflow-x-auto py-1.5 px-1 no-scrollbar scroll-smooth"
              style={{
                maskImage: 'linear-gradient(to right, black 86%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to right, black 86%, transparent 100%)',
              }}
            >
              {DEMO_PREMIUM_SCENES.map((scene) => {
                const isSelected = scene.id === activeSceneId;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={(e) => handleSelectScene(scene.id, e)}
                    className="relative shrink-0 flex items-center justify-center p-1 rounded-full transition-transform active:scale-90 cursor-pointer"
                    aria-label={`Select ${scene.name} scene`}
                  >
                    <span
                      className={`w-7 h-7 rounded-full shrink-0 transition-all ${
                        isSelected
                          ? 'ring-2 ring-[#E6C15A] ring-offset-2 ring-offset-[#0A0A0B] scale-110'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: scene.accent,
                        boxShadow: isSelected ? `0 0 12px ${scene.accent}` : 'none',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title & Description */}
          <div>
            <h2 className="font-hud text-xl font-bold text-white mb-1">
              Animated Focus Scenes
            </h2>
            <p className="text-[15px] text-white/70 leading-relaxed">
              Living visual environments that react subtly with gentle acoustic ambience.
            </p>
          </div>
        </section>

        {/* ─── FEATURE 3: 12 ELITE AVATARS ─── */}
        <div className="border-t border-white/[0.08] my-7" />

        <section className="flex flex-col gap-3.5">
          {/* Big Visual: Slowly drifting horizontal marquee strip */}
          <div
            ref={avatarsRef}
            className="w-full h-28 rounded-2xl overflow-hidden relative bg-[#0E1118]/80 border border-white/[0.08] flex items-center p-2"
            style={{
              maskImage: 'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
            }}
          >
            {/* PRO Badge in Corner */}
            <div className="absolute top-2.5 right-3 px-2 py-0.5 rounded-full bg-[#E6C15A]/15 border border-[#E6C15A]/35 text-[9px] font-mono font-bold text-[#E6C15A] z-20">
              PRO
            </div>

            {/* Drifting Avatar Track */}
            <div
              className={`flex items-center gap-3 shrink-0 ${
                isAvatarsVisible ? 'avatars-marquee' : ''
              }`}
            >
              {[...PREMIUM_AVATARS, ...PREMIUM_AVATARS].map((avatar, idx) => (
                <div
                  key={`${avatar.file}-${idx}`}
                  className="w-14 h-14 rounded-full border border-[#E6C15A]/30 overflow-hidden shrink-0 bg-[#161B26] shadow-md"
                >
                  <img
                    src={`/images/avatars/premium/${avatar.file}`}
                    alt={avatar.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Title & Description */}
          <div>
            <h2 className="font-hud text-xl font-bold text-white mb-1">
              12 Elite Avatars
            </h2>
            <p className="text-[15px] text-white/70 leading-relaxed">
              Distinctive illustrated personas to represent your rank and presence.
            </p>
          </div>
        </section>

        {/* ─── FEATURE 4: VERIFIED SCHOLAR ─── */}
        <div className="border-t border-white/[0.08] my-7" />

        <section className="flex flex-col gap-3.5">
          {/* Big Visual: User's avatar with & without gold verified crest */}
          <div className="w-full h-36 rounded-2xl overflow-hidden relative bg-[#0E1118]/80 border border-white/[0.08] flex items-center justify-around px-6">
            {/* PRO Badge in Corner */}
            <div className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full bg-[#E6C15A]/15 border border-[#E6C15A]/35 text-[10px] font-mono font-bold text-[#E6C15A]">
              PRO
            </div>

            {/* Standard Profile Preview */}
            <div className="flex flex-col items-center gap-1.5 opacity-60">
              <div className="w-14 h-14 rounded-full border border-white/10 overflow-hidden bg-black/40 flex items-center justify-center">
                <UserAvatar src={user?.avatarUrl} name={user?.name || 'Scholar'} size={56} />
              </div>
              <span className="text-[11px] font-mono text-zinc-400">Standard</span>
            </div>

            {/* Divider */}
            <span className="text-white/20 font-mono text-sm">→</span>

            {/* Verified Scholar Preview */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative w-14 h-14 rounded-full ring-2 ring-[#E6C15A] ring-offset-2 ring-offset-[#0A0A0B] overflow-hidden bg-black shadow-[0_0_18px_rgba(230,193,90,0.35)] flex items-center justify-center">
                <UserAvatar src={user?.avatarUrl} name={user?.name || 'Scholar'} size={56} />
                <div className="absolute bottom-0 right-0 p-0.5 bg-[#E6C15A] rounded-full text-black">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              </div>
              <span className="text-[11px] font-mono text-[#E6C15A] font-semibold">
                Verified Scholar
              </span>
            </div>
          </div>

          {/* Title & Description */}
          <div>
            <h2 className="font-hud text-xl font-bold text-white mb-1">
              Verified Scholar Recognition
            </h2>
            <p className="text-[15px] text-white/70 leading-relaxed">
              Stand out with a distinctive gold crest and verified badge across all study rooms.
            </p>
          </div>
        </section>

        {/* ─── FEATURE 5: ROOM AURA ─── */}
        <div className="border-t border-white/[0.08] my-7" />

        <section className="flex flex-col gap-3.5">
          {/* Big Visual: Mini Study Room Tile with Focus Ring & VIP tag */}
          <div className="w-full h-36 rounded-2xl overflow-hidden relative bg-[#0E1118]/80 border border-white/[0.08] flex items-center px-5">
            {/* PRO Badge in Corner */}
            <div className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full bg-[#E6C15A]/15 border border-[#E6C15A]/35 text-[10px] font-mono font-bold text-[#E6C15A]">
              PRO
            </div>

            {/* Scholar Tile */}
            <div className="flex items-center gap-3.5 w-full">
              {/* Pulsing Aura Avatar */}
              <div className="relative w-14 h-14 rounded-full shrink-0 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-[#E6C15A] animate-ping opacity-35" />
                <div className="relative w-13 h-13 rounded-full border-2 border-[#E6C15A] shadow-[0_0_20px_rgba(230,193,90,0.45)] overflow-hidden bg-black flex items-center justify-center">
                  <UserAvatar src={user?.avatarUrl} name={user?.name || 'You'} size={52} />
                </div>
              </div>

              {/* Scholar Details */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">
                    {user?.name || 'Scholar'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-[#E6C15A]/20 border border-[#E6C15A]/40 text-[9px] font-mono font-bold text-[#E6C15A]">
                    VIP
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Focusing · 45m</span>
                </div>
              </div>
            </div>
          </div>

          {/* Title & Description */}
          <div>
            <h2 className="font-hud text-xl font-bold text-white mb-1">
              Exclusive Room Aura
            </h2>
            <p className="text-[15px] text-white/70 leading-relaxed">
              Pulsing golden aura rings and VIP recognition whenever you join a study room.
            </p>
          </div>
        </section>

        {/* ─── FEATURE 6: FULL STUDY HISTORY ─── */}
        <div className="border-t border-white/[0.08] my-7" />

        <section className="flex flex-col gap-3.5">
          {/* Big Visual: Compact calendar strip with highlighted days */}
          <div className="w-full h-36 rounded-2xl overflow-hidden relative bg-[#0E1118]/80 border border-white/[0.08] flex flex-col justify-between p-4">
            {/* PRO Badge in Corner */}
            <div className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full bg-[#E6C15A]/15 border border-[#E6C15A]/35 text-[10px] font-mono font-bold text-[#E6C15A]">
              PRO
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-[#E6C15A]" />
              <span className="text-xs font-mono font-semibold text-white/90">
                Full Calendar Log
              </span>
            </div>

            {/* Calendar Mini Heatmap Row */}
            <div className="flex items-center justify-between gap-1 py-1">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
                const isGold = i === 2 || i === 4;
                const isEmerald = i === 0 || i === 1 || i === 3;
                return (
                  <div key={`${day}-${i}`} className="flex flex-col items-center gap-1.5">
                    <span className="text-[10px] font-mono text-zinc-400">{day}</span>
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                        isGold
                          ? 'bg-[#E6C15A] text-black shadow-[0_0_10px_rgba(230,193,90,0.4)]'
                          : isEmerald
                          ? 'bg-emerald-500/25 border border-emerald-500/40 text-emerald-300'
                          : 'bg-white/5 text-white/40'
                      }`}
                    >
                      {i + 14}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-[10px] font-mono text-zinc-400">
              Complete historical session logs &amp; performance trends
            </div>
          </div>

          {/* Title & Description */}
          <div>
            <h2 className="font-hud text-xl font-bold text-white mb-1">
              Full Study History
            </h2>
            <p className="text-[15px] text-white/70 leading-relaxed">
              Access every past study session, calendar day, and lifetime milestone.
            </p>
          </div>
        </section>

        {/* ═════════════════════════════════════════════════════════════════════
            5. PLANS (Box 1 of 2 Allowed Cards)
            ═════════════════════════════════════════════════════════════════════ */}
        <div className="border-t border-white/[0.08] my-7" />

        <section className="rounded-2xl bg-[#12151E] border border-white/10 p-5 flex flex-col gap-4 shadow-xl">
          {/* Full-width Segmented Toggle with Sliding Gold Highlight */}
          <div className="relative w-full h-12 rounded-xl bg-black/50 p-1 flex items-center select-none">
            {/* Sliding Gold Indicator */}
            <div
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-transform duration-250 ease-out"
              style={{
                background: PREMIUM_GOLD_GRADIENT,
                transform:
                  selectedPlan === 'yearly'
                    ? 'translateX(calc(100% + 4px))'
                    : 'translateX(0px)',
              }}
            />

            {/* Monthly Option */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setSelectedPlan('monthly');
              }}
              className={`relative z-10 flex-1 h-full rounded-lg font-mono text-xs font-bold transition-colors flex items-center justify-center cursor-pointer ${
                selectedPlan === 'monthly' ? 'text-[#141005]' : 'text-white/60 hover:text-white'
              }`}
            >
              Monthly
            </button>

            {/* Yearly Option */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setSelectedPlan('yearly');
              }}
              className={`relative z-10 flex-1 h-full rounded-lg font-mono text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                selectedPlan === 'yearly' ? 'text-[#141005]' : 'text-white/60 hover:text-white'
              }`}
            >
              <span>Yearly</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  selectedPlan === 'yearly'
                    ? 'bg-black/20 text-[#141005]'
                    : 'bg-[#E6C15A]/20 text-[#E6C15A]'
                }`}
              >
                Save 16%
              </span>
            </button>
          </div>

          {/* Dynamic Price Display */}
          <div className="flex flex-col items-center text-center gap-1 pt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-4xl font-extrabold text-white tracking-tight">
                {selectedPlan === 'yearly' ? yearlyFormatted : monthlyFormatted}
              </span>
              <span className="text-sm font-mono text-white/60">
                {selectedPlan === 'yearly' ? '/year' : '/month'}
              </span>
            </div>

            {/* Subline note */}
            {selectedPlan === 'yearly' ? (
              <div className="text-xs font-mono text-[#E6C15A] font-medium">
                ₹83/mo billed yearly <span className="text-white/30">·</span> Best value
              </div>
            ) : (
              <div className="text-xs font-mono text-zinc-400">
                Billed monthly <span className="text-white/30">·</span> Cancel anytime
              </div>
            )}
          </div>
        </section>

        {/* ═════════════════════════════════════════════════════════════════════
            6. TRUST LINE
            ═════════════════════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-center gap-1.5 text-xs font-mono text-zinc-400 text-center mt-5 mb-2 select-none">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>Cancel anytime · Secure checkout via Razorpay</span>
        </div>
      </main>

      {/* ═════════════════════════════════════════════════════════════════════
          7. STICKY CTA BAR (Card 2 of 2 Allowed Cards)
          ═════════════════════════════════════════════════════════════════════ */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#0A0A0B] via-[#0A0A0B]/95 to-transparent pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))] px-5"
      >
        <button
          type="button"
          onClick={handleCtaClick}
          disabled={isProcessing}
          className="relative w-full max-w-md mx-auto h-[54px] rounded-2xl font-mono font-bold text-base text-[#141005] shadow-xl flex items-center justify-center overflow-hidden active:scale-[0.98] transition-transform cursor-pointer disabled:opacity-50"
          style={{ background: PREMIUM_GOLD_GRADIENT }}
        >
          {/* Initial Slow Shimmer */}
          <div className="cta-shimmer-sweep absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none" />

          {/* Button Text without any icons */}
          <span className="relative z-10">
            {isPremium
              ? 'Active Scholar · Manage Plan'
              : `Start Pro · ${selectedPlan === 'yearly' ? yearlyFormatted : monthlyFormatted}`}
          </span>
        </button>
      </div>
    </div>
  );
}
