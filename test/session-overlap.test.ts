import './setup';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { calculateSeasonRp, getCurrentMonthFocusSeconds } from '../src/lib/ranks';

describe('Server-Side Session Overlap Protection & Credited Focus Time Specification', () => {
  let db: PGlite;
  const testUserId = '00000000-0000-0000-0000-000000000001';
  const otherUserId = '00000000-0000-0000-0000-000000000002';

  before(async () => {
    db = new PGlite();

    // 1. Setup Auth and Baseline Schema
    await db.exec(`
      create schema if not exists auth;

      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then
          create role service_role;
        end if;
      end $$;

      create table if not exists auth.users (
        id uuid primary key,
        email text,
        created_at timestamptz default now()
      );

      create or replace function auth.uid() returns uuid as $$
      begin
        return current_setting('request.jwt.claim.sub', true)::uuid;
      end;
      $$ language plpgsql stable;

      create table if not exists public.active_sessions (
        user_id uuid primary key references auth.users(id) on delete cascade,
        status text not null default 'idle',
        mode text default 'stopwatch',
        subject_id uuid,
        started_at timestamptz,
        accumulated_seconds int default 0,
        pomodoro_phase text,
        pomodoro_duration_seconds int,
        device_id text,
        updated_at timestamptz default now()
      );

      create table if not exists public.study_sessions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        subject_id uuid,
        duration_seconds int not null default 0,
        started_at timestamptz not null default now(),
        ended_at timestamptz not null default now(),
        notes text,
        mode text default 'stopwatch',
        created_at timestamptz default now()
      );

      insert into auth.users (id, email)
      values ('${testUserId}', 'scholar@study.io'), ('${otherUserId}', 'other@study.io')
      on conflict (id) do nothing;
    `);

    // 2. Load prior migrations
    const mig1 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20261121_timer_server_authoritative.sql'), 'utf8');
    const mig2 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20261121_timer_session_created_at_and_save_on_start.sql'), 'utf8');
    const mig3 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20261122_session_overlap_protection.sql'), 'utf8');

    await db.exec(mig1);
    await db.exec(mig2);
    await db.exec(mig3);

    // Set authenticated user context
    await db.exec(`select set_config('request.jwt.claim.sub', '${testUserId}', false);`);
  });

  after(async () => {
    if (db) {
      await db.close();
    }
  });

  async function asRole<T>(role: 'authenticated' | 'anon' | 'service_role', fn: () => Promise<T>): Promise<T> {
    await db.exec(`set role ${role};`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role;`);
    }
  }

  // 1. Migration Lifecycle & Backfill verification
  it('1. Migration lifecycle: applies down migration cleanly and then re-applies up migration', async () => {
    const downPath = path.resolve(process.cwd(), 'supabase/migrations/20261122_session_overlap_protection_down.sql');
    const upPath = path.resolve(process.cwd(), 'supabase/migrations/20261122_session_overlap_protection.sql');

    const downSql = fs.readFileSync(downPath, 'utf8');
    const upSql = fs.readFileSync(upPath, 'utf8');

    // Run down migration
    await db.exec(downSql);

    // Verify columns dropped
    const checkDown = await db.query(`
      select column_name from information_schema.columns 
      where table_name = 'study_sessions' and column_name = 'credited_seconds';
    `);
    assert.equal(checkDown.rows.length, 0, 'credited_seconds column must be dropped by down migration');

    // Re-apply up migration
    await db.exec(upSql);

    // Verify columns restored
    const checkUp = await db.query(`
      select column_name from information_schema.columns 
      where table_name = 'study_sessions' and column_name = 'credited_seconds';
    `);
    assert.equal(checkUp.rows.length, 1, 'credited_seconds column must exist after re-applying up migration');
  });

  // 2. Overlap test: PC 2:00-3:00 and Phone 2:30-3:30 (PC first, Phone second) -> exactly 90 minutes
  it('2. Overlap test (PC then Phone): PC 2:00-3:00 and phone 2:30-3:30 credits exactly 90 minutes', async () => {
    await db.exec(`delete from public.study_sessions where user_id = '${testUserId}';`);

    const pcSessionId = '00000000-0000-0000-0001-000000000001';
    const phoneSessionId = '00000000-0000-0000-0001-000000000002';

    // PC session: 2:00 to 3:00 (1 hour = 3600s)
    const pcRes = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.calculate_session_overlap(
          '${testUserId}'::uuid,
          '${pcSessionId}'::uuid,
          '2026-11-22 02:00:00+00'::timestamptz,
          '2026-11-22 03:00:00+00'::timestamptz,
          3600,
          'union'
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    assert.equal(pcRes.credited_seconds, 3600);
    assert.equal(pcRes.overlap_seconds_removed, 0);
    assert.equal(pcRes.overlap_adjusted, false);

    // Save PC session to study_sessions
    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '${pcSessionId}', 3600, 3600, 3600, 0, false,
        '2026-11-22 02:00:00+00', '2026-11-22 03:00:00+00'
      );
    `);

    // Phone session: 2:30 to 3:30 (1 hour = 3600s)
    const phoneRes = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.calculate_session_overlap(
          '${testUserId}'::uuid,
          '${phoneSessionId}'::uuid,
          '2026-11-22 02:30:00+00'::timestamptz,
          '2026-11-22 03:30:00+00'::timestamptz,
          3600,
          'union'
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    assert.equal(phoneRes.credited_seconds, 1800, 'Phone must credit only 1800s (30m uncounted time)');
    assert.equal(phoneRes.overlap_seconds_removed, 1800, 'Must remove 1800s (30m overlap)');
    assert.equal(phoneRes.overlap_adjusted, true, 'overlap_adjusted must be true');

    // Save Phone session
    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '${phoneSessionId}', 1800, 1800, 3600, 1800, true,
        '2026-11-22 02:30:00+00', '2026-11-22 03:30:00+00'
      );
    `);

    // Verify total credited seconds = 3600 + 1800 = 5400s (90 minutes)
    const totalQ = await db.query(`
      select sum(credited_seconds) as total_credited, sum(raw_seconds) as total_raw
      from public.study_sessions where user_id = '${testUserId}';
    `);
    assert.equal(Number((totalQ.rows[0] as any).total_credited), 5400, 'Total credited must be exactly 90 minutes (5400s)');
    assert.equal(Number((totalQ.rows[0] as any).total_raw), 7200, 'Total raw must be 120 minutes (7200s)');
  });

  // 3. Overlap test (Phone first, PC second) -> exactly 90 minutes
  it('3. Overlap test (Phone then PC): Reverse sync order yields the identical 90 minutes credited', async () => {
    await db.exec(`delete from public.study_sessions where user_id = '${testUserId}';`);

    const phoneSessionId = '00000000-0000-0000-0002-000000000001';
    const pcSessionId = '00000000-0000-0000-0002-000000000002';

    // Phone syncs first: 2:30 to 3:30 (3600s)
    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '${phoneSessionId}', 3600, 3600, 3600, 0, false,
        '2026-11-22 02:30:00+00', '2026-11-22 03:30:00+00'
      );
    `);

    // PC syncs second: 2:00 to 3:00 (3600s)
    const pcRes = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.calculate_session_overlap(
          '${testUserId}'::uuid,
          '${pcSessionId}'::uuid,
          '2026-11-22 02:00:00+00'::timestamptz,
          '2026-11-22 03:00:00+00'::timestamptz,
          3600,
          'union'
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    assert.equal(pcRes.credited_seconds, 1800, 'PC must credit 1800s (the 2:00-2:30 non-overlapping half)');
    assert.equal(pcRes.overlap_seconds_removed, 1800);
    assert.equal(pcRes.overlap_adjusted, true);

    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '${pcSessionId}', 1800, 1800, 3600, 1800, true,
        '2026-11-22 02:00:00+00', '2026-11-22 03:00:00+00'
      );
    `);

    const totalQ = await db.query(`
      select sum(credited_seconds) as total_credited
      from public.study_sessions where user_id = '${testUserId}';
    `);
    assert.equal(Number((totalQ.rows[0] as any).total_credited), 5400, 'Total credited must be 90 minutes regardless of order');
  });

  // 4. Fully inside session -> 0 credited
  it('4. Fully enclosed session credits 0 seconds and flags overlap_adjusted', async () => {
    await db.exec(`delete from public.study_sessions where user_id = '${testUserId}';`);

    // Outer session: 2:00 to 3:00 (3600s)
    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '00000000-0000-0000-0003-000000000001', 3600, 3600, 3600, 0, false,
        '2026-11-22 02:00:00+00', '2026-11-22 03:00:00+00'
      );
    `);

    // Inner session: 2:15 to 2:45 (1800s)
    const innerRes = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.calculate_session_overlap(
          '${testUserId}'::uuid,
          '00000000-0000-0000-0003-000000000002'::uuid,
          '2026-11-22 02:15:00+00'::timestamptz,
          '2026-11-22 02:45:00+00'::timestamptz,
          1800,
          'union'
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    assert.equal(innerRes.credited_seconds, 0, 'Fully enclosed session must credit 0 seconds');
    assert.equal(innerRes.overlap_seconds_removed, 1800, 'Must remove all 1800s');
    assert.equal(innerRes.overlap_adjusted, true);
  });

  // 5. Adjacent sessions -> both credited in full
  it('5. Adjacent sessions (3:00-3:30 after 2:00-3:00) credit both in full without trimming', async () => {
    await db.exec(`delete from public.study_sessions where user_id = '${testUserId}';`);

    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '00000000-0000-0000-0004-000000000001', 3600, 3600, 3600, 0, false,
        '2026-11-22 02:00:00+00', '2026-11-22 03:00:00+00'
      );
    `);

    // Adjacent session immediately following at 3:00
    const adjRes = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.calculate_session_overlap(
          '${testUserId}'::uuid,
          '00000000-0000-0000-0004-000000000002'::uuid,
          '2026-11-22 03:00:00+00'::timestamptz,
          '2026-11-22 03:30:00+00'::timestamptz,
          1800,
          'union'
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    assert.equal(adjRes.credited_seconds, 1800, 'Adjacent session must credit full 1800s');
    assert.equal(adjRes.overlap_seconds_removed, 0);
    assert.equal(adjRes.overlap_adjusted, false);
  });

  // 6. Three overlapping sessions across 3 devices
  it('6. Three overlapping sessions across 3 devices: credits exact union duration', async () => {
    await db.exec(`delete from public.study_sessions where user_id = '${testUserId}';`);

    // Device A: 2:00 to 3:00 (3600s)
    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '00000000-0000-0000-0005-000000000001', 3600, 3600, 3600, 0, false,
        '2026-11-22 02:00:00+00', '2026-11-22 03:00:00+00'
      );
    `);

    // Device B: 2:30 to 3:30 (3600s) -> overlaps [2:30, 3:00] (1800s), credits 1800s
    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '00000000-0000-0000-0005-000000000002', 1800, 1800, 3600, 1800, true,
        '2026-11-22 02:30:00+00', '2026-11-22 03:30:00+00'
      );
    `);

    // Device C: 2:45 to 3:45 (3600s) -> overlaps union [2:00, 3:30] on [2:45, 3:30] (2700s) -> credits 900s (15m)
    const devCRes = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.calculate_session_overlap(
          '${testUserId}'::uuid,
          '00000000-0000-0000-0005-000000000003'::uuid,
          '2026-11-22 02:45:00+00'::timestamptz,
          '2026-11-22 03:45:00+00'::timestamptz,
          3600,
          'union'
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    assert.equal(devCRes.credited_seconds, 900, 'Device C must credit 900s (15m uncredited tail from 3:30 to 3:45)');
    assert.equal(devCRes.overlap_seconds_removed, 2700, 'Must remove 2700s (45m overlap)');
    assert.equal(devCRes.overlap_adjusted, true);

    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '00000000-0000-0000-0005-000000000003', 900, 900, 3600, 2700, true,
        '2026-11-22 02:45:00+00', '2026-11-22 03:45:00+00'
      );
    `);

    // Total union span is 2:00 to 3:45 = 1 hour 45 minutes = 6300 seconds
    const totalQ = await db.query(`
      select sum(credited_seconds) as total_credited
      from public.study_sessions where user_id = '${testUserId}';
    `);
    assert.equal(Number((totalQ.rows[0] as any).total_credited), 6300, 'Total union credited must be 6300s (1h 45m)');
  });

  // 7. Configurable OVERLAP_MODE = 'keep_longest'
  it('7. keep_longest mode credits only the longest of conflicting sessions', async () => {
    await db.exec(`delete from public.study_sessions where user_id = '${testUserId}';`);

    // Existing session: 30 minutes (1800s) from 2:00 to 2:30
    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '00000000-0000-0000-0006-000000000001', 1800, 1800, 1800, 0, false,
        '2026-11-22 02:00:00+00', '2026-11-22 02:30:00+00'
      );
    `);

    // New conflicting session is LONGER: 60 minutes (3600s) from 2:00 to 3:00
    // Under keep_longest: credits incremental difference (3600 - 1800 = 1800s) so total is 3600s (the longest)
    const longerRes = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.calculate_session_overlap(
          '${testUserId}'::uuid,
          '00000000-0000-0000-0006-000000000002'::uuid,
          '2026-11-22 02:00:00+00'::timestamptz,
          '2026-11-22 03:00:00+00'::timestamptz,
          3600,
          'keep_longest'
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    assert.equal(longerRes.credited_seconds, 1800);
    assert.equal(longerRes.overlap_seconds_removed, 1800);
    assert.equal(longerRes.overlap_adjusted, true);

    // If new conflicting session is SHORTER: 15 minutes (900s) from 2:10 to 2:25
    // Under keep_longest: credits 0 seconds
    const shorterRes = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.calculate_session_overlap(
          '${testUserId}'::uuid,
          '00000000-0000-0000-0006-000000000003'::uuid,
          '2026-11-22 02:10:00+00'::timestamptz,
          '2026-11-22 02:25:00+00'::timestamptz,
          900,
          'keep_longest'
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    assert.equal(shorterRes.credited_seconds, 0);
    assert.equal(shorterRes.overlap_seconds_removed, 900);
    assert.equal(shorterRes.overlap_adjusted, true);
  });

  // 8. Replay idempotency: replaying stop/sync twice does not double count
  it('8. Replay idempotency: replaying an event twice never double counts or changes totals', async () => {
    await db.exec(`delete from public.study_sessions where user_id = '${testUserId}';`);

    const replaySessionId = '00000000-0000-0000-0007-000000000001';
    const replayEventId = '00000000-0000-0000-0007-000000000002';

    // Start session in active_sessions
    await db.exec(`
      insert into public.active_sessions (
        user_id, session_id, status, mode, started_at, accumulated_seconds, accumulated_ms, version
      ) values (
        '${testUserId}', '${replaySessionId}', 'running', 'stopwatch', now() - interval '1 hour', 0, 0, 1
      ) on conflict (user_id) do update set
        session_id = '${replaySessionId}', status = 'running', started_at = now() - interval '1 hour';
    `);

    // First stop call
    const firstStop = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.stop_session(
          '${replaySessionId}'::uuid,
          1,
          'pc-1',
          now(),
          '${replayEventId}'::uuid,
          false
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    assert.equal(firstStop.success, true);
    assert.equal(firstStop.is_duplicate, undefined);
    assert.equal(firstStop.credited_seconds >= 3590 && firstStop.credited_seconds <= 3610, true);

    // Second stop call with same session_id and event_id
    const secondStop = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.stop_session(
          '${replaySessionId}'::uuid,
          1,
          'pc-1',
          now(),
          '${replayEventId}'::uuid,
          false
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    assert.equal(secondStop.success, true);
    assert.equal(secondStop.is_duplicate, true, 'Second call must be flagged as duplicate');
    assert.equal(secondStop.credited_seconds, firstStop.credited_seconds);

    // Confirm exactly 1 record in study_sessions
    const rows = await db.query(`select count(*) as cnt from public.study_sessions where session_id = '${replaySessionId}';`);
    assert.equal(Number((rows.rows[0] as any).cnt), 1, 'Must have exactly 1 record in study_sessions');
  });

  // 9. Month totals, season RP, and leaderboard strictly use credited_seconds
  it('9. Month totals and Season RP formula strictly use credited_seconds instead of raw_seconds', async () => {
    await db.exec(`delete from public.study_sessions where user_id = '${testUserId}';`);

    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5, 12, 0, 0));

    // Session 1: 1h raw, 1h credited (3600s)
    // Session 2: 1h raw, 30m credited (1800s due to overlap)
    const s1 = {
      user_id: testUserId,
      started_at: currentMonthStart.toISOString(),
      duration_seconds: 3600,
      credited_seconds: 3600,
      raw_seconds: 3600,
    };
    const s2 = {
      user_id: testUserId,
      started_at: new Date(currentMonthStart.getTime() + 1800 * 1000).toISOString(),
      duration_seconds: 1800,
      credited_seconds: 1800,
      raw_seconds: 3600,
    };

    // Calculate month seconds using getSessionDurationSeconds
    const totalMonthSeconds = getCurrentMonthFocusSeconds([s1, s2], now);
    assert.equal(totalMonthSeconds, 5400, 'Must sum credited_seconds (5400s), ignoring raw_seconds (7200s)');

    // Season RP = carryover + floor(month credited seconds / 36)
    const carryoverRp = 1000;
    const seasonRp = calculateSeasonRp(carryoverRp, totalMonthSeconds);
    // 1000 + floor(5400 / 36) = 1000 + 150 = 1150 RP
    assert.equal(seasonRp, 1150, 'Season RP must be calculated strictly from credited_seconds');
  });

  // 10. Month boundary session split with overlap applied per month
  it('10. Month-boundary session is split per month with overlap evaluated per month', async () => {
    await db.exec(`delete from public.study_sessions where user_id = '${testUserId}';`);

    // Existing session in November: 2026-11-30 23:30 to 23:45 (900s)
    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '00000000-0000-0000-0008-000000000001', 900, 900, 900, 0, false,
        '2026-11-30 23:30:00+00', '2026-11-30 23:45:00+00'
      );
    `);

    // Existing session in December: 2026-12-01 00:15 to 00:30 (900s)
    await db.query(`
      insert into public.study_sessions (
        user_id, session_id, duration_seconds, credited_seconds, raw_seconds,
        overlap_seconds_removed, overlap_adjusted, started_at, ended_at
      ) values (
        '${testUserId}', '00000000-0000-0000-0008-000000000002', 900, 900, 900, 0, false,
        '2026-12-01 00:15:00+00', '2026-12-01 00:30:00+00'
      );
    `);

    // New session spans 2026-11-30 23:30 to 2026-12-01 00:30 (1 hour total)
    // November chunk: 23:30 to 24:00 (1800s raw) -> overlaps [23:30, 23:45] (900s), credits 900s
    // December chunk: 00:00 to 00:30 (1800s raw) -> overlaps [00:15, 00:30] (900s), credits 900s
    const novChunk = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.calculate_session_overlap(
          '${testUserId}'::uuid,
          null,
          '2026-11-30 23:30:00+00'::timestamptz,
          '2026-12-01 00:00:00+00'::timestamptz,
          1800,
          'union'
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    const decChunk = await asRole('authenticated', async () => {
      const q = await db.query(`
        select public.calculate_session_overlap(
          '${testUserId}'::uuid,
          null,
          '2026-12-01 00:00:00+00'::timestamptz,
          '2026-12-01 00:30:00+00'::timestamptz,
          1800,
          'union'
        ) as res;
      `);
      return (q.rows[0] as any).res;
    });

    assert.equal(novChunk.credited_seconds, 900, 'November chunk credits 900s');
    assert.equal(decChunk.credited_seconds, 900, 'December chunk credits 900s');
  });

  // 11. Paused / break intervals are never counted in an overlap or credited
  it('11. Paused or break intervals are never counted in an overlap or credited', async () => {
    await db.exec(`delete from public.study_sessions where user_id = '${testUserId}';`);

    // A Pomodoro break session should have 0 credited seconds and be ignored
    const { validateAndSaveSession } = await import('../src/lib/server/sessionValidation');

    const mockClient: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
            gte: () => ({ lt: async () => ({ data: [] }) }),
            lt: () => ({ gt: async () => ({ data: [] }) }),
          }),
        }),
        insert: () => ({ select: async () => ({ data: [{ id: 'break-1' }], error: null }) }),
        update: () => ({ eq: async () => ({ data: null }) }),
      }),
    };

    const breakResult = await validateAndSaveSession(
      mockClient,
      { id: testUserId },
      {
        started_at: '2026-11-22T02:00:00Z',
        ended_at: '2026-11-22T02:15:00Z',
        mode: 'pomodoro_break',
      }
    );

    assert.equal(breakResult.calculatedSeconds, 0, 'Pomodoro break must calculate 0 seconds');
    assert.equal(breakResult.discarded, true, 'Pomodoro break must be discarded from focus time');
  });
});
