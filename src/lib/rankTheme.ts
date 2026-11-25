import { RankTierName as SystemRankTierName } from './rankedSystem';

export type RankTierName = SystemRankTierName;

export interface RankThemePalette {
  tier: RankTierName;
  accent: string;
  glow: string;
  border: string;
  surface: string;
  bg: string; // The solid background color for badges/elements
  base: string; // The app background
  cardTexture: string;
  cardHighlight?: string; // CSS background for cards
  icon: string; // Lucide icon name
  // Legacy fields for backward compatibility where needed
  accentRgb: string;
  accentHover: string;
  surfaceHigh: string;
  gradient: string;
  badgeBg: string;
  textAccent: string;
}

export const RANK_THEMES: Record<RankTierName, RankThemePalette> = {
  Bronze: {
    tier: 'Bronze',
    accent: '#C98A4B',
    glow: 'rgba(201, 138, 75, 0.35)',
    bg: '#08090C',
    base: '#08090C',
    surface: '#0F1117',
    border: 'rgba(255, 255, 255, 0.07)',
    cardTexture: 'radial-gradient(circle at bottom left, rgba(201,138,75,0.03) 0%, transparent 50%)',
    icon: 'Flame',
    accentRgb: '201, 138, 75',
    accentHover: '#E09B58',
    surfaceHigh: '#221D17',
    gradient: 'linear-gradient(135deg, #C98A4B 0%, #EAA260 50%, #A66C35 100%)',
    badgeBg: 'rgba(201, 138, 75, 0.14)',
    textAccent: '#F3AD6C',
  },
  Silver: {
    tier: 'Silver',
    accent: '#A8B4C2',
    glow: 'rgba(168, 180, 194, 0.35)',
    bg: '#08090C',
    base: '#08090C',
    surface: '#0F1117',
    border: 'rgba(255, 255, 255, 0.07)',
    cardTexture: 'linear-gradient(135deg, rgba(168,180,194,0.02) 0%, transparent 100%)',
    icon: 'Shield',
    accentRgb: '168, 180, 194',
    accentHover: '#B9C6D6',
    surfaceHigh: '#1E2329',
    gradient: 'linear-gradient(135deg, #A8B4C2 0%, #FFFFFF 50%, #8391A0 100%)',
    badgeBg: 'rgba(168, 180, 194, 0.14)',
    textAccent: '#E0E8F0',
  },
  Gold: {
    tier: 'Gold',
    accent: '#D4A017',
    glow: 'rgba(212, 160, 23, 0.38)',
    bg: '#08090C',
    base: '#08090C',
    surface: '#0F1117',
    border: 'rgba(255, 255, 255, 0.07)',
    cardTexture: 'radial-gradient(circle at top right, rgba(212,160,23,0.06) 0%, transparent 60%)',
    icon: 'Star',
    accentRgb: '212, 160, 23',
    accentHover: '#F0B61E',
    surfaceHigh: '#241D0B',
    gradient: 'linear-gradient(135deg, #D4A017 0%, #F8CC3E 50%, #A67B0E 100%)',
    badgeBg: 'rgba(212, 160, 23, 0.14)',
    textAccent: '#FBE270',
  },
  Platinum: {
    tier: 'Platinum',
    accent: '#CBD5E1',
    glow: 'rgba(203, 213, 225, 0.40)',
    bg: '#08090C',
    base: '#08090C',
    surface: '#0F1117',
    border: 'rgba(255, 255, 255, 0.08)',
    cardTexture: 'radial-gradient(circle at bottom left, rgba(203,213,225,0.06) 0%, transparent 40%)',
    icon: 'Hexagon',
    accentRgb: '203, 213, 225',
    accentHover: '#E2E8F0',
    surfaceHigh: '#1E232B',
    gradient: 'linear-gradient(135deg, #CBD5E1 0%, #FFFFFF 50%, #94A3B8 100%)',
    badgeBg: 'rgba(203, 213, 225, 0.14)',
    textAccent: '#F1F5F9',
  },
  Diamond: {
    tier: 'Diamond',
    accent: '#6FA8DC',
    glow: 'rgba(111, 168, 220, 0.40)',
    bg: '#08090C',
    base: '#08090C',
    surface: '#0F1117',
    border: 'rgba(255, 255, 255, 0.07)',
    cardTexture: 'repeating-linear-gradient(45deg, rgba(111,168,220,0.015) 0px, rgba(111,168,220,0.015) 1px, transparent 1px, transparent 12px)',
    icon: 'Gem',
    accentRgb: '111, 168, 220',
    accentHover: '#87BCF0',
    surfaceHigh: '#121C29',
    gradient: 'linear-gradient(135deg, #6FA8DC 0%, #A6D4FA 50%, #4684BB 100%)',
    badgeBg: 'rgba(111, 168, 220, 0.14)',
    textAccent: '#A1CFF8',
  },
  Champion: {
    tier: 'Champion',
    accent: '#B24FE8',
    glow: 'rgba(178, 79, 232, 0.42)',
    bg: '#08090C',
    base: '#08090C',
    surface: '#0F1117',
    border: 'rgba(255, 255, 255, 0.07)',
    cardTexture: 'radial-gradient(circle at top center, rgba(178,79,232,0.06) 0%, transparent 50%), radial-gradient(circle at bottom right, rgba(178,79,232,0.04) 0%, transparent 50%)',
    icon: 'Sparkles',
    accentRgb: '178, 79, 232',
    accentHover: '#C46BFA',
    surfaceHigh: '#1C1729',
    gradient: 'linear-gradient(135deg, #B24FE8 0%, #E39CFF 50%, #7B35B8 100%)',
    badgeBg: 'rgba(178, 79, 232, 0.15)',
    textAccent: '#D2A4FB',
  },
  Master: {
    tier: 'Master',
    accent: '#6366F1',
    glow: 'rgba(99, 102, 241, 0.25)',
    bg: '#08090C',
    base: '#08090C',
    surface: '#0F1117',
    border: 'rgba(255, 255, 255, 0.07)',
    cardTexture: 'radial-gradient(circle at 50% 35%, rgba(99, 102, 241, 0.06), transparent 60%)',
    icon: 'Crown',
    accentRgb: '99, 102, 241',
    accentHover: '#818CF8',
    surfaceHigh: '#151722',
    gradient: 'linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.35), transparent)',
    badgeBg: 'rgba(99, 102, 241, 0.1)',
    textAccent: '#818CF8',
  },
  Grandmaster: {
    tier: 'Grandmaster',
    accent: '#E11D48',
    glow: 'rgba(225, 29, 72, 0.3)',
    bg: '#08090C',
    base: '#08090C',
    surface: '#0F1117',
    border: 'rgba(255, 255, 255, 0.07)',
    cardTexture: 'radial-gradient(circle at 50% 35%, rgba(225, 29, 72, 0.05), rgba(212, 175, 55, 0.03), transparent 65%)',
    icon: 'Award',
    accentRgb: '225, 29, 72',
    accentHover: '#BE123C',
    surfaceHigh: '#151722',
    gradient: 'linear-gradient(90deg, transparent, rgba(225, 29, 72, 0.4), rgba(212, 175, 55, 0.3), transparent)',
    badgeBg: 'rgba(225, 29, 72, 0.1)',
    textAccent: '#D4AF37',
  }
} as Record<RankTierName, RankThemePalette & { bg: string }>;

export function getRankTheme(tier: string): RankThemePalette {
  const normalized = (tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase()) as RankTierName;
  return RANK_THEMES[normalized] || RANK_THEMES.Bronze;
}
