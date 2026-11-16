import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabaseAdmin';
import { getRankTier, HARD_RESET_CAP_RP } from '../ranks';

export interface SeasonResetResult {
  success: boolean;
  seasonId: string;
  previousSeasonId: string;
  totalUsersScanned: number;
  usersReset: number;
  usersSkippedAlreadyReset: number;
  snapshots: {
    userId: string;
    username: string;
    previousSeasonRp: number;
    previousTier: string;
    newCarryoverRp: number;
    newTier: string;
    wasInactive: boolean;
  }[];
  error?: string;
}

/**
 * Calculates current UTC season ID ("YYYY-MM") and previous season ID
 */
export function getUtcSeasonIds(referenceDate: Date = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth(); // 0-indexed

  const currentSeasonId = `${year}-${String(month + 1).padStart(2, '0')}`;

  const prevMonthDate = new Date(Date.UTC(year, month - 1, 1));
  const prevYear = prevMonthDate.getUTCFullYear();
  const prevMonth = prevMonthDate.getUTCMonth();
  const previousSeasonId = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;

  const prevMonthStartUTC = Date.UTC(prevYear, prevMonth, 1, 0, 0, 0, 0);
  const prevMonthEndUTC = Date.UTC(year, month, 1, 0, 0, 0, 0) - 1;

  return {
    currentSeasonId,
    previousSeasonId,
    prevMonthStartUTC,
    prevMonthEndUTC,
  };
}

/**
 * Executes the authoritative Monthly Soft Rank Reset.
 * 
 * Rules:
 * 1. Evaluated strictly using UTC month boundaries.
 * 2. Idempotency: Uses last_reset_month column. Running multiple times for the same
 *    season will NOT double-reset or corrupt user stats.
 * 3. Master Soft Reset Table: Maps previous final Season RP to new season carryover RP.
 * 4. Inactive Decay: Users who logged 0 focus seconds in the expiring month decay to 0 RP (Bronze I).
 * 5. Grandmaster Cap: Carryover RP is strictly capped at 23,600 RP (Diamond IV).
 * 6. Historical Snapshot: Records previous season rank & final stats.
 */
export async function executeMonthlySeasonReset(
  client?: SupabaseClient,
  customReferenceDate?: Date
): Promise<SeasonResetResult> {
  const admin = getSupabaseAdmin();
  const dbClient = admin || client;

  if (!dbClient) {
    throw new Error('Supabase client is required to execute monthly season reset.');
  }

  const { currentSeasonId, previousSeasonId, prevMonthStartUTC, prevMonthEndUTC } =
    getUtcSeasonIds(customReferenceDate);

  console.log(`[Season Reset] Initializing reset for Season ${currentSeasonId} (Previous: ${previousSeasonId})...`);

  // 1. Fetch all profiles
  const { data: profiles, error: profileErr } = await dbClient
    .from('profiles')
    .select('id, username, name, season_base_rp, season_rp, last_reset_month, last_season_rank, rank_title');

  if (profileErr || !profiles) {
    console.error('[Season Reset] Error querying profiles:', profileErr);
    return {
      success: false,
      seasonId: currentSeasonId,
      previousSeasonId,
      totalUsersScanned: 0,
      usersReset: 0,
      usersSkippedAlreadyReset: 0,
      snapshots: [],
      error: profileErr?.message || 'Failed to query user profiles.',
    };
  }

  // 2. Fetch all study sessions from previous season month (UTC)
  const { data: prevMonthSessions, error: sessErr } = await dbClient
    .from('study_sessions')
    .select('user_id, duration_seconds, started_at')
    .gte('started_at', new Date(prevMonthStartUTC).toISOString())
    .lte('started_at', new Date(prevMonthEndUTC).toISOString());

  if (sessErr) {
    console.warn('[Season Reset] Warning querying previous month study sessions:', sessErr);
  }

  // Group previous sessions by user
  const userPrevSecondsMap = new Map<string, number>();
  (prevMonthSessions || []).forEach((s) => {
    if (!s.user_id) return;
    const current = userPrevSecondsMap.get(s.user_id) || 0;
    userPrevSecondsMap.set(s.user_id, current + Math.max(0, Number(s.duration_seconds || 0)));
  });

  const snapshots: SeasonResetResult['snapshots'] = [];
  let usersReset = 0;
  let usersSkipped = 0;

  for (const profile of profiles) {
    // IDEMPOTENCY GUARD:
    // If user's last_reset_month already matches currentSeasonId, skip!
    if (profile.last_reset_month === currentSeasonId) {
      usersSkipped++;
      continue;
    }

    const prevMonthSeconds = userPrevSecondsMap.get(profile.id) || 0;
    const wasInactive = prevMonthSeconds === 0;

    let previousFinalSeasonRp = 0;
    let newCarryoverRp = 0;
    let previousTierObj = getRankTier(0);

    if (wasInactive) {
      // Inactive Decay: 0 focus hours logged -> reset carryover to 0 RP
      previousFinalSeasonRp = Number(profile.season_rp || 0);
      previousTierObj = getRankTier(previousFinalSeasonRp);
      newCarryoverRp = 0; // Inactive decay
    } else {
      // User was active: Season RP = previous base carryover + Math.floor(prevMonthSeconds / 36)
      const prevBase = Number(profile.season_base_rp || 0);
      previousFinalSeasonRp = prevBase + Math.floor(prevMonthSeconds / 36);
      previousTierObj = getRankTier(previousFinalSeasonRp);

      // Look up soft reset RP from master table
      const rawCarryover = previousTierObj.softResetRp ?? 0;
      // Grandmaster Cap: strictly capped at 23,600 RP
      newCarryoverRp = Math.min(HARD_RESET_CAP_RP, Math.max(0, rawCarryover));
    }

    const newTierObj = getRankTier(newCarryoverRp);

    // Apply update to user's profile
    const updatePayload = {
      season_base_rp: newCarryoverRp,
      season_rp: newCarryoverRp,
      last_reset_month: currentSeasonId,
      last_season_rank: previousTierObj.name,
      last_season_rp: previousFinalSeasonRp,
      rank_title: newTierObj.name,
      current_rank: newTierObj.name,
      rank_badge: `/images/ranks/${newTierObj.badge}`,
    };

    const { error: updateErr } = await dbClient
      .from('profiles')
      .update(updatePayload)
      .eq('id', profile.id);

    if (updateErr) {
      console.error(`[Season Reset] Error updating profile for user ${profile.id}:`, updateErr);
    } else {
      usersReset++;
      snapshots.push({
        userId: profile.id,
        username: profile.username || profile.name || profile.id.substring(0, 8),
        previousSeasonRp: previousFinalSeasonRp,
        previousTier: previousTierObj.name,
        newCarryoverRp,
        newTier: newTierObj.name,
        wasInactive,
      });
    }
  }

  console.log(`[Season Reset] Completed: ${usersReset} users reset, ${usersSkipped} skipped (already reset).`);

  return {
    success: true,
    seasonId: currentSeasonId,
    previousSeasonId,
    totalUsersScanned: profiles.length,
    usersReset,
    usersSkippedAlreadyReset: usersSkipped,
    snapshots,
  };
}
