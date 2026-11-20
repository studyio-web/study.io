'use client';

import React from 'react';
import { ProCrown } from '../../../components/common/ProCrown';

const SIZES = [12, 14, 16, 20, 24, 40, 64] as const;

export default function DevCrownPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white p-8 space-y-12 font-sans">
      <div>
        <h1 className="text-2xl font-bold font-hud tracking-wide flex items-center gap-3">
          <ProCrown size={32} />
          <span>ProCrown Component Verification Suite</span>
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Testing all sizes (12, 14, 16, 20, 24, 40, 64px) across gold, mono, and outline variants on dark and gold surfaces.
        </p>
      </div>

      {/* 1. DARK BACKGROUND: All variants & sizes */}
      <section className="space-y-6">
        <h2 className="text-lg font-bold border-b border-zinc-800 pb-2 text-zinc-200">
          1. On Dark Surface (#0A0A0B / #141721)
        </h2>

        {/* Gold variant */}
        <div className="bg-[#12141C] p-6 rounded-2xl border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-amber-300 uppercase">
              variant=&quot;gold&quot; (Default Soft Vertical Gradient #F7D774 → #D9A63C)
            </span>
          </div>
          <div className="flex items-end gap-6 flex-wrap py-2">
            {SIZES.map((size) => (
              <div key={`gold-${size}`} className="flex flex-col items-center gap-2">
                <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-center">
                  <ProCrown size={size} variant="gold" />
                </div>
                <span className="text-[11px] font-mono text-zinc-400">{size}px</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mono variant */}
        <div className="bg-[#12141C] p-6 rounded-2xl border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-zinc-300 uppercase">
              variant=&quot;mono&quot; (currentColor silhouette — white text here)
            </span>
          </div>
          <div className="flex items-end gap-6 flex-wrap py-2 text-white">
            {SIZES.map((size) => (
              <div key={`mono-${size}`} className="flex flex-col items-center gap-2">
                <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-center">
                  <ProCrown size={size} variant="mono" />
                </div>
                <span className="text-[11px] font-mono text-zinc-400">{size}px</span>
              </div>
            ))}
          </div>
        </div>

        {/* Outline variant */}
        <div className="bg-[#12141C] p-6 rounded-2xl border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-zinc-400 uppercase">
              variant=&quot;outline&quot; (1.5px stroke, locked/inactive)
            </span>
          </div>
          <div className="flex items-end gap-6 flex-wrap py-2 text-zinc-400">
            {SIZES.map((size) => (
              <div key={`outline-${size}`} className="flex flex-col items-center gap-2">
                <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-center">
                  <ProCrown size={size} variant="outline" />
                </div>
                <span className="text-[11px] font-mono text-zinc-400">{size}px</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. GOLD BACKGROUND: Mono variant for buttons */}
      <section className="space-y-6">
        <h2 className="text-lg font-bold border-b border-zinc-800 pb-2 text-zinc-200">
          2. On Gold CTA Surface (linear-gradient: #F5E6A8 → #E6C15A → #B8892B)
        </h2>

        <div
          className="p-6 rounded-2xl space-y-4 shadow-xl"
          style={{
            background: 'linear-gradient(135deg, #F5E6A8 0%, #E6C15A 50%, #B8892B 100%)',
          }}
        >
          <div className="flex items-center justify-between text-[#1A1405]">
            <span className="text-xs font-mono font-bold uppercase tracking-wider">
              variant=&quot;mono&quot; (Dark #1A1405 on Gold CTA Button)
            </span>
          </div>
          <div className="flex items-end gap-6 flex-wrap py-2 text-[#1A1405]">
            {SIZES.map((size) => (
              <div key={`gold-surface-${size}`} className="flex flex-col items-center gap-2">
                <div className="p-3 bg-black/10 rounded-xl border border-black/10 flex items-center justify-center">
                  <ProCrown size={size} variant="mono" />
                </div>
                <span className="text-[11px] font-mono font-bold text-[#1A1405]">{size}px</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. IN-LINE TYPOGRAPHY & BUTTON PAIRINGS */}
      <section className="space-y-6">
        <h2 className="text-lg font-bold border-b border-zinc-800 pb-2 text-zinc-200">
          3. Inline Typography &amp; UI Pairings
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Header Pro Pill */}
          <div className="p-4 rounded-xl bg-[#141721] border border-white/10 flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-mono">Header Upgrade Pill (16px mono)</span>
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-hud font-bold tracking-wider uppercase text-[#1A1405]"
              style={{
                background: 'linear-gradient(135deg, #F5E6A8 0%, #E6C15A 50%, #B8892B 100%)',
              }}
            >
              <ProCrown size={16} variant="mono" />
              <span>UPGRADE</span>
            </button>
          </div>

          {/* Scholar Username pairing */}
          <div className="p-4 rounded-xl bg-[#141721] border border-white/10 flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-mono">Leaderboard / Room Name (13px gold)</span>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-white">Alex Morgan</span>
              <ProCrown size={13} variant="gold" aria-label="Pro member" />
            </div>
          </div>

          {/* Locked Avatar Badge */}
          <div className="p-4 rounded-xl bg-[#141721] border border-white/10 flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-mono">Locked Collectible (14px outline)</span>
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-500">
              <ProCrown size={14} variant="outline" />
            </div>
          </div>

          {/* Premium Hero Title */}
          <div className="p-4 rounded-xl bg-[#141721] border border-white/10 flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-mono">Hero Modal Badge (40px gold)</span>
            <div className="flex items-center gap-3">
              <ProCrown size={40} variant="gold" />
              <span className="font-hud font-bold text-lg text-white">study.io Pro</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
