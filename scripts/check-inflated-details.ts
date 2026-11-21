import fs from 'fs';
import path from 'path';

const backupPath = path.resolve(process.cwd(), 'backup_study_sessions_audit_1795258223537.json');
const sessions = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

const inflated: any[] = [];

for (const s of sessions) {
  const duration = Number(s.duration_seconds) || 0;
  const startedMs = s.started_at ? new Date(s.started_at).getTime() : 0;
  const endedMs = s.ended_at ? new Date(s.ended_at).getTime() : 0;
  const createdMs = s.created_at ? new Date(s.created_at).getTime() : 0;

  // Window between started_at and ended_at
  const startedWindowSec = (startedMs > 0 && endedMs > 0) ? Math.max(0, Math.floor((endedMs - startedMs) / 1000)) : 0;
  
  // Also check if someone's session had duration > (ended_at - started_at) by more than 5 minutes (300s)
  if (duration > startedWindowSec + 5) {
    inflated.push({
      type: 'duration_exceeds_started_window',
      user_id: s.user_id,
      session_id: s.id,
      saved_duration: duration,
      started_at: s.started_at,
      ended_at: s.ended_at,
      created_at: s.created_at,
      started_window: startedWindowSec,
      diff: duration - startedWindowSec,
    });
  }

  // Also check if created_at was used as session creation time (if created_at < ended_at)
  if (createdMs > 0 && endedMs > 0 && createdMs < endedMs) {
    const createdWindowSec = Math.floor((endedMs - createdMs) / 1000);
    if (duration > createdWindowSec + 300) {
      inflated.push({
        type: 'duration_exceeds_created_window',
        user_id: s.user_id,
        session_id: s.id,
        saved_duration: duration,
        started_at: s.started_at,
        ended_at: s.ended_at,
        created_at: s.created_at,
        created_window: createdWindowSec,
        diff: duration - createdWindowSec,
      });
    }
  }
}

console.log('Total inflated found:', inflated.length);
console.log(JSON.stringify(inflated, null, 2));
