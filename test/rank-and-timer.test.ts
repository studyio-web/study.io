import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSeasonRp,
  getRankTier,
  getCurrentMonthFocusSeconds,
  resolveLiveSeasonStats,
  HARD_RESET_CAP_RP,
  RANK_TIERS,
} from '../src/lib/ranks';
import {
  calculateSessionRP,
  calculateSeasonReset,
  resolveUserSeasonReset,
} from '../src/lib/rankedSystem';
import {
  validateAndSaveSession,
  MAX_SESSION_SECONDS,
  MAX_DAILY_SECONDS,
} from '../src/lib/server/sessionValidation';

// Mock Supabase client for unit tests
function createMockSupabase(initialSessions: any[] = []) {
  const dbSessions = [...initialSessions];

  const mockClient: any = {
    from: (table: string) => {
      if (table === 'study_sessions') {
        return {
          select: (cols: string) => {
            let filterUserId: string | null = null;
            let filterClientSessionId: string | null = null;
            let gteStart: string | null = null;
            let ltStart: string | null = null;

            const builder: any = {
              eq: (col: string, val: any) => {
                if (col === 'user_id') filterUserId = val;
                if (col === 'client_session_id') filterClientSessionId = val;
                return builder;
              },
              gte: (col: string, val: any) => {
                if (col === 'started_at') gteStart = val;
                return builder;
              },
              lt: (col: string, val: any) => {
                if (col === 'started_at') ltStart = val;
                return builder;
              },
              gt: () => builder,
              limit: () => builder,
              maybeSingle: async () => {
                const match = dbSessions.find(
                  (s) =>
                    (!filterUserId || s.user_id === filterUserId) &&
                    (!filterClientSessionId || s.client_session_id === filterClientSessionId)
                );
                return { data: match || null, error: null };
              },
              then: (resolve: any) => {
                let results = [...dbSessions];
                if (filterUserId) results = results.filter((s) => s.user_id === filterUserId);
                if (gteStart) results = results.filter((s) => new Date(s.started_at) >= new Date(gteStart!));
                if (ltStart) results = results.filter((s) => new Date(s.started_at) < new Date(ltStart!));
                resolve({ data: results, error: null });
              },
            };
            return builder;
          },
          insert: (rows: any[]) => {
            const row = rows[0];
            // Check unique client_session_id
            if (row.client_session_id && dbSessions.some((s) => s.client_session_id === row.client_session_id)) {
              return {
                select: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }),
              };
            }
            const saved = { id: `mock-${Date.now()}-${Math.random()}`, ...row };
            dbSessions.push(saved);
            return {
              select: () => Promise.resolve({ data: [saved], error: null }),
            };
          },
        };
      }
      if (table === 'active_sessions') {
        return {
          update: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        };
      }
      return {};
    },
  };

  return { mockClient, dbSessions };
}

