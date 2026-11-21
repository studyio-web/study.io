import fs from 'fs';
import path from 'path';

const backupPath = path.resolve(process.cwd(), 'backup_study_sessions_audit_1795258223537.json');
const sessions = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

console.log(`Inspecting all ${sessions.length} sessions:`);

let mismatchStartEnd = 0;
let over5Min = 0;
const results: any[] = [];

for (const s of sessions) {
  const duration = Number(s.duration_seconds) || 0;
  const startMs = s.started_at ? new Date(s.started_at).getTime() : 0;
  const endMs = s.ended_at ? new Date(s.ended_at).getTime() : 0;
  const createdMs = s.created_at ? new Date(s.created_at).getTime() : 0;

  const startEndWindow = Math.floor((endMs - startMs) / 1000);
  const diffStartEnd = duration - startEndWindow;

  if (Math.abs(diffStartEnd) > 5) {
    mismatchStartEnd++;
    results.push({
      id: s.id,
      user_id: s.user_id,
      duration,
      startEndWindow,
      diffStartEnd,
      started_at: s.started_at,
      ended_at: s.ended_at,
      created_at: s.created_at,
    });
  }
}

console.log('Sessions where duration != (ended_at - started_at) by > 5s:', mismatchStartEnd);
if (results.length > 0) {
  console.log(JSON.stringify(results, null, 2));
}
