import fs from 'fs';
import path from 'path';

// Load .env.local if present
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    });
  }
} catch (e) {
  console.warn('Warning loading .env.local:', e);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: Supabase URL and Key must be defined in .env.local or environment.');
  process.exit(1);
}

interface Profile {
  id: string;
  name?: string;
  username?: string;
  created_at: string;
  total_study_seconds: number;
  season_rp?: number;
  season_base_rp?: number;
  rank_title?: string;
  current_rank?: string;
  rank_badge?: string;
  lifetime_xp?: number;
}

interface StudySession {
  id: string;
  user_id: string;
  duration_seconds: number;
  started_at: string;
  ended_at: string;
  created_at: string;
  mode?: string;
  subject_id?: string | null;
  client_session_id?: string | null;
  notes?: string | null;
}

interface Anomaly {
  user: string;
  userId: string;
  issue: string;
  sessionId: string;
  currentVal: string;
  proposedVal: string;
  action: 'clamp' | 'delete' | 'adjust';
  rawSession?: StudySession;
  clampedDuration?: number;
}

// Master Rank Table from Specification
const MASTER_TIERS = [
  { tier: 'Bronze I', minRp: 0, maxRp: 299, softResetRp: 0, badge: 'bronze-1.png' },
  { tier: 'Bronze II', minRp: 300, maxRp: 699, softResetRp: 100, badge: 'bronze-2.png' },
  { tier: 'Bronze III', minRp: 700, maxRp: 1199, softResetRp: 200, badge: 'bronze-3.png' },
  { tier: 'Bronze IV', minRp: 1200, maxRp: 1799, softResetRp: 300, badge: 'bronze-4.png' },
  { tier: 'Silver I', minRp: 1800, maxRp: 2499, softResetRp: 700, badge: 'silver-1.png' },
  { tier: 'Silver II', minRp: 2500, maxRp: 3299, softResetRp: 1200, badge: 'silver-2.png' },
  { tier: 'Silver III', minRp: 3300, maxRp: 4199, softResetRp: 1800, badge: 'silver-3.png' },
  { tier: 'Silver IV', minRp: 4200, maxRp: 5199, softResetRp: 2500, badge: 'silver-4.png' },
  { tier: 'Gold I', minRp: 5200, maxRp: 6299, softResetRp: 3300, badge: 'gold-1.png' },
  { tier: 'Gold II', minRp: 6300, maxRp: 7499, softResetRp: 4200, badge: 'gold-2.png' },
  { tier: 'Gold III', minRp: 7500, maxRp: 8799, softResetRp: 5200, badge: 'gold-3.png' },
  { tier: 'Gold IV', minRp: 8800, maxRp: 10199, softResetRp: 6300, badge: 'gold-4.png' },
  { tier: 'Platinum I', minRp: 10200, maxRp: 11699, softResetRp: 7500, badge: 'platinum-1.png' },
  { tier: 'Platinum II', minRp: 11700, maxRp: 13299, softResetRp: 8800, badge: 'platinum-2.png' },
  { tier: 'Platinum III', minRp: 13300, maxRp: 14999, softResetRp: 10200, badge: 'platinum-3.png' },
  { tier: 'Platinum IV', minRp: 15000, maxRp: 16999, softResetRp: 11700, badge: 'platinum-4.png' },
  { tier: 'Diamond I', minRp: 17000, maxRp: 18999, softResetRp: 13300, badge: 'diamond-1.png' },
  { tier: 'Diamond II', minRp: 19000, maxRp: 21199, softResetRp: 15000, badge: 'diamond-2.png' },
  { tier: 'Diamond III', minRp: 21200, maxRp: 23599, softResetRp: 17000, badge: 'diamond-3.png' },
  { tier: 'Diamond IV', minRp: 23600, maxRp: 25999, softResetRp: 19000, badge: 'diamond-4.png' },
  { tier: 'Champion', minRp: 26000, maxRp: 28999, softResetRp: 21200, badge: 'champion.png' },
  { tier: 'Master', minRp: 29000, maxRp: 32999, softResetRp: 23600, badge: 'master.png' },
  { tier: 'Grandmaster', minRp: 33000, maxRp: 9999999, softResetRp: 23600, badge: 'grandmaster.png' },
];

