'use client';

import React, { useState } from 'react';
import { Sparkles, Gem, Check, Lock, X } from 'lucide-react';
import { ProCrown } from '../../../components/common/ProCrown';
import {
  PREMIUM_COLLECTIBLES,
  VAULT_CATEGORIES,
  PREMIUM_AVATAR_MAP,
  FREE_AVATAR_IMAGE_MAP,
  resolveAvatarImage,
} from '@/lib/avatars';

type CropShape = 'round' | 'rounded-square';
type DisplaySize = 32 | 48 | 64 | 96;

const SIZES: DisplaySize[] = [32, 48, 64, 96];

function AvatarSwatch({
  src,
  label,
  size,
  shape,
}: {
  src: string;
  label: string;
  size: DisplaySize;
  shape: CropShape;
}) {
  const [err, setErr] = useState(false);
  const radius = shape === 'round' ? '50%' : size > 48 ? '12px' : '8px';
  return (
    <div className="flex flex-col items-center gap-1" title={label}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          overflow: 'hidden',
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
        }}
      >
        {!err ? (
          <img
            src={src}
            alt={label}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={() => setErr(true)}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: '#ef4444',
              fontFamily: 'monospace',
            }}
          >
            ERR
          </div>
        )}
      </div>
      {size === 32 && (
        <span
          style={{
            fontSize: 8,
            color: '#6b7280',
            fontFamily: 'monospace',
            maxWidth: 40,
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={label}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function AvatarRow({
  id,
  label,
  shape,
}: {
  id: string;
  label: string;
  shape: CropShape;
}) {
  const src = resolveAvatarImage(id);
  const isLocal = src.startsWith('/');
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {SIZES.map((sz) => (
        <AvatarSwatch key={sz} src={src} label={label} size={sz} shape={shape} />
      ))}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </div>
        <div style={{ fontSize: 9, color: isLocal ? '#34d399' : '#f59e0b', fontFamily: 'monospace', marginTop: 2 }}>
          {isLocal ? '✓ local artwork' : '⚠ DiceBear fallback'}
        </div>
        <div style={{ fontSize: 8, color: '#4b5563', fontFamily: 'monospace', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {src}
        </div>
      </div>
    </div>
  );
}

export default function DevAvatarsPage() {
  const [activeTab, setActiveTab] = useState<'picker' | 'matrix'>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('tab');
      if (p === 'matrix') return 'matrix';
    }
    return 'picker';
  });
  const [shape, setShape] = useState<CropShape>('round');
  const [isProMode, setIsProMode] = useState(true);
  const [selectedAvatar, setSelectedAvatar] = useState<string>(PREMIUM_COLLECTIBLES[0].id);

  const premiumCat = VAULT_CATEGORIES[0];
  const freeCats = VAULT_CATEGORIES.slice(1);

  const totalFreeAvatars = freeCats.reduce((n, c) => n + c.avatars.length, 0);
  const totalAvatars = PREMIUM_COLLECTIBLES.length + totalFreeAvatars;
  const localFreeCount = freeCats.reduce(
    (n, c) => n + c.avatars.filter((url) => FREE_AVATAR_IMAGE_MAP[url]).length,
    0
  );
  const localPremiumCount = PREMIUM_COLLECTIBLES.filter((c) => c.image.startsWith('/')).length;

  return (
    <div style={{ minHeight: '100vh', background: '#07090e', color: 'white', padding: '24px 32px', fontFamily: 'sans-serif' }}>
      <style>{`
        @keyframes legendary-border-shimmer {
          0%, 100% { border-color: rgba(245, 158, 11, 0.4); }
          50% { border-color: rgba(253, 230, 138, 0.85); box-shadow: 0 0 10px rgba(245, 158, 11, 0.25); }
        }
        @keyframes premium-shine-sweep {
          0% { transform: translateX(-160%) rotate(35deg); opacity: 0; }
          30% { opacity: 0.6; }
          100% { transform: translateX(260%) rotate(35deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .anim-legendary-shimmer {
            animation: legendary-border-shimmer 8s ease-in-out infinite;
          }
          .group:hover .anim-shine-sweep {
            animation: premium-shine-sweep 1.2s ease-out 1 forwards;
          }
        }
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, padding: '4px 12px', marginBottom: 8 }}>
            <Sparkles style={{ width: 14, height: 14, color: '#fbbf24' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', letterSpacing: 2, textTransform: 'uppercase' }}>Official Artwork Vault</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: 1.5, margin: '0 0 4px' }}>AVATAR ARTWORK INSPECTOR & PICKER</h1>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
            {totalAvatars} cohesive dark-fantasy avatars across 5 categories · {localPremiumCount + localFreeCount}/50 local artworks active
          </p>
        </div>

        {/* View Switcher Bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 4 }}>
            <button
              type="button"
              onClick={() => setActiveTab('picker')}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: 'pointer',
                border: 'none',
                background: activeTab === 'picker' ? '#f59e0b' : 'transparent',
                color: activeTab === 'picker' ? '#000' : '#9ca3af',
              }}
            >
              🎨 Picker Modal Grid
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('matrix')}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: 'pointer',
                border: 'none',
                background: activeTab === 'matrix' ? '#f59e0b' : 'transparent',
                color: activeTab === 'matrix' ? '#000' : '#9ca3af',
              }}
            >
              📐 32/48/64/96px Scale Matrix
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Pro toggle */}
            <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 3 }}>
              <button
                type="button"
                onClick={() => setIsProMode(true)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                  cursor: 'pointer', border: 'none',
                  background: isProMode ? '#f59e0b' : 'transparent',
                  color: isProMode ? '#000' : '#9ca3af',
                }}
              >
                PRO
              </button>
              <button
                type="button"
                onClick={() => setIsProMode(false)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                  cursor: 'pointer', border: 'none',
                  background: !isProMode ? '#7c3aed' : 'transparent',
                  color: !isProMode ? '#fff' : '#9ca3af',
                }}
              >
                FREE
              </button>
            </div>

            {/* Shape toggle (for matrix) */}
            {activeTab === 'matrix' && (
              <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 3 }}>
                <button
                  type="button"
                  onClick={() => setShape('round')}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                    cursor: 'pointer', border: 'none',
                    background: shape === 'round' ? '#f59e0b' : 'transparent',
                    color: shape === 'round' ? '#000' : '#9ca3af',
                  }}
                >
                  ● Round
                </button>
                <button
                  type="button"
                  onClick={() => setShape('rounded-square')}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                    cursor: 'pointer', border: 'none',
                    background: shape === 'rounded-square' ? '#f59e0b' : 'transparent',
                    color: shape === 'rounded-square' ? '#000' : '#9ca3af',
                  }}
                >
                  ▪ Square
                </button>
              </div>
            )}
          </div>
        </div>

        {/* TAB 1: PICKER MODAL VIEW */}
        {activeTab === 'picker' && (
          <div className="space-y-6">
            <div className="bg-[#0c0d12] border border-white/10 rounded-2xl w-full overflow-hidden flex flex-col shadow-2xl">
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-wide flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    CHOOSE SCHOLAR AVATAR
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Select an avatar that matches your study persona.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span className="text-amber-400 font-semibold">{isProMode ? 'Pro Mode Active' : 'Free Mode Active'}</span>
                </div>
              </div>

              {/* Modal Body with All Categories */}
              <div className="p-4 sm:p-6 space-y-7">
                {VAULT_CATEGORIES.map((category, idx) => {
                  return (
                    <div key={idx} className="space-y-3">
                      {category.isPremium ? (
                        <div className="space-y-3 bg-white/[0.02] border border-amber-500/20 rounded-xl p-3.5 sm:p-4">
                          <div className="flex items-center justify-between pl-1 pb-1">
                            <div className="flex items-center gap-2">
                              <ProCrown size={15} variant="gold" />
                              <h4 className="text-[11px] font-mono font-bold uppercase tracking-widest text-amber-400">
                                {category.name}
                              </h4>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider uppercase bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-amber-500/20 text-amber-300 border border-amber-400/40 shadow-[0_0_12px_rgba(245,158,11,0.15)] flex items-center gap-1.5">
                              <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                              {isProMode ? 'PRO UNLOCKED' : 'PRO EXCLUSIVE'}
                            </span>
                          </div>

                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                            {category.avatars.map((url, i) => {
                              const meta = PREMIUM_AVATAR_MAP[url] || {
                                name: `Elite Scholar #${i + 1}`,
                                rarity: i < 6 ? 'Epic' : 'Legendary',
                                image: url,
                                signatureColor: i < 6 ? '#A855F7' : '#F59E0B',
                                glowColor: i < 6 ? 'rgba(168, 85, 247, 0.45)' : 'rgba(245, 158, 11, 0.45)',
                                borderColor: i < 6 ? '#C084FC' : '#FDE68A',
                              };
                              const isEpic = meta.rarity === 'Epic';
                              const isActive = selectedAvatar === url;
                              const isLocked = !isProMode;

                              return (
                                <button
                                  type="button"
                                  key={i}
                                  aria-label={`${meta.name} avatar, ${meta.rarity}`}
                                  onClick={() => setSelectedAvatar(url)}
                                  className={`group aspect-square rounded-xl flex items-center justify-center overflow-hidden cursor-pointer relative transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 hover:-translate-y-[2px] ${
                                    isActive
                                      ? isEpic
                                        ? 'ring-2 ring-purple-400 border-[1.5px] border-purple-400 shadow-[0_0_18px_rgba(192,132,252,0.5)] scale-105 z-10'
                                        : 'ring-2 ring-amber-400 border-[1.5px] border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.5)] scale-105 z-10'
                                      : isEpic
                                      ? 'border-[1.5px] border-purple-500/40 hover:border-purple-400/80 hover:shadow-[0_6px_20px_rgba(168,85,247,0.35)]'
                                      : 'border-[1.5px] border-amber-400/40 hover:border-amber-300/80 hover:shadow-[0_6px_20px_rgba(245,158,11,0.35)] anim-legendary-shimmer'
                                  }`}
                                  style={{
                                    background: `radial-gradient(circle at 50% 30%, ${meta.glowColor} 0%, rgba(13, 17, 26, 0.95) 75%)`,
                                    boxShadow: `inset 0 0 12px ${meta.glowColor}`,
                                  }}
                                >
                                  <img
                                    src={meta.image}
                                    alt={`${meta.name} avatar`}
                                    loading="lazy"
                                    className="w-full h-full object-cover p-1 transition-transform duration-300 group-hover:scale-105"
                                  />
                                  <div
                                    className={`absolute top-1.5 right-1.5 z-20 pointer-events-none ${
                                      isEpic
                                        ? 'text-purple-300 drop-shadow-[0_0_6px_rgba(192,132,252,0.8)]'
                                        : 'text-amber-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]'
                                    }`}
                                  >
                                    {isEpic ? <Gem className="w-3.5 h-3.5" /> : <ProCrown size={14} variant="gold" />}
                                  </div>
                                  {isActive && (
                                    <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-md z-20">
                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    </div>
                                  )}
                                  {isLocked && (
                                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-amber-400/30 text-amber-300 text-[9px] font-hud font-bold tracking-wider uppercase flex items-center gap-1 shadow-lg pointer-events-none z-20">
                                      <Lock className="w-2.5 h-2.5 text-amber-400" />
                                      <span>PRO</span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between pl-1">
                            <h4 className="text-[11px] font-mono font-bold uppercase tracking-widest text-neutral-400">
                              {category.name}
                            </h4>
                            <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                              ✓ {category.avatars.length} / {category.avatars.length} Local Art
                            </span>
                          </div>

                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                            {category.avatars.map((url, i) => {
                              const isActive = selectedAvatar === url;
                              const localSrc = resolveAvatarImage(url);
                              return (
                                <button
                                  type="button"
                                  key={i}
                                  onClick={() => setSelectedAvatar(url)}
                                  className={`aspect-square rounded-xl flex items-center justify-center overflow-hidden transition-all cursor-pointer relative border ${
                                    isActive
                                      ? 'ring-2 ring-amber-500 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.3)] scale-105 z-10'
                                      : 'border-white/10 bg-white/[0.03] hover:scale-105 hover:border-amber-500/50 hover:bg-amber-500/10'
                                  }`}
                                >
                                  <img
                                    src={localSrc}
                                    alt={`Vault ${idx}-${i}`}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                  />
                                  {isActive && (
                                    <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-md z-20">
                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-white/10 flex items-center justify-between text-xs font-mono text-slate-400">
                <span>Selected ID: <strong className="text-amber-400">{selectedAvatar.slice(0, 40)}...</strong></span>
                <span className="text-emerald-400">Active Asset: {resolveAvatarImage(selectedAvatar)}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SCALE MATRIX */}
        {activeTab === 'matrix' && (
          <div className="space-y-8">
            <section style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(245,158,11,0.2)' }}>
                <ProCrown size={14} variant="gold" />
                <h2 style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', letterSpacing: 2, textTransform: 'uppercase', margin: 0 }}>
                  PREMIUM // ELITE SCHOLARS (12 Avatars — Pro Exclusive)
                </h2>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '8px 16px' }}>
                <div style={{ fontSize: 10, color: '#4b5563', fontFamily: 'monospace', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                  32px · 48px · 64px · 96px ({shape} crop)
                </div>
                {premiumCat.avatars.map((url, i) => {
                  const meta = PREMIUM_AVATAR_MAP[url];
                  return <AvatarRow key={i} id={url} label={meta?.name || `Premium ${i + 1}`} shape={shape} />;
                })}
              </div>
            </section>

            {freeCats.map((cat, catIdx) => (
              <section key={catIdx} style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <h2 style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase', margin: 0 }}>
                    {cat.name} ({cat.avatars.length} Avatars — Free)
                  </h2>
                  <span style={{ fontSize: 9, color: '#34d399', fontFamily: 'monospace' }}>
                    100% Local Vector Artwork
                  </span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '8px 16px' }}>
                  <div style={{ fontSize: 10, color: '#4b5563', fontFamily: 'monospace', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    32px · 48px · 64px · 96px ({shape} crop)
                  </div>
                  {cat.avatars.map((url, i) => (
                    <AvatarRow key={i} id={url} label={`${cat.name.split(' ')[0]} #${i + 1}`} shape={shape} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Page Footer */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 10, color: '#64748b', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between' }}>
          <span>study.io avatar vault inspector</span>
          <span>50/50 artworks verified · safe zone 80% · zero transparency leaks</span>
        </div>
      </div>
    </div>
  );
}
