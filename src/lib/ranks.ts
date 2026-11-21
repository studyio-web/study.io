import {
  RANK_TIERS as SYSTEM_RANK_TIERS,
  RankTierName,
  RankDivision,
  RankTierConfig,
  HARD_RESET_CAP_RP,
  calculateSeasonRp,
  getOldRankTierFromRp,
} from './rankedSystem';

export interface RankTier {
  tier: RankTierName;
  division: RankDivision;
  name: string;
  fullTitle: string;
  minRp: number;
  maxRp: number;
  minHours: number;
  softResetRp: number;
  softResetRank?: string;
  badge: string;
  imagePath: string;
}

export { HARD_RESET_CAP_RP, calculateSeasonRp, getOldRankTierFromRp };

function getBadgeFilename(config: RankTierConfig): string {
  if (config.imagePath) {
    return config.imagePath.replace('/images/ranks/', '').replace('/ranks/', '');
  }
  const tierLower = config.tier.toLowerCase();
  if (['champion', 'master', 'grandmaster'].includes(tierLower)) {
    return `${tierLower}.png`;
  }
  const divMap: Record<string, string> = {
    'I': '1', 'II': '2', 'III': '3', 'IV': '4',
    '1': '1', '2': '2', '3': '3', '4': '4',
  };
  const num = divMap[config.division] || '1';
  return `${tierLower}-${num}.png`;
}

export const RANK_TIERS: RankTier[] = SYSTEM_RANK_TIERS.map((cfg) => ({
  tier: cfg.tier,
  division: cfg.division,
  name: cfg.division ? `${cfg.tier} ${cfg.division}` : cfg.tier,
  fullTitle: cfg.fullTitle || (cfg.division ? `${cfg.tier} ${cfg.division}` : cfg.tier),
  minRp: cfg.minRP,
  maxRp: cfg.maxRP,
  minHours: cfg.minHours ?? (cfg.minRP / 100),
  softResetRp: cfg.softResetRP ?? 0,
  softResetRank: cfg.softResetRank,
  badge: getBadgeFilename(cfg),
  imagePath: cfg.imagePath || `/images/ranks/${getBadgeFilename(cfg)}`,
}));

export function getSessionTimestamp(s: any): number {
  if (!s || typeof s !== 'object') return 0;
  const raw = s.startTime || s.started_at || s.startedAt || s.createdAt || s.created_at || s.date;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return isNaN(t) ? 0 : t;
}

export function getSessionDurationSeconds(s: any): number {
  if (!s || typeof s !== 'object') return 0;
  let dur = Number(s.durationSeconds ?? s.duration_seconds ?? s.duration ?? s.seconds ?? 0);

  // If active session currently running without fixed duration:
  if ((s.status === 'running' || s.status === 'paused') && s.started_at) {
    const startMs = new Date(s.started_at).getTime();
    if (!isNaN(startMs)) {
      const accum = Number(s.accumulated_seconds || 0);
      const liveRunning = s.status === 'running' ? Math.max(0, Math.floor((Date.now() - startMs) / 1000)) : 0;
      dur = accum + liveRunning;
    }
  }

  // Clip stopwatch sessions at confirmed_until and 24-hour absolute cap (stopwatch only)
  if (s.mode === 'stopwatch' && !s.planned_end_at) {
    if (s.confirmed_until) {
      const confMs = new Date(s.confirmed_until).getTime();
      const startMs = s.started_at ? new Date(s.started_at).getTime() : 0;
      if (!isNaN(confMs) && startMs > 0) {
        const maxConfSec = Math.max(0, Math.floor((confMs - startMs) / 1000));
        dur = Math.min(dur, maxConfSec, 86400);
      } else {
        dur = Math.min(dur, 43200);
      }
    } else {
      dur = Math.min(dur, 43200); // 12 hours unconfirmed cap
    }
    dur = Math.min(dur, 86400); // 24 hours absolute maximum cap
  } else if (s.planned_end_at || s.mode === 'countdown' || s.mode === 'pomodoro') {
    // Countdown / Pomodoro / Ultra: never clipped by 12h rule; capped at planned duration (up to 25h max with extension)
    let plannedSec = Number(s.pomodoro_duration_seconds || s.planned_duration_seconds || 0);
    if (!plannedSec && s.planned_end_at && s.started_at) {
      const startMs = new Date(s.started_at).getTime();
      const endMs = new Date(s.planned_end_at).getTime();
      if (!isNaN(startMs) && !isNaN(endMs)) {
        plannedSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
      }
    }
    if (plannedSec > 0) {
      dur = Math.min(dur, Math.min(plannedSec, 90000));
    }
  }

  return Math.max(0, dur);
}

