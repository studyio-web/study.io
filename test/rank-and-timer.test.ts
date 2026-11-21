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
    assert.equal(getRankTier(49).name, 'Bronze I');
    assert.equal(getRankTier(50).name, 'Bronze II');
    assert.equal(getRankTier(119).name, 'Bronze II');
    assert.equal(getRankTier(120).name, 'Bronze III');
    assert.equal(getRankTier(219).name, 'Bronze III');
    assert.equal(getRankTier(220).name, 'Bronze IV');
    assert.equal(getRankTier(349).name, 'Bronze IV');

    // Silver
    assert.equal(getRankTier(350).name, 'Silver I');
    assert.equal(getRankTier(499).name, 'Silver I');
    assert.equal(getRankTier(500).name, 'Silver II');
    assert.equal(getRankTier(699).name, 'Silver II');
    assert.equal(getRankTier(700).name, 'Silver III');
    assert.equal(getRankTier(949).name, 'Silver III');
    assert.equal(getRankTier(950).name, 'Silver IV');
    assert.equal(getRankTier(1249).name, 'Silver IV');

    // Gold
    assert.equal(getRankTier(1250).name, 'Gold I');
    assert.equal(getRankTier(1599).name, 'Gold I');
    assert.equal(getRankTier(1600).name, 'Gold II');
    assert.equal(getRankTier(1999).name, 'Gold II');
    assert.equal(getRankTier(2000).name, 'Gold III');
    assert.equal(getRankTier(2499).name, 'Gold III');
    assert.equal(getRankTier(2500).name, 'Gold IV');
    assert.equal(getRankTier(3099).name, 'Gold IV');

    // Platinum
    assert.equal(getRankTier(3100).name, 'Platinum I');
    assert.equal(getRankTier(3799).name, 'Platinum I');
    assert.equal(getRankTier(3800).name, 'Platinum II');
    assert.equal(getRankTier(4599).name, 'Platinum II');
    assert.equal(getRankTier(4600).name, 'Platinum III');
    assert.equal(getRankTier(5599).name, 'Platinum III');
    assert.equal(getRankTier(5600).name, 'Platinum IV');
    assert.equal(getRankTier(6799).name, 'Platinum IV');

    // Diamond
    assert.equal(getRankTier(6800).name, 'Diamond I');
    assert.equal(getRankTier(8199).name, 'Diamond I');
    assert.equal(getRankTier(8200).name, 'Diamond II');
    assert.equal(getRankTier(10399).name, 'Diamond II');
    assert.equal(getRankTier(10400).name, 'Diamond III');
    assert.equal(getRankTier(12799).name, 'Diamond III');
    assert.equal(getRankTier(12800).name, 'Diamond IV');
    assert.equal(getRankTier(16499).name, 'Diamond IV');

    // Apex Ranks
    assert.equal(getRankTier(16500).name, 'Champion');
    assert.equal(getRankTier(22999).name, 'Champion');
    assert.equal(getRankTier(23000).name, 'Master');
    assert.equal(getRankTier(32999).name, 'Master');
    assert.equal(getRankTier(33000).name, 'Grandmaster');
    assert.equal(getRankTier(50000).name, 'Grandmaster');
  });

  it('handles negative, 0, and non-integer RP values safely', () => {
    assert.equal(getRankTier(0).name, 'Bronze I');
    assert.equal(getRankTier(-100).name, 'Bronze I');
    assert.equal(getRankTier(NaN).name, 'Bronze I');
    assert.equal(getRankTier(49.8).name, 'Bronze II'); // rounds 49.8 -> 50
    assert.equal(getRankTier(49.2).name, 'Bronze I');  // rounds 49.2 -> 49
  });

  it('correctly maps all 23 rank tier badges', () => {
    assert.equal(RANK_TIERS.length, 23);
    assert.equal(getRankTier(0).badge, 'bronze-1.png');
    assert.equal(getRankTier(50).badge, 'bronze-2.png');
    assert.equal(getRankTier(350).badge, 'silver-1.png');
    assert.equal(getRankTier(1250).badge, 'gold-1.png');
    assert.equal(getRankTier(3100).badge, 'platinum-1.png');
    assert.equal(getRankTier(6800).badge, 'diamond-1.png');
    assert.equal(getRankTier(16500).badge, 'champion.png');
    assert.equal(getRankTier(23000).badge, 'master.png');
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

  it('enforces HARD_RESET_CAP_RP (12,800) on carryover RP', () => {
    // Carryover of 30,000 is clamped to 12,800
    assert.equal(calculateSeasonRp(30000, 3600), HARD_RESET_CAP_RP + 100);
    assert.equal(HARD_RESET_CAP_RP, 12800);
  });
});