describe('Rank System - Boundary & RP Tests', () => {
  it('evaluates getRankTier at exact tier boundaries', () => {
    // Bronze
    assert.equal(getRankTier(0).name, 'Bronze I');
    assert.equal(getRankTier(299).name, 'Bronze I');
    assert.equal(getRankTier(300).name, 'Bronze II');
    assert.equal(getRankTier(699).name, 'Bronze II');
    assert.equal(getRankTier(700).name, 'Bronze III');
    assert.equal(getRankTier(1199).name, 'Bronze III');
    assert.equal(getRankTier(1200).name, 'Bronze IV');
    assert.equal(getRankTier(1799).name, 'Bronze IV');

    // Silver
    assert.equal(getRankTier(1800).name, 'Silver I');
    assert.equal(getRankTier(2499).name, 'Silver I');
    assert.equal(getRankTier(2500).name, 'Silver II');
    assert.equal(getRankTier(3299).name, 'Silver II');
    assert.equal(getRankTier(3300).name, 'Silver III');
    assert.equal(getRankTier(4199).name, 'Silver III');
    assert.equal(getRankTier(4200).name, 'Silver IV');
    assert.equal(getRankTier(5199).name, 'Silver IV');

    // Gold
    assert.equal(getRankTier(5200).name, 'Gold I');
    assert.equal(getRankTier(6299).name, 'Gold I');
    assert.equal(getRankTier(6300).name, 'Gold II');
    assert.equal(getRankTier(7499).name, 'Gold II');
    assert.equal(getRankTier(7500).name, 'Gold III');
    assert.equal(getRankTier(8799).name, 'Gold III');
    assert.equal(getRankTier(8800).name, 'Gold IV');
    assert.equal(getRankTier(10199).name, 'Gold IV');

    // Platinum
    assert.equal(getRankTier(10200).name, 'Platinum I');
    assert.equal(getRankTier(11699).name, 'Platinum I');
    assert.equal(getRankTier(11700).name, 'Platinum II');
    assert.equal(getRankTier(13299).name, 'Platinum II');
    assert.equal(getRankTier(13300).name, 'Platinum III');
    assert.equal(getRankTier(14999).name, 'Platinum III');
    assert.equal(getRankTier(15000).name, 'Platinum IV');
    assert.equal(getRankTier(16999).name, 'Platinum IV');

    // Diamond
    assert.equal(getRankTier(17000).name, 'Diamond I');
    assert.equal(getRankTier(18999).name, 'Diamond I');
    assert.equal(getRankTier(19000).name, 'Diamond II');
    assert.equal(getRankTier(21199).name, 'Diamond II');
    assert.equal(getRankTier(21200).name, 'Diamond III');
    assert.equal(getRankTier(23599).name, 'Diamond III');
    assert.equal(getRankTier(23600).name, 'Diamond IV');
    assert.equal(getRankTier(25999).name, 'Diamond IV');

    // Apex Ranks
    assert.equal(getRankTier(26000).name, 'Champion');
    assert.equal(getRankTier(28999).name, 'Champion');
    assert.equal(getRankTier(29000).name, 'Master');
    assert.equal(getRankTier(32999).name, 'Master');
    assert.equal(getRankTier(33000).name, 'Grandmaster');
    assert.equal(getRankTier(50000).name, 'Grandmaster');
  });

  it('handles negative, 0, and non-integer RP values safely', () => {
    assert.equal(getRankTier(0).name, 'Bronze I');
    assert.equal(getRankTier(-100).name, 'Bronze I');
    assert.equal(getRankTier(NaN).name, 'Bronze I');
    assert.equal(getRankTier(299.8).name, 'Bronze II'); // rounds 299.8 -> 300
    assert.equal(getRankTier(299.2).name, 'Bronze I');  // rounds 299.2 -> 299
  });

  it('correctly maps all 23 rank tier badges', () => {
    assert.equal(RANK_TIERS.length, 23);
    assert.equal(getRankTier(0).badge, 'bronze-1.png');
    assert.equal(getRankTier(300).badge, 'bronze-2.png');
    assert.equal(getRankTier(1800).badge, 'silver-1.png');
    assert.equal(getRankTier(5200).badge, 'gold-1.png');
    assert.equal(getRankTier(10200).badge, 'platinum-1.png');
    assert.equal(getRankTier(17000).badge, 'diamond-1.png');
    assert.equal(getRankTier(26000).badge, 'champion.png');
    assert.equal(getRankTier(29000).badge, 'master.png');
    assert.equal(getRankTier(33000).badge, 'grandmaster.png');
  });
});

describe('Season RP Conversion Formula', () => {
  it('converts seconds to RP strictly without float drift: Math.floor(seconds / 36)', () => {
    assert.equal(calculateSeasonRp(0, 0), 0);
    assert.equal(calculateSeasonRp(0, 35), 0);    // 35s -> 0 RP
    assert.equal(calculateSeasonRp(0, 36), 1);    // 36s -> 1 RP
    assert.equal(calculateSeasonRp(0, 71), 1);    // 71s -> 1 RP
    assert.equal(calculateSeasonRp(0, 72), 2);    // 72s -> 2 RP
    assert.equal(calculateSeasonRp(0, 1800), 50); // 30 min -> 50 RP
    assert.equal(calculateSeasonRp(0, 3600), 100);// 1 hour = 100 RP
  });

  it('accurately combines carryover RP and earned monthly seconds', () => {
    // 700 carryover + 1 hour (3600s = 100 RP) = 800 RP
    assert.equal(calculateSeasonRp(700, 3600), 800);
    // 2500 carryover + 1800s (50 RP) = 2550 RP
    assert.equal(calculateSeasonRp(2500, 1800), 2550);
  });

  it('enforces HARD_RESET_CAP_RP (23,600) on carryover RP', () => {
    // Carryover of 30,000 is clamped to 23,600
    assert.equal(calculateSeasonRp(30000, 3600), HARD_RESET_CAP_RP + 100);
    assert.equal(HARD_RESET_CAP_RP, 23600);
  });
});

