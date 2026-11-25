'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useTheme, ThemeOption } from '../../context/ThemeContext';
import { usePremium } from '../../context/PremiumContext';
import { Check, Palette, RotateCcw, Lock, ChevronRight } from 'lucide-react';
import { ProCrown } from '../common/ProCrown';
import { hapticTick } from '@/lib/haptics';
import { registerBackButtonHandler } from '@/lib/native-feel';

export function ThemePicker() {
  const { theme, setTheme, themes, isMounted } = useTheme();
  const { isPremium, openPremiumModal } = usePremium();
  const [isFreeExpanded, setIsFreeExpanded] = useState(false);
  const [isPremiumExpanded, setIsPremiumExpanded] = useState(false);

  const freeCardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const premiumCardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const currentTheme = useMemo(() => {
    return themes.find((t) => t.id === theme) || themes[0];
  }, [themes, theme]);

  // Split into free themes and premium themes
  const freeThemes = useMemo(() => themes.filter((t) => !t.isPremium), [themes]);
  const premiumThemes = useMemo(() => themes.filter((t) => t.isPremium), [themes]);

  const isFreeThemeActive = useMemo(() => {
    return freeThemes.some((t) => t.id === theme);
  }, [freeThemes, theme]);

  const isPremiumThemeActive = useMemo(() => {
    return premiumThemes.some((t) => t.id === theme);
  }, [premiumThemes, theme]);

  // Hardware Android back button collapses any open theme section before leaving settings
  useEffect(() => {
    if (!isFreeExpanded && !isPremiumExpanded) return;
    return registerBackButtonHandler(() => {
      setIsFreeExpanded(false);
      setIsPremiumExpanded(false);
      return true;
    });
  }, [isFreeExpanded, isPremiumExpanded]);

  const toggleSection = (section: 'free' | 'premium') => {
    hapticTick();
    if (section === 'free') {
      setIsFreeExpanded((prev) => !prev);
    } else {
      setIsPremiumExpanded((prev) => !prev);
    }
  };

  // Arrow key navigation between responsive theme cards within a section
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number, section: 'free' | 'premium') => {
      const list = section === 'free' ? freeThemes : premiumThemes;
      const refs = section === 'free' ? freeCardRefs : premiumCardRefs;
      let targetIndex = index;
      const total = list.length;

      let cols = 3;
      if (refs.current[0] && refs.current[1]) {
        const firstTop = refs.current[0].offsetTop;
        const count = refs.current.filter((c) => c && Math.abs(c.offsetTop - firstTop) < 5).length;
        if (count > 0) cols = count;
      }

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          targetIndex = (index + 1) % total;
          break;
        case 'ArrowLeft':
          e.preventDefault();
          targetIndex = (index - 1 + total) % total;
          break;
        case 'ArrowDown':
          e.preventDefault();
          targetIndex = (index + cols) % total;
          break;
        case 'ArrowUp':
          e.preventDefault();
          targetIndex = (index - cols + total) % total;
          break;
        case 'Home':
          e.preventDefault();
          targetIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          targetIndex = total - 1;
          break;
        default:
          return;
      }

      if (targetIndex !== index) {
        const nextBtn = refs.current[targetIndex];
        if (nextBtn) {
          nextBtn.focus();
          const targetTheme = list[targetIndex];
          if (targetTheme.isPremium && !isPremium) {
            openPremiumModal();
          } else {
            setTheme(targetTheme.id);
          }
        }
      }
    },
    [freeThemes, premiumThemes, setTheme, isPremium, openPremiumModal]
  );

  const renderThemeCard = (t: ThemeOption, section: 'free' | 'premium') => {
    const list = section === 'free' ? freeThemes : premiumThemes;
    const refs = section === 'free' ? freeCardRefs : premiumCardRefs;
    const index = list.findIndex((item) => item.id === t.id);
    const isSelected = isMounted && theme === t.id;
    const isRank = t.id === 'rank';
    const [bgCol, surfaceCol, accentCol] = t.previewColors;

    return (
      <button
        key={t.id}
        ref={(el) => {
          refs.current[index] = el;
        }}
        type="button"
        role="radio"
        aria-checked={isSelected}
        aria-pressed={isSelected}
        tabIndex={isSelected || (!isMounted && index === 0) ? 0 : -1}
        title={`${t.name}: ${t.description}${t.isPremium ? ' (Premium)' : ''}`}
        onClick={() => {
          hapticTick();
          if (t.isPremium && !isPremium) {
            openPremiumModal();
            return;
          }
          setTheme(t.id);
        }}
        onKeyDown={(e) => handleKeyDown(e, index, section)}
        className={`relative rounded-[14px] p-3 text-left transition-all duration-200 cursor-pointer h-full flex flex-col justify-between overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] active:scale-[0.98] ${
          isSelected
            ? 'border-2 border-[var(--accent)] shadow-[0_0_16px_var(--glow)] bg-[var(--surface-2)]'
            : 'border border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'
        }`}
        style={{ borderRadius: '14px' }}
      >
        {/* Selected Check Badge */}
        {isSelected && (
          <div
            className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center shadow-md z-20 animate-in zoom-in-75 duration-150"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
            }}
            aria-hidden="true"
          >
            <Check className="w-3 h-3 stroke-[3]" />
          </div>
        )}

        {/* Mini Preview Box */}
        <div
          className="w-full h-16 rounded-[10px] p-2 relative overflow-hidden flex flex-col justify-between mb-2.5 border flex-shrink-0"
          style={{
            backgroundColor: bgCol,
            borderColor: t.isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)',
          }}
          aria-hidden="true"
        >
          {/* Surface Bar */}
          <div
            className="w-full h-4 rounded-[6px] px-1.5 flex items-center gap-1.5 border"
            style={{
              backgroundColor: surfaceCol,
              borderColor: t.isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)',
            }}
          >
            {isRank ? (
              <div
                className="w-full h-1.5 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, #C98A4B 0%, #A8B4C2 16%, #D4A017 32%, #CBD5E1 48%, #6FA8DC 64%, #B24FE8 80%, #E11D48 100%)',
                }}
              />
            ) : (
              <>
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: accentCol }}
                />
                <div
                  className="h-1.5 rounded-full flex-1 max-w-[42px]"
                  style={{ backgroundColor: accentCol }}
                />
              </>
            )}
          </div>

          {/* Accent Highlight Bar */}
          <div
            className="h-1.5 rounded-full"
            style={{
              width: isRank ? '75%' : '45%',
              background: isRank
                ? 'linear-gradient(90deg, #C98A4B, #D4A017, #CBD5E1, #B24FE8)'
                : accentCol,
            }}
          />
        </div>

        {/* Theme Name, Premium tag, & Description */}
        <div className="w-full min-w-0 flex-1 flex flex-col justify-start">
          <div className="flex items-center justify-between gap-1.5">
            <div className="font-hud font-semibold text-[14px] leading-tight text-[var(--text)] tracking-wide truncate">
              {t.name}
            </div>
            {t.isPremium && (
              <div className="flex items-center gap-1 shrink-0">
                {!isPremium && <Lock className="w-3 h-3 text-amber-400" />}
                <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  PRO
                </span>
              </div>
            )}
          </div>
          <div className="text-[12px] leading-snug text-[var(--text-dim)] font-sans mt-1">
            {t.description}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="w-full space-y-4">
      {/* ─── SECTION 1: FREE THEMES ───────────────────────────── */}
      <section aria-labelledby="free-themes-heading" className="w-full">
        <div
          className={`p-5 sm:p-6 rounded-2xl hud-surface border border-[var(--border)] relative overflow-hidden transition-all duration-200 ${
            isFreeExpanded ? 'space-y-5' : ''
          }`}
        >
          {/* Header Row */}
          <div
            onClick={() => toggleSection('free')}
            className="flex items-center justify-between gap-4 cursor-pointer select-none group"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border transition-transform group-hover:scale-105"
                style={{
                  backgroundColor: 'var(--accent-soft)',
                  borderColor: 'var(--border)',
                  color: 'var(--accent)',
                }}
              >
                <Palette className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 truncate">
                  <h3
                    id="free-themes-heading"
                    className="font-hud font-extrabold text-sm sm:text-base text-[var(--text)] tracking-wider uppercase truncate"
                  >
                    Free Themes
                  </h3>
                  {isFreeThemeActive && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-hud font-bold tracking-wider uppercase border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)] shrink-0 truncate max-w-[110px]">
                      {currentTheme.name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-dim)] mt-0.5 truncate">
                  {isFreeExpanded
                    ? 'Select a standard focus palette.'
                    : isFreeThemeActive
                    ? `Active: ${currentTheme.name} — tap to change`
                    : `${freeThemes.length} standard palettes included`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('free');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] group-hover:bg-white/[0.08] text-xs font-hud font-bold tracking-wider text-[var(--text)] transition-all cursor-pointer active:scale-95 shrink-0"
              aria-expanded={isFreeExpanded}
              title={isFreeExpanded ? 'Hide free themes' : 'Browse free themes'}
            >
              <span>{isFreeExpanded ? 'HIDE' : 'CHANGE'}</span>
              <ChevronRight
                className={`w-4 h-4 transition-transform duration-200 ${isFreeExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          </div>

          {/* Expanded Themes Grid */}
          {isFreeExpanded && (
            <div className="space-y-4 pt-3 border-t border-[var(--border)] animate-in fade-in duration-200">
              <div className="flex items-center justify-between gap-2 pb-0.5">
                <span className="text-xs text-[var(--text-dim)]">
                  {freeThemes.length} free palettes included with all accounts
                </span>
                <button
                  type="button"
                  onClick={() => {
                    hapticTick();
                    setTheme('rank');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-transparent hover:bg-white/[0.04] text-xs font-mono text-[var(--text-dim)] hover:text-[var(--text)] transition-colors cursor-pointer active:scale-95 shrink-0"
                  title="Reset theme to Rank colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to default</span>
                </button>
              </div>

              <div
                role="radiogroup"
                aria-label="Free Themes"
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
              >
                {freeThemes.map((t) => renderThemeCard(t, 'free'))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── SECTION 2: PREMIUM THEMES ────────────────────────── */}
      <section aria-labelledby="premium-themes-heading" className="w-full">
        <div
          className={`p-5 sm:p-6 rounded-2xl hud-surface border border-[var(--border)] relative overflow-hidden transition-all duration-200 ${
            isPremiumExpanded ? 'space-y-5' : ''
          }`}
        >
          {/* Header Row */}
          <div
            onClick={() => toggleSection('premium')}
            className="flex items-center justify-between gap-4 cursor-pointer select-none group"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border transition-transform group-hover:scale-105"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  borderColor: 'rgba(245, 158, 11, 0.3)',
                  color: '#F59E0B',
                }}
              >
                <ProCrown size={20} variant="gold" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 truncate">
                  <h3
                    id="premium-themes-heading"
                    className="font-hud font-extrabold text-sm sm:text-base text-[var(--text)] tracking-wider uppercase truncate"
                  >
                    Premium Themes
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-hud font-bold tracking-wider uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                    PRO
                  </span>
                  {isPremiumThemeActive && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-hud font-bold tracking-wider uppercase border border-[var(--border)] bg-[var(--surface-2)] text-amber-300 shrink-0 truncate max-w-[110px]">
                      {currentTheme.name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-dim)] mt-0.5 truncate">
                  {isPremiumExpanded
                    ? isPremium
                      ? 'Unlocked with study.io Pro'
                      : 'Exclusive scholar palettes — tap any theme to preview'
                    : isPremiumThemeActive
                    ? `Active: ${currentTheme.name} — tap to change`
                    : isPremium
                    ? `${premiumThemes.length} exclusive palettes unlocked`
                    : `${premiumThemes.length} exclusive scholar palettes with dynamic glows`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('premium');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] group-hover:bg-white/[0.08] text-xs font-hud font-bold tracking-wider text-[var(--text)] transition-all cursor-pointer active:scale-95 shrink-0"
              aria-expanded={isPremiumExpanded}
              title={isPremiumExpanded ? 'Hide premium themes' : 'Browse premium themes'}
            >
              <span>{isPremiumExpanded ? 'HIDE' : isPremium ? 'CHANGE' : 'BROWSE'}</span>
              <ChevronRight
                className={`w-4 h-4 transition-transform duration-200 ${isPremiumExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          </div>

          {/* Expanded Themes Grid */}
          {isPremiumExpanded && (
            <div className="space-y-4 pt-3 border-t border-[var(--border)] animate-in fade-in duration-200">
              <div className="flex items-center justify-between gap-2 pb-0.5">
                <span className="text-xs text-[var(--text-dim)]">
                  {isPremium
                    ? `${premiumThemes.length} exclusive palettes unlocked with Pro`
                    : `${premiumThemes.length} exclusive scholar palettes`}
                </span>
                {!isPremium && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      hapticTick();
                      openPremiumModal();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-xs font-hud font-bold tracking-wider text-amber-300 transition-colors cursor-pointer active:scale-95 shrink-0"
                  >
                    <ProCrown size={15} variant="gold" />
                    <span>UPGRADE</span>
                  </button>
                )}
              </div>

              <div
                role="radiogroup"
                aria-label="Premium Themes"
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
              >
                {premiumThemes.map((t) => renderThemeCard(t, 'premium'))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
