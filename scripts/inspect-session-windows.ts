import fs from 'fs';
import path from 'path';

const backupPath = path.resolve(process.cwd(), 'backup_study_sessions_audit_1795258223537.json');
const sessions = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

console.log('Total sessions:', sessions.length);

const diffs: any[] = [];

for (const s of sessions) {
  const duration = Number(s.duration_seconds) || 0;
  const createdMs = s.created_at ? new Date(s.created_at).getTime() : 0;
  const startedMs = s.started_at ? new Date(s.started_at).getTime() : 0;
  const endedMs = s.ended_at ? new Date(s.ended_at).getTime() : 0;

  // Window between created_at and ended_at
  const createdWindowSec = (createdMs > 0 && endedMs > 0) ? Math.floor(Math.abs(endedMs - createdMs) / 1000) : null;
  // Window between started_at and ended_at
  const startedWindowSec = (startedMs > 0 && endedMs > 0) ? Math.floor((endedMs - startedMs) / 1000) : null;

  // Check if duration > createdWindowSec + 300, or duration > startedWindowSec + 300
  const overCreated = createdWindowSec !== null ? duration - createdWindowSec : 0;
  const overStarted = startedWindowSec !== null ? duration - startedWindowSec : 0;

  if (overCreated > 0 || overStarted > 0) {
    diffs.push({
      id: s.id,
      user_id: s.user_id,
      duration,
      created_at: s.created_at,
      started_at: s.started_at,
      ended_at: s.ended_at,
      createdWindowSec,
      startedWindowSec,
      overCreated,
      overStarted,
    });
  }
}

console.log('Sessions with duration > window:', diffs.length);
if (diffs.length > 0) {
  console.log(JSON.stringify(diffs.slice(0, 20), null, 2));
} else {
  // Let's print 5 sample sessions to see what they look like
  console.log('Sample sessions:');
  console.log(JSON.stringify(sessions.slice(0, 5), null, 2));
}