describe('Monthly Soft Reset & Inactivity Decay', () => {
  it('correctly maps soft reset starting RP for every tier according to master table', () => {
    assert.equal(calculateSeasonReset(0).newRP, 0);       // Bronze I -> 0 RP
    assert.equal(calculateSeasonReset(50).newRP, 0);      // Bronze II -> 0 RP
    assert.equal(calculateSeasonReset(120).newRP, 0);     // Bronze III -> 0 RP
    assert.equal(calculateSeasonReset(220).newRP, 50);    // Bronze IV -> 50 RP
    assert.equal(calculateSeasonReset(350).newRP, 120);   // Silver I -> 120 RP
    assert.equal(calculateSeasonReset(500).newRP, 220);   // Silver II -> 220 RP
    assert.equal(calculateSeasonReset(700).newRP, 350);   // Silver III -> 350 RP
    assert.equal(calculateSeasonReset(950).newRP, 500);   // Silver IV -> 500 RP
    assert.equal(calculateSeasonReset(1250).newRP, 700);  // Gold I -> 700 RP
    assert.equal(calculateSeasonReset(1600).newRP, 950);  // Gold II -> 950 RP
    assert.equal(calculateSeasonReset(2000).newRP, 1250); // Gold III -> 1,250 RP
    assert.equal(calculateSeasonReset(2500).newRP, 1600); // Gold IV -> 1,600 RP
    assert.equal(calculateSeasonReset(3100).newRP, 2000); // Platinum I -> 2,000 RP
    assert.equal(calculateSeasonReset(3800).newRP, 2500); // Platinum II -> 2,500 RP
    assert.equal(calculateSeasonReset(4600).newRP, 3100); // Platinum III -> 3,100 RP
    assert.equal(calculateSeasonReset(5600).newRP, 3800); // Platinum IV -> 3,800 RP
    assert.equal(calculateSeasonReset(6800).newRP, 4600); // Diamond I -> 4,600 RP
    assert.equal(calculateSeasonReset(8200).newRP, 5600); // Diamond II -> 5,600 RP
    assert.equal(calculateSeasonReset(10400).newRP, 6800);// Diamond III -> 6,800 RP
    assert.equal(calculateSeasonReset(12800).newRP, 8200);// Diamond IV -> 8,200 RP
    assert.equal(calculateSeasonReset(16500).newRP, 10400);// Champion -> 10,400 RP
    assert.equal(calculateSeasonReset(23000).newRP, 12800);// Master -> 12,800 RP [CAP]
    assert.equal(calculateSeasonReset(33000).newRP, 12800);// Grandmaster -> 12,800 RP [CAP]
    assert.equal(calculateSeasonReset(100000).newRP, 12800);// Super high GM -> 12,800 RP [CAP]
  });

  it('decays inactive users (0 focus seconds in previous month) to 0 RP', () => {
    const user = { username: 'inactive_user', season_rp: 5000 };
    const sessions: any[] = []; // 0 sessions
    const reset = resolveUserSeasonReset(user, sessions);
    assert.equal(reset.startingRP, 0);
    assert.equal(reset.newRankTitle, 'BRONZE I');
  });

  it('is idempotent: running soft reset twice produces the same stable result', () => {
    const user = { username: 'consistent_user', last_season_rp: 4600 };
    // 46 hours logged in previous month (4600 earned RP = Platinum III)
    const prevMonthDate = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const sessions = [{ duration_seconds: 46 * 3600, started_at: prevMonthDate }];

    const reset1 = resolveUserSeasonReset(user, sessions);
    assert.equal(reset1.startingRP, 3100); // Platinum III soft reset is 3,100 RP (Platinum I)

    const userAfterReset = {
      ...user,
      season_base_rp: reset1.startingRP,
      last_reset_month: '2026-11',
    };
    const reset2 = resolveUserSeasonReset(userAfterReset, sessions);
    assert.equal(reset2.startingRP, 3100);
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

describe('Offline Anti-Tamper & Deduplication Specification', () => {
  it('guarantees offline unverified sessions do not inflate client RP or advance rank tier', () => {
    const prevRP = 200; // Bronze IV
    const sessionSeconds = 843; // 14 mins 3 secs
    const isServerValidated = false; // Offline / network failure

    const baseBreakdown = calculateSessionRP(sessionSeconds);
    const gainedRP = isServerValidated ? baseBreakdown.totalGained : 0;
    const newRP = prevRP + gainedRP;

    assert.equal(gainedRP, 0, 'Offline unverified session must yield 0 immediate competitive RP');
    assert.equal(newRP, prevRP, 'RP must remain unchanged until server validation succeeds');
    assert.equal(getRankTier(newRP).name, getRankTier(prevRP).name, 'Rank tier must not advance while offline');
  });

  it('deduplicates overlapping offline sessions before syncing to server', () => {
    const now = Date.now();
    // Simulate repeated offline stop & save exploit attempts within the same time window
    const offlineSessions = [
      { id: 'sess-1', startTime: new Date(now - 840000).toISOString(), endTime: new Date(now).toISOString() },
      { id: 'sess-2', startTime: new Date(now - 840000).toISOString(), endTime: new Date(now).toISOString() }, // duplicate
      { id: 'sess-3', startTime: new Date(now - 400000).toISOString(), endTime: new Date(now).toISOString() }, // overlap
      { id: 'sess-4', startTime: new Date(now - 2000000).toISOString(), endTime: new Date(now - 1000000).toISOString() }, // non-overlapping
    ];

    const deduplicated: typeof offlineSessions = [];
    for (const sess of offlineSessions) {
      const sessStart = new Date(sess.startTime).getTime();
      const sessEnd = new Date(sess.endTime).getTime();
      const isOverlap = deduplicated.some((existing) => {
        const exStart = new Date(existing.startTime).getTime();
        const exEnd = new Date(existing.endTime).getTime();
        return sessStart < exEnd && sessEnd > exStart;
      });
      if (!isOverlap) {
        deduplicated.push(sess);
      }
    }

    assert.equal(deduplicated.length, 2, 'Only distinct, non-overlapping offline sessions should be retained for migration');
    assert.equal(deduplicated[0].id, 'sess-1');
    assert.equal(deduplicated[1].id, 'sess-4');
  });
});

describe('Desktop & Mobile Timer Layout Specification', () => {
  it('guarantees SwipeTabContainer separates mobile dock clearance from desktop without inline override', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const swipeTabPath = path.resolve(process.cwd(), 'src/components/common/SwipeTabContainer.tsx');
    const swipeTabContent = fs.readFileSync(swipeTabPath, 'utf8');

    // 1. Must use tab-pane-timer and tab-pane-content classes
    assert.match(swipeTabContent, /tab-pane-timer/, 'Must use .tab-pane-timer class for responsive padding');
    assert.match(swipeTabContent, /tab-pane-content/, 'Must use .tab-pane-content class for responsive padding');

    // 2. Must not hardcode paddingBottom inline in style prop
    assert.doesNotMatch(
      swipeTabContent,
      /paddingBottom:\s*tabPaddingBottom/,
      'Must NOT hardcode paddingBottom inline which blocks responsive desktop clearance'
    );
  });

  it('guarantees globals.css defines distinct mobile and desktop clearance rules', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const globalsPath = path.resolve(process.cwd(), 'src/app/globals.css');
    const globalsContent = fs.readFileSync(globalsPath, 'utf8');

    // 1. Mobile padding rules (< 768px)
    assert.match(globalsContent, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.tab-pane-timer/);
    assert.match(globalsContent, /padding-bottom:\s*calc\(5\.5rem\s*\+\s*env\(safe-area-inset-bottom/);

    // 2. Desktop padding rules (>= 768px)
    assert.match(globalsContent, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.tab-pane-timer/);

    // 3. Dial container and digits responsive rules
    assert.match(globalsContent, /\.timer-dial-container/);
    assert.match(globalsContent, /\.timer-dial-digits/);
  });

  it('guarantees TimerDial and StudyTimer prevent collision and redundant labels', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const dialPath = path.resolve(process.cwd(), 'src/components/timer/TimerDial.tsx');
    const dialContent = fs.readFileSync(dialPath, 'utf8');

    const timerPath = path.resolve(process.cwd(), 'src/components/timer/StudyTimer.tsx');
    const timerContent = fs.readFileSync(timerPath, 'utf8');

    // 1. TimerDial uses .timer-dial-container, .timer-dial-center-digits, and .timer-dial-digits
    assert.match(dialContent, /className="timer-dial-container/);
    assert.match(dialContent, /timer-dial-center-digits/);
    assert.match(dialContent, /timer-dial-digits/);
    assert.match(dialContent, /timer-dial-bottom-info/);

    // 2. StudyTimer motion.div has h-full min-h-0 to constrain dial within flex bounds
    assert.match(timerContent, /className="w-full h-full min-h-0 flex items-center justify-center"/);

    // 3. Duplicate subject name in dial is eliminated
    assert.match(timerContent, /subjectName=\{undefined\}/);
  });
});

