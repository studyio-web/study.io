'use client';

import React, { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Flame, Shield, Timer, ChevronDown } from 'lucide-react';
import { RankBadge } from '../common/RankBadge';

interface HeroSectionProps {
  onStartFree: () => void;
}

export function HeroSection({ onStartFree }: HeroSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const badgeCardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const isVisibleRef = useRef(true);

  // Check reduced motion
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      setIsReducedMotion(media.matches);
      const listener = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, []);

  // Intersection observer to pause particles when offscreen
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Subtle floating ember particles on canvas (< 30 particles for 60fps performance)
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) return; // Zero canvas particles on mobile for maximum battery and 60fps performance
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    const particles: Array<{
      x: number;
      y: number;
      size: number;
      vy: number;
      vx: number;
      alpha: number;
      fade: number;
    }> = [];

    for (let i = 0; i < 26; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 2 + 1,
        vy: -(Math.random() * 0.4 + 0.2),
        vx: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.6 + 0.2,
        fade: Math.random() * 0.005 + 0.002,
      });
    }

    const render = () => {
      if (isVisibleRef.current) {
        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.y += p.vy;
          p.x += p.vx;
          p.alpha -= p.fade;

          if (p.alpha <= 0.05 || p.y < -10) {
            p.x = Math.random() * width;
            p.y = height + 10;
            p.alpha = Math.random() * 0.6 + 0.2;
          }

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(245, 158, 11, ${p.alpha * 0.7})`;
          ctx.shadowBlur = 6;
          ctx.shadowColor = 'rgba(217, 119, 6, 0.6)';
          ctx.fill();
        }
      }
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [isReducedMotion]);

  // Subtle mouse parallax tilt (desktop only, max 8deg)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isReducedMotion || window.innerWidth < 1024) return;
    const card = badgeCardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const ry = ((x - centerX) / centerX) * 8;
    const rx = -((y - centerY) / centerY) * 8;
    setTilt({ rx, ry });
  };

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => {
    setIsHovering(false);
    setTilt({ rx: 0, ry: 0 });
  };

  const scrollToSection = (id: string) => {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      ref={containerRef}
      id="hero"
      className="relative min-h-[92vh] flex flex-col justify-center items-center px-4 sm:px-6 pt-24 pb-16 overflow-hidden text-center"
    >
      {/* Background Particle Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-70"
      />

      {/* Warm Forge Ambient Core Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] md:w-[720px] md:h-[720px] bg-[radial-gradient(circle,rgba(217,119,6,0.14)_0%,rgba(180,83,9,0.06)_40%,transparent_70%)] pointer-events-none -z-10" />

      {/* Pill: Authenticity indicator */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/[0.08] border border-amber-500/25 text-amber-300 text-xs font-mono uppercase tracking-wider mb-6 backdrop-blur-md shadow-[0_0_15px_rgba(245,158,11,0.15)] animate-fade-in">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
        <span>Season 24 Live • 23 Ranks to Conquer</span>
      </div>

      {/* Main Headline */}
      <h1 className="max-w-4xl text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-hud font-bold tracking-tight text-white leading-[1.08] drop-shadow-md">
        Forge Deeper Focus. <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500">
          Climb the Ranks.
        </span>
      </h1>

      {/* One-Line Subtext */}
      <p className="max-w-2xl mt-5 text-sm sm:text-base md:text-lg text-slate-300 font-sans font-normal leading-relaxed">
        A distraction-free timer engine, monthly competitive rank ladder, live
        collaborative study rooms, and true on-device app lockdown.
      </p>

      {/* Primary & Secondary CTAs */}
      <div className="flex flex-col sm:flex-row items-center gap-3.5 mt-8 z-10 w-full sm:w-auto">
        <Link
          href="/login"
          onClick={(e) => {
            if (onStartFree) {
              e.preventDefault();
              onStartFree();
            }
          }}
          className="w-full sm:w-auto min-h-[48px] px-8 py-3 rounded-2xl bg-white text-[#07090E] font-hud font-bold text-sm tracking-wide flex items-center justify-center gap-2.5 shadow-[0_0_25px_rgba(255,255,255,0.25)] hover:bg-slate-100 transition-all duration-150 active:scale-[0.98] cursor-pointer"
        >
          <span>Start studying free</span>
          <ArrowRight className="w-4 h-4 stroke-[2.5]" />
        </Link>

        <button
          type="button"
          onClick={() => scrollToSection('timer')}
          className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 hover:border-white/20 text-slate-200 font-sans font-medium text-sm transition-all duration-150 active:scale-[0.98] cursor-pointer"
        >
          See how it works
        </button>
      </div>

      {/* Hero Visual: The Hero Rank Badge in the Forge */}
      <div
        ref={badgeCardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative mt-12 mb-4 w-full max-w-[340px] sm:max-w-[420px] aspect-square flex items-center justify-center select-none"
        style={{
          perspective: '1000px',
        }}
      >
        <div
          className="relative w-full h-full flex flex-col items-center justify-center transition-transform duration-200 ease-out"
          style={{
            transform: isReducedMotion
              ? 'none'
              : `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${isHovering ? 1.03 : 1})`,
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Cracked Forge Ring Silhouette Behind Badge */}
          <div className="absolute inset-4 rounded-full border border-amber-500/20 bg-gradient-to-b from-amber-500/[0.08] to-transparent pointer-events-none shadow-[0_0_50px_rgba(217,119,6,0.2)]" />

          {/* Floating authentic Bronze I Crest Badge */}
          <div className="relative z-10 filter drop-shadow-[0_20px_35px_rgba(0,0,0,0.85)]">
            <RankBadge
              src="/images/ranks/bronze-1.webp"
              tier="bronze"
              division="I"
              size={220}
              interactive={false}
              priority={true}
              alt="Bronze I Forge Crest"
              className="transform transition-transform duration-300"
            />
          </div>

          {/* Forge Level Tag Floating Over Crest */}
          <div className="absolute bottom-4 px-4 py-1.5 rounded-xl bg-[#0D1017]/90 border border-amber-500/30 backdrop-blur-md shadow-xl flex items-center gap-2 z-20">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-hud font-bold tracking-wider text-amber-200 uppercase">
              The Forge • Rank Tier 1 of 23
            </span>
          </div>
        </div>
      </div>

      {/* Quick Specs Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 mt-8 max-w-3xl w-full text-slate-400 text-xs font-sans">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2 justify-center">
          <Timer className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Stopwatch • Countdown • Pomodoro</span>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2 justify-center">
          <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>100% On-Device Blocking</span>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2 justify-center">
          <Flame className="w-4 h-4 text-amber-400 shrink-0" />
          <span>23 Ranks & Monthly Reset</span>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2 justify-center">
          <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
          <span>8 Ambient Soundscapes</span>
        </div>
      </div>

      {/* Scroll Down Indicator */}
      <button
        type="button"
        onClick={() => scrollToSection('timer')}
        className="mt-12 text-slate-400 hover:text-white transition-colors flex flex-col items-center gap-1.5 text-xs font-mono uppercase tracking-wider cursor-pointer"
        aria-label="Scroll to Timer Engine"
      >
        <span>Explore features</span>
        <ChevronDown className="w-4 h-4 animate-bounce" />
      </button>
    </section>
  );
}