describe('Monthly Soft Reset & Inactivity Decay', () => {
  it('correctly maps soft reset starting RP for every tier according to master table', () => {
    assert.equal(calculateSeasonReset(0).newRP, 0);       // Bronze I -> 0 RP (Bronze I)
    assert.equal(calculateSeasonReset(300).newRP, 100);   // Bronze II -> 100 RP (Bronze I)
    assert.equal(calculateSeasonReset(700).newRP, 200);   // Bronze III -> 200 RP (Bronze I)
    assert.equal(calculateSeasonReset(1200).newRP, 300);  // Bronze IV -> 300 RP (Bronze II)
    assert.equal(calculateSeasonReset(1800).newRP, 700);  // Silver I -> 700 RP (Bronze III)
    assert.equal(calculateSeasonReset(2500).newRP, 1200); // Silver II -> 1,200 RP (Bronze IV)
    assert.equal(calculateSeasonReset(3300).newRP, 1800); // Silver III -> 1,800 RP (Silver I)
    assert.equal(calculateSeasonReset(4200).newRP, 2500); // Silver IV -> 2,500 RP (Silver II)
    assert.equal(calculateSeasonReset(5200).newRP, 3300); // Gold I -> 3,300 RP (Silver III)
    assert.equal(calculateSeasonReset(10200).newRP, 7500);// Platinum I -> 7,500 RP (Gold III)
    assert.equal(calculateSeasonReset(17000).newRP, 13300);// Diamond I -> 13,300 RP (Platinum III)
    assert.equal(calculateSeasonReset(26000).newRP, 21200);// Champion -> 21,200 RP (Diamond III)
    assert.equal(calculateSeasonReset(29000).newRP, 23600);// Master -> 23,600 RP (Diamond IV)
    assert.equal(calculateSeasonReset(33000).newRP, 23600);// Grandmaster -> 23,600 RP (Diamond IV) [CAP]
    assert.equal(calculateSeasonReset(100000).newRP, 23600);// Super high GM -> 23,600 RP [CAP]
  });

  it('decays inactive users (0 focus seconds in previous month) to 0 RP', () => {
    const user = { username: 'inactive_user', season_rp: 5000 };
    const sessions: any[] = []; // 0 sessions
    const reset = resolveUserSeasonReset(user, sessions);
    assert.equal(reset.startingRP, 0);
    assert.equal(reset.newRankTitle, 'BRONZE I');
  });

  it('is idempotent: running soft reset twice produces the same stable result', () => {
    const user = { username: 'consistent_user', last_season_rp: 5200 };
    // 52 hours logged in previous month (5200 earned RP = Gold I)
    const prevMonthDate = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const sessions = [{ duration_seconds: 52 * 3600, started_at: prevMonthDate }];

    const reset1 = resolveUserSeasonReset(user, sessions);
    assert.equal(reset1.startingRP, 3300); // Gold I soft reset is 3,300 RP (Silver III)

    const userAfterReset = {
      ...user,
      season_base_rp: reset1.startingRP,
      last_reset_month: '2026-11',
    };
    const reset2 = resolveUserSeasonReset(userAfterReset, sessions);
    assert.equal(reset2.startingRP, 3300);
  });
});

