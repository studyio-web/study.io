'use client';

import React from 'react';
import Image from 'next/image';
import { Palette, Crown, Check } from 'lucide-react';
import { THEMES, ThemeOption } from '../../lib/themes';
import { ProCrown } from '../common/ProCrown';

interface ThemesSectionProps {
  activeThemeId: string;
  onThemeSelect: (theme: ThemeOption) => void;
}

const AVATAR_STRIP = [
  { name: 'Sage', src: '/images/avatars/scholars/sage1.webp?v=3' },
  { name: 'Cipher', src: '/images/avatars/scholars/cipher.webp?v=3' },
  { name: 'Aura', src: '/images/avatars/scholars/aura.webp?v=3' },
  { name: 'Raven', src: '/images/avatars/scholars/raven.webp?v=3' },
  { name: 'Atlas', src: '/images/avatars/scholars/atlas.webp?v=3' },
  { name: 'Zenith', src: '/images/avatars/scholars/zenith.webp?v=3' },
  { name: 'Orion', src: '/images/avatars/scholars/orion.webp?v=3' },
  { name: 'Lyra', src: '/images/avatars/scholars/lyra.webp?v=3' },
  { name: 'Alchemist', src: '/images/avatars/adventurers/alchemist.webp?v=3' },
  { name: 'Tactician', src: '/images/avatars/adventurers/tactician.webp?v=3' },
  { name: 'Oracle', src: '/images/avatars/adventurers/oracle.webp?v=3' },
  { name: 'Vanguard', src: '/images/avatars/adventurers/vanguard.webp?v=3' },
];

export function ThemesSection({ activeThemeId, onThemeSelect }: ThemesSectionProps) {
  return (
    <section id="themes" className="py-24 px-4 sm:px-6 max-w-6xl mx-auto relative">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-pink-500/[0.04] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/[0.08] border border-pink-500/20 text-pink-300 text-xs font-mono uppercase tracking-wider mb-3">
          <Palette className="w-3.5 h-3.5" />
          <span>Section 09 • Visual Craft & Expression</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-hud font-bold text-white tracking-tight">
          18 Themes. 30 In-App Avatars. <br />
          <span className="text-slate-400 font-sans font-semibold text-2xl sm:text-3xl">
            Click any swatch to re-theme this page live.
          </span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans leading-relaxed">
          From OLED Abyss and rank-reactive metallics to warm espresso and paper light mode. No external social avatars—all identities are forged within study.io.
        </p>
      </div>

      {/* 18 Theme Swatches Grid */}
      <div className="mb-14">
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
            All 18 Themes (11 Free • 7 Pro)
          </span>
          <span className="text-[11px] font-mono text-amber-400">
            Interactive Live Theme Switcher
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {THEMES.map((theme) => {
            const isSelected = activeThemeId === theme.id;
            const [bg, surface, accent] = theme.previewColors;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onThemeSelect(theme)}
                className={`p-3 rounded-2xl border transition-all text-left flex flex-col justify-between h-28 relative cursor-pointer group ${
                  isSelected
                    ? 'border-white ring-2 ring-white/30 shadow-xl scale-[1.03]'
                    : 'border-white/10 hover:border-white/20 hover:scale-[1.01]'
                }`}
                style={{ backgroundColor: bg }}
              >
                {/* Color preview capsules */}
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20"
                      style={{ backgroundColor: surface }}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full shadow-sm"
                      style={{ backgroundColor: accent }}
                    />
                  </div>

                  {theme.isPremium ? (
                    <ProCrown size={14} variant="gold" />
                  ) : isSelected ? (
                    <div className="w-4 h-4 rounded-full bg-white text-black flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  ) : null}
                </div>

                {/* Name & Scheme */}
                <div>
                  <span
                    className="text-xs font-hud font-bold block truncate"
                    style={{ color: theme.isLight ? '#1A1405' : '#FFFFFF' }}
                  >
                    {theme.name}
                  </span>
                  <span
                    className="text-[10px] font-mono block opacity-60 truncate mt-0.5"
                    style={{ color: theme.isLight ? '#475569' : '#94A3B8' }}
                  >
                    {theme.isPremium ? 'Pro Theme' : 'Free Theme'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Avatar Showcase Strip */}
      <div className="p-7 rounded-3xl bg-[#0F121C] border border-white/10 shadow-xl">
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-white/[0.08]">
          <div>
            <h3 className="text-base font-hud font-bold text-white tracking-wide">
              App-Native Avatar Vault
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              30 handcrafted portraits across Scholars, Adventurers, and Cybernetic Cognition
            </p>
          </div>
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-full">
            Zero External Tracking
          </span>
        </div>

        {/* Horizontal avatar strip */}
        <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-thin">
          {AVATAR_STRIP.map((av) => (
            <div
              key={av.name}
              className="flex flex-col items-center shrink-0 group"
            >
              <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-800 border-2 border-white/15 group-hover:border-amber-400 transition-colors shadow-md">
                <Image
                  src={av.src}
                  alt={av.name}
                  width={56}
                  height={56}
                  className="object-cover"
                />
              </div>
              <span className="text-[11px] font-mono text-slate-300 mt-1.5 group-hover:text-white transition-colors">
                {av.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