function getTierForRp(rp: number) {
  const safeRp = Math.max(0, Math.round(rp || 0));
  for (let i = MASTER_TIERS.length - 1; i >= 0; i--) {
    if (safeRp >= MASTER_TIERS[i].minRp) {
      return MASTER_TIERS[i];
    }
  }
  return MASTER_TIERS[0];
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase API error (${res.status}): ${text}`);
  }

  return res.json();
}

async function runAudit() {
  const isRepair = process.argv.includes('--repair');
  console.log('='.repeat(80));
  console.log(` STUDY.IO FOCUS DATA AUDIT & REPAIR SCRIPT [${isRepair ? 'EXECUTE REPAIR' : 'DRY RUN'}]`);
  console.log('='.repeat(80));

  console.log('\n[1/5] Fetching profiles and study sessions from Supabase...');
  const profiles: Profile[] = await apiFetch<Profile[]>('profiles?select=*');
  const sessions: StudySession[] = await apiFetch<StudySession[]>('study_sessions?select=*&order=started_at.asc');

  console.log(`Fetched ${profiles.length} profiles and ${sessions.length} study sessions.`);

  // Create backup directory and dump initial state
  const backupDir = path.resolve(process.cwd(), 'scripts', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `sessions_backup_${timestamp}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        profilesCount: profiles.length,
        sessionsCount: sessions.length,
        profiles,
        sessions,
      },
      null,
      2
    )
  );
  console.log(`\n[2/5] Complete snapshot backed up to: ${backupFile}`);

  // Anomaly Detection
  console.log('\n[3/5] Scanning for anomalies and impossible data...');
  const anomalies: Anomaly[] = [];
  const now = new Date();
  const maxSessionSeconds = 12 * 3600; // 43,200s (12h)

  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  const userSessionsMap = new Map<string, StudySession[]>();
  sessions.forEach((s) => {
    const uid = s.user_id || 'null_user';
    const list = userSessionsMap.get(uid) || [];
    list.push(s);
    userSessionsMap.set(uid, list);
  });

  // Track duplicate IDs to delete
  const duplicateSessionIds = new Set<string>();

  for (const [userId, userSessions] of userSessionsMap.entries()) {
    const profile = profileMap.get(userId);
    const userName = profile?.username || profile?.name || (userId !== 'null_user' ? userId.substring(0, 8) : 'anonymous');
    const userCreatedAt = profile && profile.created_at ? new Date(profile.created_at).getTime() : 0;
    const hoursSinceCreation = profile && userCreatedAt > 0 ? (now.getTime() - userCreatedAt) / 3600000 : Infinity;

    // Check duplicate sessions (identical started_at and ended_at or identical client_session_id)
    const seenTimes = new Map<string, StudySession>();
    for (const s of userSessions) {
      const timeKey = `${s.started_at}_${s.ended_at}_${s.duration_seconds}`;
      if (seenTimes.has(timeKey)) {
        duplicateSessionIds.add(s.id);
        anomalies.push({
          user: userName,
          userId,
          issue: 'Exact duplicate session (offline retry / sync glitch)',
          sessionId: s.id,
          currentVal: `${s.duration_seconds}s (${(s.duration_seconds / 3600).toFixed(2)}h)`,
          proposedVal: 'DELETE',
          action: 'delete',
          rawSession: s,
        });
      } else {
        seenTimes.set(timeKey, s);
      }
    }

    // Filter out duplicates for further chronological checks
    const activeUserSessions = userSessions.filter((s) => !duplicateSessionIds.has(s.id));

    let userTotalValidSeconds = 0;

    for (let i = 0; i < activeUserSessions.length; i++) {
      const s = activeUserSessions[i];
      const startT = new Date(s.started_at).getTime();
      const endT = new Date(s.ended_at).getTime();

      // a) Duration > 12h
      if (s.duration_seconds > maxSessionSeconds) {
        anomalies.push({
          user: userName,
          userId,
          issue: 'Session duration exceeds 12-hour maximum cap',
          sessionId: s.id,
          currentVal: `${s.duration_seconds}s (${(s.duration_seconds / 3600).toFixed(2)}h)`,
          proposedVal: `${maxSessionSeconds}s (12.00h)`,
          action: 'clamp',
          rawSession: s,
          clampedDuration: maxSessionSeconds,
        });
      }

      // b) Session started before account created
      if (userCreatedAt > 0 && startT < userCreatedAt - 60000) {
        // Allow 60s tolerance for clock jitter
        anomalies.push({
          user: userName,
          userId,
          issue: 'Session started before user account creation',
          sessionId: s.id,
          currentVal: `Started: ${s.started_at} (Account created: ${profile?.created_at})`,
          proposedVal: 'DELETE or CLAMP',
          action: 'delete',
          rawSession: s,
        });
      }

      // c) Session ending in the future (relative to now)
      if (endT > now.getTime() + 60000) {
        anomalies.push({
          user: userName,
          userId,
          issue: 'Session ending in future',
          sessionId: s.id,
          currentVal: `Ended: ${s.ended_at}`,
          proposedVal: `Clamp to server now (${now.toISOString()})`,
          action: 'clamp',
          rawSession: s,
          clampedDuration: Math.max(0, Math.floor((now.getTime() - startT) / 1000)),
        });
      }

      // d) Check for overlapping sessions with previous session
      if (i > 0) {
        const prevS = activeUserSessions[i - 1];
        const prevEndT = new Date(prevS.ended_at).getTime();
        if (startT < prevEndT - 5000) {
          // 5s tolerance
          anomalies.push({
            user: userName,
            userId,
            issue: 'Session overlaps with previous session',
            sessionId: s.id,
            currentVal: `Overlaps with ${prevS.id} by ${Math.round((prevEndT - startT) / 1000)}s`,
            proposedVal: 'Adjust start time or delete overlap',
            action: 'adjust',
            rawSession: s,
          });
        }
      }

      userTotalValidSeconds += Math.min(s.duration_seconds, maxSessionSeconds);
    }

    // e) Total focus time greater than time since account creation
    const userTotalHours = userTotalValidSeconds / 3600;
    if (userTotalHours > hoursSinceCreation && hoursSinceCreation > 0) {
      anomalies.push({
        user: userName,
        userId,
        issue: 'Total study time exceeds total hours since account creation',
        sessionId: 'USER_PROFILE',
        currentVal: `${userTotalHours.toFixed(1)}h focus vs ${hoursSinceCreation.toFixed(1)}h lifetime`,
        proposedVal: `Recalculate strictly from validated sessions`,
        action: 'adjust',
      });
    }

    // f) Profile total_study_seconds mismatch with sum of sessions
    if (profile && profile.total_study_seconds !== userTotalValidSeconds) {
      anomalies.push({
        user: userName,
        userId,
        issue: 'Profile total_study_seconds out of sync with actual sessions',
        sessionId: 'PROFILE_SYNC',
        currentVal: `${profile.total_study_seconds}s (${(profile.total_study_seconds / 3600).toFixed(2)}h)`,
        proposedVal: `${userTotalValidSeconds}s (${(userTotalValidSeconds / 3600).toFixed(2)}h)`,
        action: 'adjust',
      });
    }
  }

  // Print Structured Anomaly Table
  console.log('\n[4/5] DRY-RUN REPAIR TABLE:');
  console.log('-'.repeat(120));
  console.log(
    `| ${'USER'.padEnd(16)} | ${'ISSUE'.padEnd(42)} | ${'SESSION ID'.padEnd(38)} | ${'CURRENT VAL'.padEnd(20)} | ${'PROPOSED VAL'.padEnd(20)} |`
  );
  console.log('-'.repeat(120));

  if (anomalies.length === 0) {
    console.log('| No anomalies found in study sessions! All data is consistent and healthy.'.padEnd(119) + '|');
  } else {
    for (const a of anomalies) {
      console.log(
        `| ${a.user.padEnd(16).substring(0, 16)} | ${a.issue.padEnd(42).substring(0, 42)} | ${a.sessionId.padEnd(38).substring(0, 38)} | ${a.currentVal.padEnd(20).substring(0, 20)} | ${a.proposedVal.padEnd(20).substring(0, 20)} |`
      );
    }
  }
  console.log('-'.repeat(120));

  // Compute Before & After Stats
  console.log('\n[5/5] BEFORE & AFTER STATS:');
  const totalSecondsBefore = sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
  const affectedUsers = new Set(anomalies.map((a) => a.userId));

  // Calculate clean session totals per user
  const cleanSessions = sessions.filter((s) => !duplicateSessionIds.has(s.id));
  const totalSecondsAfter = cleanSessions.reduce((sum, s) => {
    let d = s.duration_seconds;
    if (d > maxSessionSeconds) d = maxSessionSeconds;
    return sum + d;
  }, 0);

  console.log(`- Total Study Hours: ${(totalSecondsBefore / 3600).toFixed(2)}h -> ${(totalSecondsAfter / 3600).toFixed(2)}h`);
  console.log(`- Total Sessions: ${sessions.length} -> ${cleanSessions.length} (${duplicateSessionIds.size} duplicates removed)`);
  console.log(`- Affected User Count: ${affectedUsers.size} users with discrepancies`);

  // Leaderboard before vs after
  // Current month UTC boundaries
  const startOfCurrentMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0);

  const userStatsBefore = new Map<string, { user: Profile; monthSeconds: number; totalSeconds: number; rp: number }>();
  for (const p of profiles) {
    const uSess = sessions.filter((s) => s.user_id === p.id);
    const mSec = uSess
      .filter((s) => new Date(s.started_at).getTime() >= startOfCurrentMonth)
      .reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
    const tSec = uSess.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
    const rp = (p.season_base_rp || 0) + Math.floor(mSec / 36);
    userStatsBefore.set(p.id, { user: p, monthSeconds: mSec, totalSeconds: tSec, rp });
  }

  const userStatsAfter = new Map<string, { user: Profile; monthSeconds: number; totalSeconds: number; rp: number }>();
  for (const p of profiles) {
    const uSess = cleanSessions.filter((s) => s.user_id === p.id);
    const mSec = uSess
      .filter((s) => new Date(s.started_at).getTime() >= startOfCurrentMonth)
      .reduce((acc, s) => acc + Math.min(s.duration_seconds || 0, maxSessionSeconds), 0);
    const tSec = uSess.reduce((acc, s) => acc + Math.min(s.duration_seconds || 0, maxSessionSeconds), 0);
    const rp = (p.season_base_rp || 0) + Math.floor(mSec / 36);
    userStatsAfter.set(p.id, { user: p, monthSeconds: mSec, totalSeconds: tSec, rp });
  }

  const top10Before = Array.from(userStatsBefore.values())
    .sort((a, b) => b.monthSeconds - a.monthSeconds)
    .slice(0, 10);

  const top10After = Array.from(userStatsAfter.values())
    .sort((a, b) => b.monthSeconds - a.monthSeconds)
    .slice(0, 10);

  console.log('\nTOP 10 LEADERBOARD (CURRENT MONTH FOCUS TIME):');
  console.log('BEFORE REPAIR:');
  top10Before.forEach((item, idx) => {
    const name = item.user.username || item.user.name || item.user.id.substring(0, 8);
    const tier = getTierForRp(item.rp);
    console.log(`  ${idx + 1}. ${name.padEnd(20)} | ${(item.monthSeconds / 3600).toFixed(2)}h | ${item.rp} RP (${tier.tier})`);
  });

  console.log('\nAFTER REPAIR (PROPOSED):');
  top10After.forEach((item, idx) => {
    const name = item.user.username || item.user.name || item.user.id.substring(0, 8);
    const tier = getTierForRp(item.rp);
    console.log(`  ${idx + 1}. ${name.padEnd(20)} | ${(item.monthSeconds / 3600).toFixed(2)}h | ${item.rp} RP (${tier.tier})`);
  });

  console.log('\n' + '='.repeat(80));
  if (!isRepair) {
    console.log(' DRY-RUN COMPLETE. Database was NOT modified.');
    console.log(' To apply repairs after approval, run: npx tsx scripts/audit-focus-data.ts --repair');
  } else {
    console.log(' EXECUTING REPAIRS (Explicitly requested)...');
    // Delete duplicate sessions
    for (const dupId of duplicateSessionIds) {
      await apiFetch(`study_sessions?id=eq.${dupId}`, { method: 'DELETE' });
    }
    console.log(`Deleted ${duplicateSessionIds.size} duplicate session rows.`);

    // Clamp overlong sessions
    for (const anom of anomalies.filter((a) => a.action === 'clamp' && a.rawSession)) {
      if (anom.rawSession && anom.clampedDuration) {
        await apiFetch(`study_sessions?id=eq.${anom.rawSession.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ duration_seconds: anom.clampedDuration }),
        });
      }
    }
    console.log('Clamped all sessions exceeding 12 hours.');

    // Update profiles total_study_seconds and season_rp
    for (const [uid, stats] of userStatsAfter.entries()) {
      const tier = getTierForRp(stats.rp);
      await apiFetch(`profiles?id=eq.${uid}`, {
        method: 'PATCH',
        body: JSON.stringify({
          total_study_seconds: stats.totalSeconds,
          season_rp: stats.rp,
          rank_title: tier.tier,
          current_rank: tier.tier,
          rank_badge: `/images/ranks/${tier.badge}`,
        }),
      });
    }
    console.log(`Updated ${userStatsAfter.size} user profiles with validated totals and rank tiers.`);
    console.log(' REPAIR SUCCESSFULLY COMPLETED.');
  }
  console.log('='.repeat(80));
}

runAudit().catch((err) => {
  console.error('Audit script failed with error:', err);
  process.exit(1);
});
