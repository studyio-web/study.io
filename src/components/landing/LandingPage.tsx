'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '../Logo';
import { Download, ArrowRight, Menu, X, Sparkles } from 'lucide-react';
import { THEMES, ThemeOption } from '../../lib/themes';
import { startApkDownload, LATEST_APK_CDN_URL } from '../../lib/apkDownload';

// 14 Ordered Sections
import { HeroSection } from './HeroSection';
import { TimerEngineSection } from './TimerEngineSection';
import { StrictModeSection } from './StrictModeSection';
import { RanksSection } from './RanksSection';
import { LeaderboardSection } from './LeaderboardSection';
import { StreaksSection } from './StreaksSection';
import { RoomsSection } from './RoomsSection';
import { SoundscapesSection } from './SoundscapesSection';
import { TasksAnalyticsSection } from './TasksAnalyticsSection';
import { ThemesSection } from './ThemesSection';
import { WorksEverywhereSection } from './WorksEverywhereSection';
import { PrivacySection } from './PrivacySection';
import { ProSection } from './ProSection';
import { FooterSection } from './FooterSection';

interface LandingPageProps {
  onOpenAuth?: () => void;
}

export function LandingPage({ onOpenAuth }: LandingPageProps) {
  const router = useRouter();
  const [activeTheme, setActiveTheme] = useState<ThemeOption>(THEMES[0]);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showMobileBottomCta, setShowMobileBottomCta] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');

  // Track scroll position for sticky nav & sticky mobile bottom CTA
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setIsScrolled(scrollY > 50);
      setShowMobileBottomCta(scrollY > 550); // Shows after hero on mobile

      // Section spy
      const sections = ['hero', 'timer', 'strict', 'ranks', 'leaderboard', 'streaks', 'rooms', 'soundscapes', 'analytics', 'themes', 'platform', 'privacy', 'pro'];
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i]);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 200) {
            setActiveSection(sections[i]);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleStartFree = () => {
    if (onOpenAuth) {
      onOpenAuth();
    } else {
      router.push('/login');
    }
  };

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const navLinks = [
    { id: 'timer', label: 'Timer' },
    { id: 'strict', label: 'Strict Mode' },
    { id: 'ranks', label: 'Ranks' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'rooms', label: 'Rooms' },
    { id: 'soundscapes', label: 'Sounds' },
    { id: 'pro', label: 'Pro' },
  ];

  return (
    <div
      className="min-h-screen w-full relative transition-colors duration-500 font-sans selection:bg-amber-500/30 selection:text-amber-200 overflow-x-hidden"
      style={{
        backgroundColor: activeTheme.themeColor || '#07090E',
        color: activeTheme.isLight ? '#1A1405' : '#F1F5F9',
        ['--bg' as any]: activeTheme.themeColor || '#07090E',
        ['--surface' as any]: activeTheme.previewColors[1] || '#0D1017',
        ['--accent' as any]: activeTheme.previewColors[2] || '#D97706',
      }}
    >
      {/* Background Dot Grid */}
      <div className="fixed inset-0 pointer-events-none bg-dot-grid opacity-25 z-0" />

      {/* Sticky Top Minimal Navbar */}
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
          isScrolled
            ? 'bg-[#07090E]/85 backdrop-blur-xl border-b border-white/[0.08] shadow-lg py-3'
            : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          {/* Logo & Brand */}
          <Link
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-2.5 group cursor-pointer"
          >
            <Logo className="w-7 h-7 drop-shadow-sm transition-transform duration-200 group-hover:scale-105" />
            <span className="text-base sm:text-lg font-bold tracking-tight text-white font-sans">
              study.io
            </span>
          </Link>

          {/* Desktop Navigation Links with Active Spy */}
          <nav className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md">
            {navLinks.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  className={`px-3 py-1 rounded-full text-xs font-sans transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white/15 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right Header Actions */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              href="/login"
              className="px-3.5 py-1.5 text-xs text-slate-300 hover:text-white font-sans transition-colors"
            >
              Log in
            </Link>

            <Link
              href="/login"
              onClick={(e) => {
                if (onOpenAuth) {
                  e.preventDefault();
                  onOpenAuth();
                }
              }}
              className="px-4 py-2 rounded-xl bg-white text-[#07090E] font-hud font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-slate-100 transition-all cursor-pointer active:scale-95"
            >
              Start Free
            </Link>
          </div>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 hover:text-white cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Dropdown Nav Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-white/10 bg-[#07090E]/95 backdrop-blur-2xl px-6 py-5 animate-in slide-in-from-top-4 duration-200">
            <div className="flex flex-col space-y-3">
              {navLinks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  className="text-left text-sm font-semibold text-slate-300 hover:text-white py-1.5 cursor-pointer"
                >
                  {item.label}
                </button>
              ))}

              <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
                <Link
                  href="/login"
                  className="text-xs text-slate-300 hover:text-white font-sans"
                >
                  Log in
                </Link>
                <Link
                  href="/login"
                  onClick={(e) => {
                    if (onOpenAuth) {
                      e.preventDefault();
                      onOpenAuth();
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-white text-[#07090E] font-hud font-bold text-xs uppercase tracking-wider"
                >
                  Start Free
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 w-full">
        {/* 1. Hero */}
        <HeroSection onStartFree={handleStartFree} />

        {/* 2. Timer Engine */}
        <TimerEngineSection />

        {/* 3. Strict Mode */}
        <StrictModeSection />

        {/* 4. Ranks & Seasons */}
        <RanksSection />

        {/* 5. Leaderboard */}
        <LeaderboardSection />

        {/* 6. Streaks and XP */}
        <StreaksSection />

        {/* 7. Study Rooms */}
        <RoomsSection />

        {/* 8. Soundscapes */}
        <SoundscapesSection />

        {/* 9. Tasks & Analytics */}
        <TasksAnalyticsSection />

        {/* 10. Themes & Avatars */}
        <ThemesSection
          activeThemeId={activeTheme.id}
          onThemeSelect={(t) => setActiveTheme(t)}
        />

        {/* 11. Works Everywhere */}
        <WorksEverywhereSection />

        {/* 12. Privacy and Data Control */}
        <PrivacySection />

        {/* 13. Pro */}
        <ProSection onStartPro={handleStartFree} />

        {/* 14. Final CTA & Footer */}
        <FooterSection onStartFree={handleStartFree} />
      </main>

      {/* Sticky Bottom CTA for Mobile Web (< 768px, appears after hero) */}
      {showMobileBottomCta && (
        <aside
          aria-label="Mobile quick actions"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#07090C]/90 backdrop-blur-xl border-t border-white/[0.08] px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] animate-in slide-in-from-bottom duration-300"
        >
          <div className="flex items-center gap-2 max-w-sm mx-auto">
            <Link
              href="/login"
              onClick={(e) => {
                if (onOpenAuth) {
                  e.preventDefault();
                  onOpenAuth();
                }
              }}
              className="flex-1 h-12 rounded-xl bg-white text-[#07090E] font-hud font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md active:scale-95"
            >
              <span>Start Free</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
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
              className="h-12 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white font-sans text-xs flex items-center justify-center gap-1.5 active:scale-95"
              aria-label="Download Android APK"
            >
              <Download className="w-4 h-4" />
              <span>APK</span>
            </a>
          </div>
        </aside>
      )}
    </div>
  );
}