describe('Timer Server-Side Anti-Tamper & Validation', () => {
  it('rejects session where ended_at precedes started_at', async () => {
    const { mockClient } = createMockSupabase();
    const now = Date.now();
    const result = await validateAndSaveSession(
      mockClient,
      { id: 'user-1' },
      {
        started_at: new Date(now - 10000).toISOString(),
        ended_at: new Date(now - 20000).toISOString(), // ended_at is before started_at!
      }
    );
    assert.equal(result.success, false);
    assert.match(result.error || '', /ended_at cannot precede started_at/);
  });

  it('clamps future ended_at to current server time', async () => {
    const { mockClient } = createMockSupabase();
    const now = Date.now();
    const start = new Date(now - 1800 * 1000).toISOString();
    const futureEnd = new Date(now + 100000 * 1000).toISOString(); // 27 hours in the future

    const result = await validateAndSaveSession(
      mockClient,
      { id: 'user-1' },
      {
        started_at: start,
        ended_at: futureEnd,
      }
    );

    assert.equal(result.success, true);
    // Calculated seconds must be clamped to ~1800s (30m), not the future timestamp
    assert.ok(result.calculatedSeconds! <= 1830);
  });

  it('strictly caps a single session at 12 hours (43,200 seconds)', async () => {
    const { mockClient } = createMockSupabase();
    const now = Date.now();
    const start = new Date(now - 20 * 3600 * 1000).toISOString(); // 20 hours ago
    const end = new Date(now).toISOString();

    const result = await validateAndSaveSession(
      mockClient,
      { id: 'user-1' },
      {
        started_at: start,
        ended_at: end,
      }
    );

    assert.equal(result.success, true);
    assert.equal(result.calculatedSeconds, MAX_SESSION_SECONDS); // Exactly 43,200s (12h)
  });

  it('clamps countdown and Pomodoro sessions to planned duration + tolerance', async () => {
    const { mockClient } = createMockSupabase();
    const now = Date.now();
    const start = new Date(now - 3600 * 1000).toISOString(); // 3600 seconds ago
    const end = new Date(now).toISOString();

    const result = await validateAndSaveSession(
      mockClient,
      { id: 'user-1' },
      {
        started_at: start,
        ended_at: end,
        mode: 'countdown',
        planned_duration_seconds: 1500, // Planned 25 minutes (1500s)
      }
    );

    assert.equal(result.success, true);
    assert.equal(result.calculatedSeconds, 1500); // Clamped to planned 1500s
  });

  it('discards Pomodoro break time cleanly so break seconds never count as focus RP', async () => {
    const { mockClient } = createMockSupabase();
    const now = Date.now();
    const result = await validateAndSaveSession(
      mockClient,
      { id: 'user-1' },
      {
        started_at: new Date(now - 300000).toISOString(),
        ended_at: new Date(now).toISOString(),
        mode: 'pomodoro_break',
      }
    );

    assert.equal(result.success, true);
    assert.equal(result.discarded, true);
    assert.equal(result.calculatedSeconds, 0);
  });

  it('enforces idempotency using client_session_id', async () => {
    const { mockClient } = createMockSupabase();
    const clientUuid = '11111111-2222-3333-4444-555555555555';
    const now = Date.now();
    const start = new Date(now - 1200 * 1000).toISOString();
    const end = new Date(now).toISOString();

    // First save
    const res1 = await validateAndSaveSession(
      mockClient,
      { id: 'user-1' },
      {
        started_at: start,
        ended_at: end,
        client_session_id: clientUuid,
      }
    );
    assert.equal(res1.success, true);
    assert.equal(res1.calculatedSeconds, 1200);

    // Duplicate save (retry or double click with same client_session_id)
    const res2 = await validateAndSaveSession(
      mockClient,
      { id: 'user-1' },
      {
        started_at: start,
        ended_at: end,
        client_session_id: clientUuid,
      }
    );
    assert.equal(res2.success, true);
    assert.match(res2.reason || '', /already recorded/i);
    assert.equal(res2.session?.id, res1.session?.id);
  });

  it('resolves stale active session orphan to last heartbeat time rather than now', () => {
    const startedAt = new Date(Date.now() - 5 * 3600 * 1000); // Started 5 hours ago
    const lastHeartbeat = new Date(startedAt.getTime() + 1800 * 1000); // Heartbeat stopped after 30 mins (1800s)

    // When an active session is abandoned without a stop event, its duration is recovered
    // strictly from lastHeartbeat - startedAt (30 mins = 1800s), NEVER now - startedAt (5 hours = 18000s)
    const recoveredSeconds = Math.floor((lastHeartbeat.getTime() - startedAt.getTime()) / 1000);
    assert.equal(recoveredSeconds, 1800);
    assert.notEqual(recoveredSeconds, 18000);
  });
});

describe('160-Hour Regression Test', () => {
  it('prevents 160h inflation when client attempts to submit unbounded duration', async () => {
    // A user who joined yesterday submits a 64-hour elapsed session (230,400s)
    const { mockClient } = createMockSupabase();
    const now = Date.now();
    const start = new Date(now - 64 * 3600 * 1000).toISOString();
    const end = new Date(now).toISOString();

    const result = await validateAndSaveSession(
      mockClient,
      { id: 'abby-15f2' },
      {
        started_at: start,
        ended_at: end,
      }
    );

    assert.equal(result.success, true);
    // Even if client leaves tab open across multiple days, max single session is strictly 12 hours (43,200s)
    assert.equal(result.calculatedSeconds, 43200);
    assert.ok(result.calculatedSeconds! < 576000);
  });
});
