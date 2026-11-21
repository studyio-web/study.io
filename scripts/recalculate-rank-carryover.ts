import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.backup first if present, then .env.local
for (const envFileName of ['.env.backup', '.env.local', '.env']) {
  try {
    const envPath = path.resolve(process.cwd(), envFileName);
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, 'utf8');
      envFile.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.substring(0, eqIdx).trim();
          let v = trimmed.substring(eqIdx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (v && v !== '[SENSITIVE]' && !v.includes('SENSITIVE') && !process.env[k]) {
            process.env[k] = v;
          }
        }
      });
    }
  } catch (e) {
    console.warn(`Warning loading ${envFileName}:`, e);
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// OLD thresholds (for legacy archives or pre-migration calculation)
const OLD_RANK_TIERS = [
  { name: 'Bronze I', minRP: 0 },
  { name: 'Bronze II', minRP: 300 },
  { name: 'Bronze III', minRP: 700 },
  { name: 'Bronze IV', minRP: 1200 },
  { name: 'Silver I', minRP: 1800 },
  { name: 'Silver II', minRP: 2500 },
  { name: 'Silver III', minRP: 3300 },
  { name: 'Silver IV', minRP: 4200 },
  { name: 'Gold I', minRP: 5200 },
  { name: 'Gold II', minRP: 6300 },
  { name: 'Gold III', minRP: 7500 },
  { name: 'Gold IV', minRP: 8800 },
  { name: 'Platinum I', minRP: 10200 },
  { name: 'Platinum II', minRP: 11700 },
  { name: 'Platinum III', minRP: 13300 },
  { name: 'Platinum IV', minRP: 15000 },
  { name: 'Diamond I', minRP: 17000 },
  { name: 'Diamond II', minRP: 19000 },
  { name: 'Diamond III', minRP: 21200 },
  { name: 'Diamond IV', minRP: 23600 },
  { name: 'Champion', minRP: 26000 },
  { name: 'Master', minRP: 29000 },
  { name: 'Grandmaster', minRP: 33000 },
];

export function getOldRankTierFromRp(rp: number): string {
  const safeRp = Math.max(0, Math.round(rp || 0));
  for (let i = OLD_RANK_TIERS.length - 1; i >= 0; i--) {
    if (safeRp >= OLD_RANK_TIERS[i].minRP) {
      return OLD_RANK_TIERS[i].name;
    }
  }
  return 'Bronze I';
}

// NEW thresholds as requested:
// Bronze I 0, II 50, III 120, IV 220;
// Silver I 350, II 500, III 700, IV 950;
// Gold I 1250, II 1600, III 2000, IV 2500;
// Platinum I 3100, II 3800, III 4600, IV 5600;
// Diamond I 6800, II 8200, III 10400, IV 12800;
// Champion 16500; Master 23000; Grandmaster 33000.
const NEW_RANK_TIERS = [
  { name: 'Bronze I', minRP: 0 },
  { name: 'Bronze II', minRP: 50 },
  { name: 'Bronze III', minRP: 120 },
  { name: 'Bronze IV', minRP: 220 },
  { name: 'Silver I', minRP: 350 },
  { name: 'Silver II', minRP: 500 },
  { name: 'Silver III', minRP: 700 },
  { name: 'Silver IV', minRP: 950 },
  { name: 'Gold I', minRP: 1250 },
  { name: 'Gold II', minRP: 1600 },
  { name: 'Gold III', minRP: 2000 },
  { name: 'Gold IV', minRP: 2500 },
  { name: 'Platinum I', minRP: 3100 },
  { name: 'Platinum II', minRP: 3800 },
  { name: 'Platinum III', minRP: 4600 },
  { name: 'Platinum IV', minRP: 5600 },
  { name: 'Diamond I', minRP: 6800 },
  { name: 'Diamond II', minRP: 8200 },
  { name: 'Diamond III', minRP: 10400 },
  { name: 'Diamond IV', minRP: 12800 },
  { name: 'Champion', minRP: 16500 },
  { name: 'Master', minRP: 23000 },
  { name: 'Grandmaster', minRP: 33000 },
];

export function getNewRankTierFromRp(rp: number): string {
  const safeRp = Math.max(0, Math.round(rp || 0));
  for (let i = NEW_RANK_TIERS.length - 1; i >= 0; i--) {
    if (safeRp >= NEW_RANK_TIERS[i].minRP) {
      return NEW_RANK_TIERS[i].name;
    }
  }
  return 'Bronze I';
}

/**
 * Dynamic Soft Reset Rule:
 * Carryover = minimum RP of the tier two below the final tier,
 * floored at 0 and capped at Diamond IV minimum (12,800).
 */
export function getNewCarryoverFromRank(rankName: string): number {
  if (!rankName) return 0;
  const clean = rankName.trim().toLowerCase();
  const idx = NEW_RANK_TIERS.findIndex(
    (t) => t.name.toLowerCase() === clean || t.name.toLowerCase().replace(' ', '') === clean.replace(' ', '')
  );
  if (idx === -1) {
    // If not found in new tier names, check old tier names
    const oldIdx = OLD_RANK_TIERS.findIndex(
      (t) => t.name.toLowerCase() === clean || t.name.toLowerCase().replace(' ', '') === clean.replace(' ', '')
    );
    if (oldIdx <= 2) return 0;
    const targetIdx = oldIdx - 2;
    return Math.min(12800, Math.max(0, NEW_RANK_TIERS[targetIdx]?.minRP ?? 0));
  }
  if (idx <= 2) return 0;
  const targetIdx = idx - 2;
  return Math.min(12800, Math.max(0, NEW_RANK_TIERS[targetIdx]?.minRP ?? 0));
}

async function run() {
  const isApply = process.argv.includes('--apply');

  console.log(`=== RANK CARRYOVER RECALCULATION (${isApply ? 'APPLY' : 'DRY RUN'}) ===\n`);

  // 1. Fetch profiles
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, season_rp, season_base_rp, rank_title, current_rank, last_season_rank, last_reset_month')
    .order('username');

  if (error || !profiles) {
    console.error('Failed to fetch profiles:', error);
    process.exit(1);
  }

  // Backup data to disk
  const backupDir = path.resolve(process.cwd(), 'scripts', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `profiles_backup_${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(profiles, null, 2), 'utf8');
  console.log(`Backup saved to ${backupPath} (${profiles.length} profiles)\n`);

  let changedCount = 0;
  const dryRunTable: Array<{
    user: string;
    oldCarryover: number;
    newCarryover: number;
    oldRank: string;
    newRank: string;
    carryoverChanged: boolean;
    rankChanged: boolean;
  }> = [];

  const updates: Array<{
    id: string;
    season_base_rp: number;
    season_rp: number;
    current_rank: string;
    rank_title: string;
  }> = [];

  for (const p of profiles) {
    const oldCarryover = Number(p.season_base_rp || 0);
    const oldSeasonRp = Number(p.season_rp || 0);
    const lastSeasonRank = p.last_season_rank || 'Bronze I';

    // Earned RP from study sessions in current month = oldSeasonRp - oldCarryover
    const earnedMonthRp = Math.max(0, oldSeasonRp - oldCarryover);

    // Compute new carryover from last_season_rank using new soft reset rule
    const newCarryover = getNewCarryoverFromRank(lastSeasonRank);
    const newSeasonRp = newCarryover + earnedMonthRp;

    const oldRank = p.current_rank || getOldRankTierFromRp(oldSeasonRp);
    const newRank = getNewRankTierFromRp(newSeasonRp);

    const carryoverChanged = oldCarryover !== newCarryover;
    const rankChanged = oldRank.toLowerCase() !== newRank.toLowerCase();
    const isChanged = carryoverChanged || rankChanged || oldSeasonRp !== newSeasonRp;

    if (isChanged) {
      changedCount++;
    }

    dryRunTable.push({
      user: p.username || p.id.slice(0, 8),
      oldCarryover,
      newCarryover,
      oldRank,
      newRank,
      carryoverChanged,
      rankChanged,
    });

    if (isChanged) {
      updates.push({
        id: p.id,
        season_base_rp: newCarryover,
        season_rp: newSeasonRp,
        current_rank: newRank,
        rank_title: newRank,
      });
    }
  }

  // Print table
  console.log(
    '| ' +
    'User'.padEnd(25) + ' | ' +
    'Old Carryover'.padEnd(14) + ' | ' +
    'New Carryover'.padEnd(14) + ' | ' +
    'Old Rank'.padEnd(16) + ' | ' +
    'New Rank'.padEnd(16) + ' | ' +
    'Status'.padEnd(12) + ' |'
  );
  console.log('|' + '-'.repeat(27) + '|' + '-'.repeat(16) + '|' + '-'.repeat(16) + '|' + '-'.repeat(18) + '|' + '-'.repeat(18) + '|' + '-'.repeat(14) + '|');

  for (const row of dryRunTable) {
    const status = row.carryoverChanged && row.rankChanged
      ? 'BOTH CHANGED'
      : row.carryoverChanged
      ? 'CARRYOVER'
      : row.rankChanged
      ? 'RANK CHANGED'
      : 'NO CHANGE';
    console.log(
      `| ${row.user.padEnd(25)} | ${String(row.oldCarryover).padEnd(14)} | ${String(row.newCarryover).padEnd(14)} | ${row.oldRank.padEnd(16)} | ${row.newRank.padEnd(16)} | ${status.padEnd(12)} |`
    );
  }

  console.log(`\nTotal users: ${profiles.length}`);
  console.log(`Users with carryover or rank changed: ${changedCount}`);

  if (isApply) {
    console.log(`\nApplying updates to ${updates.length} profiles...`);
    let appliedCount = 0;
    for (const u of updates) {
      const { error: updErr } = await supabase
        .from('profiles')
        .update({
          season_base_rp: u.season_base_rp,
          season_rp: u.season_rp,
          current_rank: u.current_rank,
          rank_title: u.rank_title,
        })
        .eq('id', u.id);

      if (updErr) {
        console.error(`Failed to update ${u.id}:`, updErr);
      } else {
        appliedCount++;
      }
    }
    console.log(`Successfully applied updates to ${appliedCount}/${updates.length} profiles.`);
  } else {
    console.log('\n(Run with --apply to commit these updates to the database)');
  }
}

run();