/**
 * Calculates current month focus seconds strictly using UTC month boundaries.
 * Month boundaries must be strictly UTC:
 * startOfMonth = Date.UTC(year, month, 1, 0, 0, 0)
 * endOfMonth = Date.UTC(year, month + 1, 1, 0, 0, 0) - 1
 */
export function getCurrentMonthFocusSeconds(sessions: any[], referenceDate?: Date): number {
  if (!Array.isArray(sessions) || sessions.length === 0) return 0;
  const d = referenceDate || new Date();
  const startOfMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0) - 1;

  return sessions
    .filter((s) => {
      const t = getSessionTimestamp(s);
      return t >= startOfMonth && t <= endOfMonth;
    })
    .reduce((sum, s) => sum + Math.max(0, Math.floor(getSessionDurationSeconds(s))), 0);
}

/**
 * Single source of truth to evaluate RankTier from total/season RP
 */
export function getRankTier(totalRp: number): RankTier {
  const safeRp = Math.max(0, Math.round(totalRp || 0));
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (safeRp >= RANK_TIERS[i].minRp) {
      return RANK_TIERS[i];
    }
  }
  return RANK_TIERS[0];
}

export function getMaxRpForTier(tierName: string): number {
  if (!tierName) return 999999;
  const clean = tierName.trim().toLowerCase();
  const idx = RANK_TIERS.findIndex(
    r => r.name.toLowerCase() === clean ||
      (r.division === '' && r.tier.toLowerCase() === clean)
  );
  if (idx === -1 || idx === RANK_TIERS.length - 1) return 999999;
  return RANK_TIERS[idx + 1].minRp;
}

export function getNextTier(tierName: string): RankTier | null {
  if (!tierName) return null;
  const clean = tierName.trim().toLowerCase();
  const idx = RANK_TIERS.findIndex(
    r => r.name.toLowerCase() === clean ||
      (r.division === '' && r.tier.toLowerCase() === clean)
  );
  if (idx === -1 || idx === RANK_TIERS.length - 1) return null;
  return RANK_TIERS[idx + 1];
}

// Backwards compatibility aliases
export type { RankTierName, RankDivision };

export const RANKS = RANK_TIERS;
export const getRankFromRp = getRankTier;
export const calculateRpFromSeconds = (seconds: number) => calculateSeasonRp(0, seconds);
export const getSoftResetRp = (rp: number) => getRankTier(rp).softResetRp;

/**
 * Resolves the user's accurate live season RP and rank tier in the current month.
 * Guarantees that season RP never collapses below the soft-reset starting RP baseline,
 * even before Supabase profile hydration or when current month study seconds is 0.
 */
export function resolveLiveSeasonStats(
  user: any,
  sessions: any[] = []
): {
  seasonRp: number;
  currentTier: RankTier;
  rankTier: RankTier;
  nextTier: RankTier | null;
  progressPercent: number;
  startingRp: number;
  currentMonthSeconds: number;
  rankTitle: string;
} {
  const rawCarryover = Number(user?.season_base_rp ?? user?.carryover_rp ?? 0);
  const startingRp = Math.min(HARD_RESET_CAP_RP, Math.max(0, rawCarryover));

  const currentMonthSeconds = getCurrentMonthFocusSeconds(sessions || []);
  const finalSeasonRp = calculateSeasonRp(startingRp, currentMonthSeconds);
  const currentTier = getRankTier(finalSeasonRp);
  const nextTier = getNextTier(currentTier.name);

  let progressPercent = 100;
  if (nextTier) {
    const tierMin = currentTier.minRp;
    const tierMax = nextTier.minRp;
    progressPercent = Math.min(100, Math.max(0, Math.round(((finalSeasonRp - tierMin) / (tierMax - tierMin)) * 100)));
  }

  return {
    seasonRp: finalSeasonRp,
    currentTier,
    rankTier: currentTier,
    nextTier,
    progressPercent,
    startingRp,
    currentMonthSeconds,
    rankTitle: currentTier.name,
  };
}
