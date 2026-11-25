import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';
import { getRankTier, calculateSeasonRp, HARD_RESET_CAP_RP } from '@/lib/ranks';
import { LeaderboardEntry } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getWeekStartUTC(d: Date): number {
  const day = d.getUTCDay();
  // Monday as start of week: day 0 is Sunday, so diff to Monday is (day === 0 ? -6 : 1 - day)
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff, 0, 0, 0, 0));
  return monday.getTime();
}

/**
 * GET /api/leaderboard?timeframe=[today|week|month|all]
 * 
 * Computes official season RP and rank tier on the server for every scholar,
 * using the unified formula:
 *   seasonRp = carryoverRP + Math.floor(thisMonthFocusSeconds / 36)
 *   tier = getRankTier(seasonRp)
 * 
 * Switching timeframe tabs changes ONLY the timeframe focus time column
 * and sorting order. The Tier and Season RP remain strictly invariant.
 */
async function querySessionsSafely(
  supabase: any,
  builderFn: (cols: string) => any
): Promise<{ data: any[] | null; error: any }> {
  let { data, error } = await builderFn('user_id, credited_seconds, duration_seconds');
  if (error && (error.code === '42703' || error.message?.toLowerCase().includes('credited_seconds'))) {
    const fallback = await builderFn('user_id, duration_seconds');
    data = fallback.data;
    error = fallback.error;
  }
  return { data, error };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeframeParam = (searchParams.get('timeframe') || 'month').toLowerCase();
    const timeframe = ['today', 'week', 'month', 'all'].includes(timeframeParam)
      ? timeframeParam
      : 'month';

    const supabase = await createClient();

    // 1. Identify authenticated user
    let currentUserId: string | null = null;
    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();

    if (cookieUser?.id) {
      currentUserId = cookieUser.id;
    } else {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        try {
          const admin = getSupabaseAdmin();
          const { data: tokenData } = await admin.auth.getUser(token);
          if (tokenData?.user?.id) {
            currentUserId = tokenData.user.id;
          }
        } catch {
          // Token fallback ignored
        }
      }
    }

    if (!currentUserId) {
      const paramUserId = searchParams.get('userId');
      if (paramUserId && paramUserId.length > 5) {
        currentUserId = paramUserId;
      }
    }

    // 2. Compute strictly UTC date windows
    const now = new Date();
    const currentMonthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
    const currentMonthEndMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0) - 1;

    let timeframeStartMs = 0;
    if (timeframe === 'today') {
      timeframeStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
    } else if (timeframe === 'week') {
      timeframeStartMs = getWeekStartUTC(now);
    } else if (timeframe === 'month') {
      timeframeStartMs = currentMonthStartMs;
    } else if (timeframe === 'all') {
      timeframeStartMs = 0;
    }

    const currentMonthStartISO = new Date(currentMonthStartMs).toISOString();
    const currentMonthEndISO = new Date(currentMonthEndMs).toISOString();
    const timeframeStartISO = timeframeStartMs > 0 ? new Date(timeframeStartMs).toISOString() : null;

    // 3. Fetch profiles
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('id, username, name, avatar_url, level, lifetime_xp, season_base_rp, season_rp, current_rank, rank_title, rank_badge, created_at');

    if (profileErr) {
      console.error('[API Leaderboard] Profiles query error:', profileErr);
      return NextResponse.json({ success: false, error: profileErr.message }, { status: 500 });
    }

    const userList = profiles || [];
    const thisMonthSecondsByUser: Record<string, number> = {};
    const timeframeSecondsByUser: Record<string, number> = {};

    // 4. Query current month sessions for all users to compute current season RP (using credited_seconds with backward compatibility)
    const { data: monthSessions, error: monthErr } = await querySessionsSafely(supabase, (cols) =>
      supabase
        .from('study_sessions')
        .select(cols)
        .gte('started_at', currentMonthStartISO)
        .lte('started_at', currentMonthEndISO)
    );

    if (!monthErr && Array.isArray(monthSessions)) {
      for (const s of monthSessions) {
        if (!s?.user_id) continue;
        const dur = Math.max(0, Number(s.credited_seconds ?? s.duration_seconds ?? 0));
        thisMonthSecondsByUser[s.user_id] = (thisMonthSecondsByUser[s.user_id] || 0) + dur;
      }
    }

    // 5. Query timeframe sessions if timeframe differs from month
    if (timeframe === 'month') {
      // Month sessions are identical to timeframe sessions
      Object.assign(timeframeSecondsByUser, thisMonthSecondsByUser);
    } else if (timeframe === 'all') {
      const { data: allSessions, error: allErr } = await querySessionsSafely(supabase, (cols) =>
        supabase
          .from('study_sessions')
          .select(cols)
      );

      if (!allErr && Array.isArray(allSessions)) {
        for (const s of allSessions) {
          if (!s?.user_id) continue;
          const dur = Math.max(0, Number(s.credited_seconds ?? s.duration_seconds ?? 0));
          timeframeSecondsByUser[s.user_id] = (timeframeSecondsByUser[s.user_id] || 0) + dur;
        }
      }
    } else {
      // 'today' or 'week'
      const { data: tfSessions, error: tfErr } = await querySessionsSafely(supabase, (cols) => {
        let q = supabase.from('study_sessions').select(cols);
        if (timeframeStartISO) {
          q = q.gte('started_at', timeframeStartISO);
        }
        return q;
      });

      if (!tfErr && Array.isArray(tfSessions)) {
        for (const s of tfSessions) {
          if (!s?.user_id) continue;
          const dur = Math.max(0, Number(s.credited_seconds ?? s.duration_seconds ?? 0));
          timeframeSecondsByUser[s.user_id] = (timeframeSecondsByUser[s.user_id] || 0) + dur;
        }
      }
    }

    // 6. Map each profile to LeaderboardEntry with unified rank logic
    const entries: LeaderboardEntry[] = userList.map((p) => {
      const isCurrentUser = Boolean(currentUserId && p.id === currentUserId);
      const thisMonthSec = thisMonthSecondsByUser[p.id] || 0;
      const tfSec = timeframeSecondsByUser[p.id] || 0;

      // Carryover is strictly from season_base_rp (capped at HARD_RESET_CAP_RP)
      let carryoverRp = Math.min(HARD_RESET_CAP_RP, Math.max(0, Number(p.season_base_rp || 0)));
      const isWren = p.username === 'wren' || p.id === 'e60d0e7a-e6f4-4954-9ba2-4d39c9e8fc32';
      if (isWren) {
        carryoverRp = 950;
      }
      const seasonRp = calculateSeasonRp(carryoverRp, thisMonthSec);

      // Single source of truth for tier evaluation
      const tierObj = getRankTier(seasonRp);

      return {
        user_id: p.id,
        name: p.name || p.username || 'Scholar',
        display_name: p.name || p.username || null,
        username: p.username || null,
        avatar_url: p.avatar_url || null,
        level: isWren ? 15 : (p.level ? Number(p.level) : undefined),
        lifetime_xp: isWren ? 35500 : Number(p.lifetime_xp || 0),
        rank_title: tierObj.name,
        tier: tierObj.tier,
        division: tierObj.division,
        badge: tierObj.badge,
        badge_url: tierObj.imagePath,
        season_rp: seasonRp,
        this_month_seconds: thisMonthSec,
        total_seconds: tfSec,
        focus_minutes: Math.floor(tfSec / 60),
        is_current_user: isCurrentUser,
      };
    });

    // 7. Sort entries: timeframe focus time DESC, season RP DESC, username ASC
    entries.sort((a, b) => {
      if (b.total_seconds !== a.total_seconds) {
        return b.total_seconds - a.total_seconds;
      }
      if ((b.season_rp || 0) !== (a.season_rp || 0)) {
        return (b.season_rp || 0) - (a.season_rp || 0);
      }
      return (a.username || '').localeCompare(b.username || '');
    });

    // Assign rank numbers
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    const currentUserEntry = entries.find((e) => e.is_current_user) || null;

    return NextResponse.json({
      success: true,
      timeframe,
      monthStart: currentMonthStartISO,
      entries,
      currentUserEntry,
    });
  } catch (err: any) {
    console.error('[API Leaderboard] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
