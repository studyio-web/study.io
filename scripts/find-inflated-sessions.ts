import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load env files
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('[Audit] Fetching study_sessions from Supabase...');
  const { data: sessions, error } = await supabase
    .from('study_sessions')
    .select('id, user_id, duration_seconds, started_at, ended_at, created_at, mode, notes')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Audit] Error querying study_sessions:', error);
    process.exit(1);
  }

  console.log(`[Audit] Total study_sessions retrieved: ${sessions?.length ?? 0}`);

  // Create backup table first as required:
  // "Back up first and don't apply anything until I approve."
  const backupFilename = `backup_study_sessions_audit_${Date.now()}.json`;
  const backupPath = path.resolve(process.cwd(), backupFilename);
  fs.writeFileSync(backupPath, JSON.stringify(sessions, null, 2), 'utf8');
  console.log(`[Audit] Backed up ${sessions?.length ?? 0} rows to ${backupFilename}`);

  // Try SQL backup if service role is available
  try {
    const { error: sqlBackupErr } = await supabase.rpc('backup_study_sessions_pre_audit');
    if (!sqlBackupErr) {
      console.log('[Audit] SQL backup table created.');
    }
  } catch {}

  const inflatedSessions: Array<{
    user_id: string;
    session_id: string;
    saved_duration_sec: number;
    saved_duration_fmt: string;
    real_window_sec: number;
    real_window_fmt: string;
    over_by_sec: number;
    over_by_fmt: string;
    proposed_duration_sec: number;
    proposed_duration_fmt: string;
    started_at: string;
    ended_at: string;
    created_at: string;
  }> = [];

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s (${sec}s)`;
  };

  for (const s of sessions || []) {
    const duration = Number(s.duration_seconds) || 0;
    const startMs = s.started_at ? new Date(s.started_at).getTime() : 0;
    const endMs = s.ended_at ? new Date(s.ended_at).getTime() : 0;
    const createdMs = s.created_at ? new Date(s.created_at).getTime() : 0;

    // Window between start (or created_at) and end:
    // If started_at and ended_at exist:
    const windowStartMs = startMs > 0 ? startMs : createdMs;
    const windowEndMs = endMs > 0 ? endMs : createdMs;

    if (windowStartMs > 0 && windowEndMs > 0) {
      const realWindowSec = Math.max(0, Math.floor((windowEndMs - windowStartMs) / 1000));
      // Criteria: duration larger than the time between created_at and ended_at, or more than 5 minutes (300s) over
      const diffSec = duration - realWindowSec;
      if (diffSec > 300) {
        inflatedSessions.push({
          user_id: s.user_id,
          session_id: s.id,
          saved_duration_sec: duration,
          saved_duration_fmt: formatSec(duration),
          real_window_sec: realWindowSec,
          real_window_fmt: formatSec(realWindowSec),
          over_by_sec: diffSec,
          over_by_fmt: formatSec(diffSec),
          proposed_duration_sec: realWindowSec,
          proposed_duration_fmt: formatSec(realWindowSec),
          started_at: s.started_at,
          ended_at: s.ended_at,
          created_at: s.created_at,
        });
      }
    }
  }

  console.log(`[Audit] Total inflated sessions found: ${inflatedSessions.length}`);
  console.log(JSON.stringify(inflatedSessions, null, 2));
}

main().catch(console.error);
