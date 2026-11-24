'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, Sparkles, ArrowRight } from 'lucide-react';
import { ProCrown } from '../common/ProCrown';

interface ProSectionProps {
  onStartPro: () => void;
}

export function ProSection({ onStartPro }: ProSectionProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  const perks = [
    'Unlock 7 exclusive themes (Gold Leaf, OLED Abyss, Crimson, Sakura, Espresso, Forest, Matcha)',
    'Time Travel analytics: Inspect any past day, month, or season archive',
    'Deep focus heatmaps and hourly productivity breakdowns',
    'Official Pro Crown badge & glowing Pro Avatar Ring in rooms and leaderboards',
    'Unlimited collaborative study rooms with custom capacity',
  ];

  return (
    <section id="pro" className="py-24 px-4 sm:px-6 max-w-4xl mx-auto relative text-center">
      {/* Background warm gold radiance */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-[radial-gradient(circle,rgba(230,193,90,0.12)_0%,rgba(184,137,43,0.04)_50%,transparent_70%)] pointer-events-none -z-10" />

      {/* Header */}
      <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#E6C15A]/10 border border-[#E6C15A]/25 text-[#E6C15A] text-xs font-mono uppercase tracking-wider mb-4 shadow-[0_0_15px_rgba(230,193,90,0.15)]">
        <ProCrown size={14} variant="gold" />
        <span>Study.io Pro • Lifetime Value</span>
      </div>

      <h2 className="text-3xl sm:text-5xl font-hud font-bold text-white tracking-tight">
        Elevate Your Focus Sanctuary.
      </h2>
      <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans max-w-xl mx-auto leading-relaxed">
        Everything essential is free forever. Pro unlocks artisan aesthetics, historical time travel, and deep productivity intelligence.
      </p>

      {/* Billing Cycle Toggle */}
      <div className="flex items-center justify-center gap-2 mt-8 mb-10">
        <div className="flex items-center p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`py-2 px-5 rounded-xl text-xs font-hud font-bold uppercase tracking-wider transition-all cursor-pointer ${
              billingCycle === 'monthly'
                ? 'bg-white text-[#07090E] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly (₹99)
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`py-2 px-5 rounded-xl text-xs font-hud font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
              billingCycle === 'yearly'
                ? 'bg-[#E6C15A] text-[#1A1405] shadow-sm font-extrabold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Yearly (₹999)</span>
            <span className="text-[9px] bg-black/20 text-white px-1.5 py-0.5 rounded-full font-mono">
              Save 16%
            </span>
          </button>
        </div>
      </div>

      {/* Compact High-End Pricing Card */}
      <div className="rounded-[36px] bg-gradient-to-b from-[#14120E] via-[#0E0C09] to-[#0A0907] border border-[#E6C15A]/30 p-8 sm:p-10 shadow-[0_25px_60px_rgba(0,0,0,0.95)] max-w-xl mx-auto text-left relative overflow-hidden">
        {/* Subtle top gold shimmer */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#E6C15A]/60 to-transparent" />

        <div className="flex items-baseline justify-between flex-wrap gap-2 pb-6 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2">
              <ProCrown size={20} variant="gold" />
              <h3 className="text-xl font-hud font-bold text-white tracking-wide">
                Study.io Pro
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-1">
              Full access across Web, Desktop, and Android
            </p>
          </div>

          <div className="text-right">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-hud font-bold text-white">
                {billingCycle === 'yearly' ? '₹999' : '₹99'}
              </span>
              <span className="text-xs font-mono text-slate-400">
                {billingCycle === 'yearly' ? '/year' : '/month'}
              </span>
            </div>
            {billingCycle === 'yearly' && (
              <span className="text-[11px] font-mono text-[#E6C15A] block mt-0.5">
                Just ~₹83 per month
              </span>
            )}
          </div>
        </div>

        {/* Real Perks List */}
        <ul className="space-y-3.5 my-7 text-xs sm:text-sm text-slate-300 font-sans">
          {perks.map((perk, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-[#E6C15A]/15 border border-[#E6C15A]/30 text-[#E6C15A] flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
              <span className="leading-snug">{perk}</span>
            </li>
          ))}
        </ul>

        {/* Primary Pro Action */}
        <Link
          href="/login"
          onClick={(e) => {
            if (onStartPro) {
              e.preventDefault();
              onStartPro();
            }
          }}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#F5E6A8] via-[#E6C15A] to-[#B8892B] text-[#1A1405] font-hud font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_4px_25px_rgba(230,193,90,0.25)] hover:opacity-95 transition-all duration-150 active:scale-[0.98] cursor-pointer"
        >
          <span>Upgrade to Pro</span>
          <ArrowRight className="w-4 h-4 stroke-[2.5]" />
        </Link>

        <span className="text-[10px] font-mono text-slate-500 text-center block mt-3">
          Instant activation • Cancel anytime • Zero automated surprise charges
        </span>
      </div>
    </section>
  );
}
