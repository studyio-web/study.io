export interface RankTierDefinition {
  name: string;        // e.g. "Bronze I", "Silver IV", "Gold I", "Champion"
  tier: string;        // e.g. "Bronze", "Silver", "Gold", "Champion"
  division: string;    // e.g. "I", "II", "III", "IV", ""
  minHours: number;
  minMinutes: number;
  badgePath: string;   // e.g. "/images/ranks/bronze-1.webp"
}

export const RANKING_TIERS: RankTierDefinition[] = [
  // Bronze: 0 - 7 hours (0 - 479 mins)
  { name: 'Bronze I', tier: 'Bronze', division: 'I', minHours: 0, minMinutes: 0, badgePath: '/images/ranks/bronze-1.webp' },
  { name: 'Bronze II', tier: 'Bronze', division: 'II', minHours: 1, minMinutes: 60, badgePath: '/images/ranks/bronze-2.webp' },
  { name: 'Bronze III', tier: 'Bronze', division: 'III', minHours: 3, minMinutes: 180, badgePath: '/images/ranks/bronze-3.webp' },
  { name: 'Bronze IV', tier: 'Bronze', division: 'IV', minHours: 5, minMinutes: 300, badgePath: '/images/ranks/bronze-4.webp' },

  // Silver: 8 - 27 hours (480 - 1679 mins)
  { name: 'Silver I', tier: 'Silver', division: 'I', minHours: 8, minMinutes: 480, badgePath: '/images/ranks/silver-1.webp' },
  { name: 'Silver II', tier: 'Silver', division: 'II', minHours: 11, minMinutes: 660, badgePath: '/images/ranks/silver-2.webp' },
  { name: 'Silver III', tier: 'Silver', division: 'III', minHours: 15, minMinutes: 900, badgePath: '/images/ranks/silver-3.webp' },
  { name: 'Silver IV', tier: 'Silver', division: 'IV', minHours: 20, minMinutes: 1200, badgePath: '/images/ranks/silver-4.webp' },

  // Gold: 28 - 79 hours (1680 - 4799 mins)
  { name: 'Gold I', tier: 'Gold', division: 'I', minHours: 28, minMinutes: 1680, badgePath: '/images/ranks/gold-1.webp' },
  { name: 'Gold II', tier: 'Gold', division: 'II', minHours: 38, minMinutes: 2280, badgePath: '/images/ranks/gold-2.webp' },
  { name: 'Gold III', tier: 'Gold', division: 'III', minHours: 50, minMinutes: 3000, badgePath: '/images/ranks/gold-3.webp' },
  { name: 'Gold IV', tier: 'Gold', division: 'IV', minHours: 64, minMinutes: 3840, badgePath: '/images/ranks/gold-4.webp' },

  // Platinum: 80 - 164 hours (4800 - 9899 mins)
  { name: 'Platinum I', tier: 'Platinum', division: 'I', minHours: 80, minMinutes: 4800, badgePath: '/images/ranks/platinum-1.webp' },
  { name: 'Platinum II', tier: 'Platinum', division: 'II', minHours: 98, minMinutes: 5880, badgePath: '/images/ranks/platinum-2.webp' },
  { name: 'Platinum III', tier: 'Platinum', division: 'III', minHours: 118, minMinutes: 7080, badgePath: '/images/ranks/platinum-3.webp' },
  { name: 'Platinum IV', tier: 'Platinum', division: 'IV', minHours: 140, minMinutes: 8400, badgePath: '/images/ranks/platinum-4.webp' },

  // Diamond: 165 - 299 hours (9900 - 17999 mins)
  { name: 'Diamond I', tier: 'Diamond', division: 'I', minHours: 165, minMinutes: 9900, badgePath: '/images/ranks/diamond-1.webp' },
  { name: 'Diamond II', tier: 'Diamond', division: 'II', minHours: 193, minMinutes: 11580, badgePath: '/images/ranks/diamond-2.webp' },
  { name: 'Diamond III', tier: 'Diamond', division: 'III', minHours: 225, minMinutes: 13500, badgePath: '/images/ranks/diamond-3.webp' },
  { name: 'Diamond IV', tier: 'Diamond', division: 'IV', minHours: 260, minMinutes: 15600, badgePath: '/images/ranks/diamond-4.webp' },

  // Apex Tiers: 300+ hours
  { name: 'Champion', tier: 'Champion', division: '', minHours: 300, minMinutes: 18000, badgePath: '/images/ranks/champion.webp' },
  { name: 'Master', tier: 'Master', division: '', minHours: 345, minMinutes: 20700, badgePath: '/images/ranks/master.webp' },
  { name: 'Grandmaster', tier: 'Grandmaster', division: '', minHours: 400, minMinutes: 24000, badgePath: '/images/ranks/grandmaster.webp' },
];

/**
 * Calculates the exact rank tier string (e.g. 'Bronze I', 'Silver IV', 'Gold I')
 * based on total focus minutes. Single unified source of truth across UI.
 */
export function calculateRankTier(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));

  for (let i = RANKING_TIERS.length - 1; i >= 0; i--) {
    if (safeMinutes >= RANKING_TIERS[i].minMinutes) {
      return RANKING_TIERS[i].name;
    }
  }

  return 'Bronze I';
}

/**
 * Returns structured metadata (tier family, division, badge image path)
 * for a tier name or minutes value.
 */
export function getRankTierDetails(tierOrMinutes: string | number): RankTierDefinition {
  if (typeof tierOrMinutes === 'number') {
    const tierName = calculateRankTier(tierOrMinutes);
    return (
      RANKING_TIERS.find((t) => t.name.toLowerCase() === tierName.toLowerCase()) ||
      RANKING_TIERS[0]
    );
  }

  const raw = String(tierOrMinutes || '').trim();
  const directMatch = RANKING_TIERS.find(
    (t) => t.name.toLowerCase() === raw.toLowerCase()
  );
  if (directMatch) return directMatch;

  // Normalized matching for "SILVER III", "silver-3", etc.
  const parts = raw.split(/[\s-_]+/);
  if (parts.length > 0) {
    const tierPart = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    const divPart = parts[1] ? parts[1].toUpperCase() : '';
    const candidate = `${tierPart} ${divPart}`.trim();
    const matched = RANKING_TIERS.find((t) => t.name.toLowerCase() === candidate.toLowerCase());
    if (matched) return matched;
  }

  return RANKING_TIERS[0];
}
