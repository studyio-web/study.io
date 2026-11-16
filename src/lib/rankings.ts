import { getRankTier, RANK_TIERS, RankTier } from './ranks';

export interface RankTierDefinition {
  name: string;
  tier: string;
  division: string;
  minHours: number;
  minMinutes: number;
  badgePath: string;
}

export const RANKING_TIERS = RANK_TIERS;

/**
 * Calculates the exact rank tier string (e.g. 'Bronze I', 'Silver IV', 'Gold I')
 * from Season RP (number) or rank title (string).
 * Single unified source of truth across UI.
 */
export function calculateRankTier(rpOrTitle: number | string): string {
  if (typeof rpOrTitle === 'number') {
    return getRankTier(rpOrTitle).name;
  }
  const clean = String(rpOrTitle || '').trim();
  const found = RANK_TIERS.find(r => r.name.toLowerCase() === clean.toLowerCase());
  return found ? found.name : 'Bronze I';
}

/**
 * Returns structured metadata (tier family, division, badge image path)
 * for a tier name or Season RP value.
 */
export function getRankTierDetails(tierOrRp: string | number): RankTierDefinition {
  const tierObj: RankTier = typeof tierOrRp === 'number'
    ? getRankTier(tierOrRp)
    : (RANK_TIERS.find(r => r.name.toLowerCase() === String(tierOrRp || '').trim().toLowerCase()) || RANK_TIERS[0]);

  return {
    name: tierObj.name,
    tier: tierObj.tier,
    division: tierObj.division,
    minHours: tierObj.minHours,
    minMinutes: tierObj.minHours * 60,
    badgePath: tierObj.imagePath,
  };
}
