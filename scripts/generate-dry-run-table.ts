import fs from 'fs';
import path from 'path';

const backupPath = path.resolve(process.cwd(), 'backup_study_sessions_audit_1795258223537.json');
const sessions = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

// Format seconds into readable MM:SS or HH:MM:SS
function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s}s (${sec}s)`;
  }
  return `${m}m ${s}s (${sec}s)`;
}

interface TableRow {
  user_id: string;
  session_id: string;
  saved_duration: string;
  saved_duration_sec: number;
  real_window: string;
  real_window_sec: number;
  proposed_duration: string;
  proposed_duration_sec: number;
  difference: string;
  notes: string;
}

const tableRows: TableRow[] = [];

for (const s of sessions) {
  const duration = Number(s.duration_seconds) || 0;
  const startedMs = s.started_at ? new Date(s.started_at).getTime() : 0;
  const endedMs = s.ended_at ? new Date(s.ended_at).getTime() : 0;
  const createdMs = s.created_at ? new Date(s.created_at).getTime() : 0;

  // Window between started_at and ended_at
  const startEndSec = (startedMs > 0 && endedMs > 0) ? Math.max(0, Math.floor((endedMs - startedMs) / 1000)) : 0;

  // Check 1: Duration larger than (ended_at - started_at) by more than 5 minutes (300s)
  if (duration > startEndSec + 300) {
    tableRows.push({
      user_id: s.user_id,
      session_id: s.id,
      saved_duration: fmt(duration),
      saved_duration_sec: duration,
      real_window: fmt(startEndSec),
      real_window_sec: startEndSec,
      proposed_duration: fmt(startEndSec),
      proposed_duration_sec: startEndSec,
      difference: `+${fmt(duration - startEndSec)}`,
      notes: 'Duration exceeded (ended_at - started_at) by > 5m',
    });
  }

  // Check 2: Literal created_at vs ended_at if created_at < ended_at
  if (createdMs > 0 && endedMs > 0 && createdMs < endedMs) {
    const createdEndSec = Math.max(0, Math.floor((endedMs - createdMs) / 1000));
    if (duration > createdEndSec + 300 && duration > startEndSec + 300) {
      // already captured
    }
  }
}

console.log(`Found ${tableRows.length} rows matching duration > real_window by > 5 minutes.`);

// Now let's also check if there are ANY sessions where duration > (ended_at - started_at) by even 1 second
const anyOver: any[] = [];
for (const s of sessions) {
  const duration = Number(s.duration_seconds) || 0;
  const startedMs = s.started_at ? new Date(s.started_at).getTime() : 0;
  const endedMs = s.ended_at ? new Date(s.ended_at).getTime() : 0;
  const startEndSec = (startedMs > 0 && endedMs > 0) ? Math.max(0, Math.floor((endedMs - startedMs) / 1000)) : 0;
  if (duration > startEndSec && startEndSec > 0) {
    anyOver.push({
      user_id: s.user_id,
      session_id: s.id,
      duration,
      startEndSec,
      diff: duration - startEndSec,
    });
  }
}

console.log(`Sessions with duration > (ended_at - started_at) by >= 1s: ${anyOver.length}`);

// Write JSON artifact
fs.writeFileSync('audit_dry_run_results.json', JSON.stringify({ tableRows, anyOver }, null, 2), 'utf8');
console.log('Saved audit_dry_run_results.json');
