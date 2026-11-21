import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

describe('Real PostgreSQL Database Integration Tests (Migration, Security & RPCs)', () => {
  let db: PGlite;
  const testUserId = 'a0000000-0000-0000-0000-000000000001';
  const otherUserId = 'b0000000-0000-0000-0000-000000000002';

  before(async () => {
    db = new PGlite();

    // 1. Setup Auth & Baseline Tables
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

    // Set authenticated user context
    await db.exec(`select set_config('request.jwt.claim.sub', '${testUserId}', false);`);
  });

  after(async () => {
    if (db) {
      await db.close();
    }
  });

  // Helper to get active PostgreSQL session user
  async function getCurrentRole(): Promise<string> {
    const res = await db.query(`select current_user as role;`);
    return (res.rows[0] as any).role;
  }

  // Helper to run code as specific non-superuser role
  async function asRole<T>(role: 'authenticated' | 'anon' | 'service_role', fn: () => Promise<T>): Promise<T> {
    await db.exec(`set role ${role};`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role;`);
    }
  }

  // Requirement 6: Apply migration, run down migration, then run it again
  it('Migration Lifecycle: Applies migration, runs down-migration, then re-applies cleanly [Role: postgres]', async () => {
    const role = await getCurrentRole();
    assert.equal(role, 'postgres');

    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261121_timer_server_authoritative.sql');
    const downPath = path.resolve(process.cwd(), 'supabase/migrations/20261121_timer_server_authoritative_down.sql');

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    // 1. Initial Apply
    await db.exec(migrationSql);
    const check1 = await db.query(`select column_name from information_schema.columns where table_name = 'active_sessions' and column_name = 'session_id';`);
    assert.equal(check1.rows.length, 1, 'active_sessions.session_id should exist after migration');

    // 2. Down Migration
    await db.exec(downSql);
    const checkDown = await db.query(`select column_name from information_schema.columns where table_name = 'active_sessions' and column_name = 'session_id';`);
    assert.equal(checkDown.rows.length, 0, 'active_sessions.session_id should be removed after down-migration');

    // 3. Re-Apply Migration
    await db.exec(migrationSql);
    const check2 = await db.query(`select column_name from information_schema.columns where table_name = 'active_sessions' and column_name = 'session_id';`);
    assert.equal(check2.rows.length, 1, 'active_sessions.session_id should exist after re-applying migration');
  });

  // Requirement 1: Permissions lockdown - confirm authenticated and anon CANNOT INSERT, UPDATE, DELETE directly
  it('Permissions: authenticated and anon cannot INSERT, UPDATE or DELETE active_sessions or study_sessions directly [Role: authenticated & anon]', async () => {
    // A. Role: authenticated
    await asRole('authenticated', async () => {
      const activeRole = await getCurrentRole();
      assert.equal(activeRole, 'authenticated');

      // 1. Direct INSERT into active_sessions -> permission denied
      let actInsertErr = false;
      try {
        await db.exec(`insert into public.active_sessions (user_id, status) values ('${testUserId}', 'running');`);
      } catch (err: any) {
        actInsertErr = true;
        assert.ok(err.message.includes('permission denied'), `Expected permission denied, got: ${err.message}`);
      }
      assert.equal(actInsertErr, true, 'authenticated role must not INSERT into active_sessions');

      // 2. Direct UPDATE active_sessions -> permission denied
      let actUpdateErr = false;
      try {
        await db.exec(`update public.active_sessions set status = 'running' where user_id = '${testUserId}';`);
      } catch (err: any) {
        actUpdateErr = true;
        assert.ok(err.message.includes('permission denied'), `Expected permission denied, got: ${err.message}`);
      }
      assert.equal(actUpdateErr, true, 'authenticated role must not UPDATE active_sessions');

      // 3. Direct DELETE active_sessions -> permission denied
      let actDeleteErr = false;
      try {
        await db.exec(`delete from public.active_sessions where user_id = '${testUserId}';`);
      } catch (err: any) {
        actDeleteErr = true;
        assert.ok(err.message.includes('permission denied'), `Expected permission denied, got: ${err.message}`);
      }
      assert.equal(actDeleteErr, true, 'authenticated role must not DELETE active_sessions');

      // 4. Direct INSERT study_sessions -> permission denied
      let studyInsertErr = false;
      try {
        await db.exec(`insert into public.study_sessions (user_id, duration_seconds) values ('${testUserId}', 100);`);
      } catch (err: any) {
        studyInsertErr = true;
        assert.ok(err.message.includes('permission denied'), `Expected permission denied, got: ${err.message}`);
      }
      assert.equal(studyInsertErr, true, 'authenticated role must not INSERT into study_sessions');

      // 5. Direct UPDATE study_sessions -> permission denied
      let studyUpdateErr = false;
      try {
        await db.exec(`update public.study_sessions set duration_seconds = 200 where user_id = '${testUserId}';`);
      } catch (err: any) {
        studyUpdateErr = true;
        assert.ok(err.message.includes('permission denied'), `Expected permission denied, got: ${err.message}`);
      }
      assert.equal(studyUpdateErr, true, 'authenticated role must not UPDATE study_sessions');

      // 6. Direct DELETE study_sessions -> permission denied
      let studyDeleteErr = false;
      try {
        await db.exec(`delete from public.study_sessions where user_id = '${testUserId}';`);
      } catch (err: any) {
        studyDeleteErr = true;
        assert.ok(err.message.includes('permission denied'), `Expected permission denied, got: ${err.message}`);
      }
      assert.equal(studyDeleteErr, true, 'authenticated role must not DELETE study_sessions');

      // 7. Direct EXECUTE on admin_release_ultra_lock -> permission denied
      let adminExecErr = false;
      try {
        await db.exec(`select public.admin_release_ultra_lock('00000000-0000-0000-0000-000000000000'::uuid);`);
      } catch (err: any) {
        adminExecErr = true;
        assert.ok(err.message.includes('permission denied'), `Expected permission denied, got: ${err.message}`);
      }
      assert.equal(adminExecErr, true, 'authenticated role must not EXECUTE admin_release_ultra_lock');
    });

    // B. Role: anon
    await asRole('anon', async () => {
      const activeRole = await getCurrentRole();
      assert.equal(activeRole, 'anon');

      let anonInsertErr = false;
      try {
        await db.exec(`insert into public.active_sessions (user_id, status) values ('${testUserId}', 'running');`);
      } catch (err: any) {
        anonInsertErr = true;
        assert.ok(err.message.includes('permission denied'), `Expected permission denied, got: ${err.message}`);
      }
      assert.equal(anonInsertErr, true, 'anon role must not INSERT into active_sessions');

      let anonAdminErr = false;
      try {
        await db.exec(`select public.admin_release_ultra_lock('00000000-0000-0000-0000-000000000000'::uuid);`);
      } catch (err: any) {
        anonAdminErr = true;
        assert.ok(err.message.includes('permission denied'), `Expected permission denied, got: ${err.message}`);
      }
      assert.equal(anonAdminErr, true, 'anon role must not EXECUTE admin_release_ultra_lock');
    });
  });

  // Requirement 1 & 2: stop_session called twice with same session_id as authenticated
  it('RPC stop_session idempotency: calling twice with same session_id returns duplicate without double counting [Role: authenticated]', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111111';

    await asRole('authenticated', async () => {
      const activeRole = await getCurrentRole();
      assert.equal(activeRole, 'authenticated');

      // Start session via SECURITY DEFINER RPC
      const startRes = await db.query(`
        select public.start_session(
          p_session_id => '${sessionId}'::uuid,
          p_mode => 'stopwatch',
          p_device_id => 'test-device-1'
        ) as res;
      `);
      assert.equal((startRes.rows[0] as any).res.status, 'running');
    });

    // Advance started_at as postgres/admin so session has duration to record
    await db.exec(`
      update public.active_sessions
      set started_at = now() - interval '3600 seconds'
      where session_id = '${sessionId}';
    `);

    await asRole('authenticated', async () => {
      // First stop
      const firstRes = await db.query(`
        select public.stop_session(
          '${sessionId}'::uuid,
          1,
          'test-device-1'
        ) as res;
      `);
      const firstData = (firstRes.rows[0] as any).res;
      assert.equal(firstData.success, true);
      assert.equal(typeof firstData.duration_seconds === 'number', true);

      // Count records in study_sessions (authenticated can SELECT)
      const countRes1 = await db.query(`select count(*) as c from public.study_sessions where session_id = '${sessionId}';`);
      assert.equal(Number((countRes1.rows[0] as any).c), 1);

      // Second stop with same session_id (retry / retransmission)
      const secondRes = await db.query(`
        select public.stop_session(
          '${sessionId}'::uuid,
          1,
          'test-device-1'
        ) as res;
      `);
      const secondData = (secondRes.rows[0] as any).res;
      assert.equal(secondData.success, true);
      assert.equal(secondData.is_duplicate, true);
      assert.equal(secondData.duration_seconds, firstData.duration_seconds);

      // Must still be exactly 1 record
      const countRes2 = await db.query(`select count(*) as c from public.study_sessions where session_id = '${sessionId}';`);
      assert.equal(Number((countRes2.rows[0] as any).c), 1, 'Must not double count session records');
    });
  });

  // Requirement 1 & 2: Stale version conflict as authenticated
  it('RPC Version Conflict: rejects mutations when client expected_version does not match current DB version [Role: authenticated]', async () => {
    await asRole('authenticated', async () => {
      const activeRole = await getCurrentRole();
      assert.equal(activeRole, 'authenticated');

      const sessionId = '22222222-2222-4222-8222-222222222222';

      await db.exec(`
        select public.start_session(
          p_session_id => '${sessionId}'::uuid,
          p_mode => 'stopwatch',
          p_device_id => 'test-device-2'
        );
      `);

      // Call pause_session with expected_version = 99 (stale)
      const staleRes = await db.query(`
        select public.pause_session(
          '${sessionId}'::uuid,
          99,
          'test-device-2'
        ) as res;
      `);
      const staleData = (staleRes.rows[0] as any).res;
      assert.equal(staleData.error, 'VERSION_CONFLICT');
      assert.equal(staleData.current_version, 1);

      // Call with correct expected_version = 1 -> succeeds
      const validRes = await db.query(`
        select public.pause_session(
          '${sessionId}'::uuid,
          1,
          'test-device-2'
        ) as res;
      `);
      const validData = (validRes.rows[0] as any).res;
      assert.equal(validData.status, 'paused');
      assert.equal(validData.version, 2);
    });
  });

  // Requirement 1: Ultra Strict enforcement as normal authenticated non-superuser role
  it('Ultra Strict: rejects pause/stop/cancel before ultra_ends_at via direct table mutation AND direct RPC, then accepts after ultra_ends_at [Role: authenticated]', async () => {
    await asRole('authenticated', async () => {
      const activeRole = await getCurrentRole();
      assert.equal(activeRole, 'authenticated');

      const sessionId = '33333333-3333-4333-8333-333333333333';

      // Start Ultra Strict countdown of 15 minutes (900 seconds)
      await db.exec(`
        select public.start_session(
          p_session_id => '${sessionId}'::uuid,
          p_mode => 'countdown',
          p_planned_duration_seconds => 900,
          p_is_ultra => true,
          p_device_id => 'test-device-3'
        );
      `);

      // A. Direct SQL update trying to modify active Ultra session: blocked
      let updateFailed = false;
      try {
        await db.exec(`
          update public.active_sessions
          set status = 'paused'
          where session_id = '${sessionId}';
        `);
      } catch (err: any) {
        updateFailed = true;
        assert.ok(err.message.includes('permission denied') || err.message.includes('ULTRA_LOCKED'));
      }
      assert.equal(updateFailed, true, 'Direct table update must be rejected for authenticated user');

      // B. Direct SQL delete: blocked
      let deleteFailed = false;
      try {
        await db.exec(`
          delete from public.active_sessions
          where session_id = '${sessionId}';
        `);
      } catch (err: any) {
        deleteFailed = true;
        assert.ok(err.message.includes('permission denied') || err.message.includes('ULTRA_LOCKED'));
      }
      assert.equal(deleteFailed, true, 'Direct table delete must be rejected for authenticated user');

      // C. Direct pause_session RPC: rejected with ULTRA_LOCKED
      const pauseRes = await db.query(`
        select public.pause_session(
          '${sessionId}'::uuid,
          1,
          'test-device-3'
        ) as res;
      `);
      const pauseData = (pauseRes.rows[0] as any).res;
      assert.equal(pauseData.error, 'ULTRA_LOCKED');
      assert.equal(pauseData.remaining_seconds > 800, true);

      // D. Direct stop_session RPC: rejected with ULTRA_LOCKED
      const stopRes = await db.query(`
        select public.stop_session(
          '${sessionId}'::uuid,
          1,
          'test-device-3'
        ) as res;
      `);
      const stopData = (stopRes.rows[0] as any).res;
      assert.equal(stopData.error, 'ULTRA_LOCKED');
    });

    // Advance clock past ultra_ends_at as superuser/system, then stop as authenticated
    const sessionId = '33333333-3333-4333-8333-333333333333';
    await db.exec(`
      update public.active_sessions
      set ultra_ends_at = now() - interval '10 seconds'
      where session_id = '${sessionId}';
    `);

    await asRole('authenticated', async () => {
      const releasedStopRes = await db.query(`
        select public.stop_session(
          '${sessionId}'::uuid,
          1,
          'test-device-3'
        ) as res;
      `);
      const releasedData = (releasedStopRes.rows[0] as any).res;
      assert.equal(releasedData.success, true);
      assert.equal(releasedData.duration_seconds <= 900, true);
    });
  });

  // Requirement 1 & 4: 30-hour stopwatch credited exactly 12 hours
  it('Stopwatch 12-Hour Auto-Close: A 30-hour stopwatch without confirmation is credited exactly 12 hours (43,200s) [Role: authenticated]', async () => {
    const sessionId = '44444444-4444-4444-8444-444444444444';

    await asRole('authenticated', async () => {
      await db.exec(`
        select public.start_session(
          p_session_id => '${sessionId}'::uuid,
          p_mode => 'stopwatch',
          p_device_id => 'test-device-4'
        );
      `);
    });

    // Simulate 30 hours running without confirmation (confirmed_until expired)
    await db.exec(`
      update public.active_sessions
      set started_at = now() - interval '30 hours',
          confirmed_until = now() - interval '18 hours'
      where session_id = '${sessionId}';
    `);

    await asRole('authenticated', async () => {
      const stopRes = await db.query(`
        select public.stop_session(
          '${sessionId}'::uuid,
          1,
          'test-device-4'
        ) as res;
      `);
      const stopData = (stopRes.rows[0] as any).res;
      assert.equal(stopData.success, true);
      assert.equal(stopData.duration_seconds, 43200, 'Must credit exactly 12 hours (43200 seconds)');
    });
  });

  // Requirement 1: Confirm extending to 24h max
  it('Stopwatch Confirmation: confirms extending session up to absolute 24-hour maximum cap [Role: authenticated]', async () => {
    const sessionId = '55555555-5555-4555-8555-555555555555';

    await asRole('authenticated', async () => {
      await db.exec(`
        select public.start_session(
          p_session_id => '${sessionId}'::uuid,
          p_mode => 'stopwatch',
          p_device_id => 'test-device-5'
        );
      `);

      // User confirms at 12 hours
      const confirmRes = await db.query(`
        select public.confirm_still_studying(
          '${sessionId}'::uuid,
          'test-device-5'
        ) as res;
      `);
      const confirmData = (confirmRes.rows[0] as any).res;
      assert.equal(confirmData.success, true);
    });

    // Simulate running for 28 hours (past 24h hard cap)
    await db.exec(`
      update public.active_sessions
      set started_at = now() - interval '28 hours'
      where session_id = '${sessionId}';
    `);

    await asRole('authenticated', async () => {
      const stopRes = await db.query(`
        select public.stop_session(
          '${sessionId}'::uuid,
          2,
          'test-device-5'
        ) as res;
      `);
      const stopData = (stopRes.rows[0] as any).res;
      assert.equal(stopData.success, true);
      assert.equal(stopData.duration_seconds, 86400, 'Must be capped at absolute 24 hours (86400s)');
    });
  });

  // Requirement 1: Paused session auto-closing at 24h
  it('Paused Session Expiration: Paused session exceeding 24 hours auto-closes with accumulated time up to pause [Role: authenticated]', async () => {
    const sessionId = '66666666-6666-4666-8666-666666666666';

    await asRole('authenticated', async () => {
      await db.exec(`
        select public.start_session(
          p_session_id => '${sessionId}'::uuid,
          p_mode => 'stopwatch',
          p_device_id => 'test-device-6'
        );
      `);
    });

    // Pause with 7200s (2 hours) accumulated
    await db.exec(`
      update public.active_sessions
      set status = 'paused',
          started_at = null,
          accumulated_ms = 7200000,
          accumulated_seconds = 7200,
          last_paused_at = now() - interval '25 hours',
          version = 2
      where session_id = '${sessionId}';
    `);

    await asRole('authenticated', async () => {
      // resume_session rejects expired pause
      const resumeRes = await db.query(`
        select public.resume_session(
          '${sessionId}'::uuid,
          2,
          'test-device-6'
        ) as res;
      `);
      const resumeData = (resumeRes.rows[0] as any).res;
      assert.equal(resumeData.error, 'PAUSED_EXPIRED');

      // stop_session records accumulated time up to pause point (7200s)
      const stopRes = await db.query(`
        select public.stop_session(
          '${sessionId}'::uuid,
          null,
          'test-device-6'
        ) as res;
      `);
      const stopData = (stopRes.rows[0] as any).res;
      assert.equal(stopData.success, true);
      assert.equal(stopData.duration_seconds, 7200, 'Must record exactly 7200s accumulated before pause');
    });
  });

  // Requirement 3: Offline stop made 4 hours earlier and synced later
  it('Offline Stops: A stop made 4 hours earlier and synced later credits only 1 hour and marks offline_synced [Role: authenticated]', async () => {
    const sessionId = '77777777-7777-4777-8777-777777777777';

    await asRole('authenticated', async () => {
      await db.exec(`
        select public.start_session(
          p_session_id => '${sessionId}'::uuid,
          p_mode => 'stopwatch',
          p_device_id => 'test-device-7'
        );
      `);
    });

    // Session started 5 hours ago
    await db.exec(`
      update public.active_sessions
      set started_at = now() - interval '5 hours'
      where session_id = '${sessionId}';
    `);

    // Client stopped offline 4 hours ago (studied for exactly 1 hour: 10:00 to 11:00)
    const clientStopEpoch = Date.now() - (4 * 3600 * 1000);
    const clientStopIso = new Date(clientStopEpoch).toISOString();

    await asRole('authenticated', async () => {
      const stopRes = await db.query(`
        select public.stop_session(
          '${sessionId}'::uuid,
          1,
          'test-device-7',
          '${clientStopIso}'::timestamptz,
          null,
          true
        ) as res;
      `);
      const stopData = (stopRes.rows[0] as any).res;
      assert.equal(stopData.success, true);
      assert.equal(stopData.offline_synced, true);
      assert.equal(stopData.duration_seconds >= 3590 && stopData.duration_seconds <= 3610, true, 'Credited duration must be 1 hour, not 5 hours');

      // Check DB record for offline_synced and skew
      const sessionRow = await db.query(`
        select offline_synced, client_skew_ms, duration_seconds
        from public.study_sessions
        where session_id = '${sessionId}';
      `);
      const row = sessionRow.rows[0] as any;
      assert.equal(row.offline_synced, true);
      assert.equal(row.client_skew_ms >= 14300000, true, 'Client skew must record ~4 hours in ms');
    });
  });

  // Requirement 1 & 2: Admin release ultra lock only callable by service_role
  it('Admin Release Ultra Lock: callable by service_role only [Role: service_role]', async () => {
    const sessionId = '88888888-8888-4888-8888-888888888888';

    await asRole('authenticated', async () => {
      await db.exec(`
        select public.start_session(
          p_session_id => '${sessionId}'::uuid,
          p_mode => 'countdown',
          p_planned_duration_seconds => 1800,
          p_is_ultra => true,
          p_device_id => 'test-device-8'
        );
      `);
    });

    // Admin release executed under service_role
    await asRole('service_role', async () => {
      const activeRole = await getCurrentRole();
      assert.equal(activeRole, 'service_role');

      const adminRes = await db.query(`
        select public.admin_release_ultra_lock('${sessionId}'::uuid) as res;
      `);
      const adminData = (adminRes.rows[0] as any).res;
      assert.equal(adminData.success, true);
    });

    // Active session is no longer ultra locked
    const activeRes = await db.query(`
      select is_ultra, ultra_ends_at from public.active_sessions where session_id = '${sessionId}';
    `);
    const active = activeRes.rows[0] as any;
    assert.equal(active.is_ultra, false);
    assert.equal(active.ultra_ends_at, null);
  });

  // Requirement 4: Stale sessions cron cleanup job
  it('Cron Cleanup: cleanup_stale_active_sessions authoritatively closes stale sessions and saves them clipped [Role: service_role]', async () => {
    const staleSessionId = '99999999-9999-4999-8999-999999999999';

    // Start a stopwatch session for testUserId
    await asRole('authenticated', async () => {
      await db.exec(`
        select public.start_session(
          p_session_id => '${staleSessionId}'::uuid,
          p_mode => 'stopwatch',
          p_device_id => 'test-device-9'
        );
      `);
    });

    // Simulate stopwatch abandoned 14 hours ago (past 12h unconfirmed limit + 30m grace)
    await db.exec(`
      update public.active_sessions
      set started_at = now() - interval '14 hours',
          confirmed_until = now() - interval '2 hours'
      where session_id = '${staleSessionId}';
    `);

    // Run cron cleanup function as service_role
    await asRole('service_role', async () => {
      const activeRole = await getCurrentRole();
      assert.equal(activeRole, 'service_role');

      const cronRes = await db.query(`
        select public.cleanup_stale_active_sessions() as res;
      `);
      const cronData = (cronRes.rows[0] as any).res;
      assert.equal(cronData.success, true);
      assert.equal(cronData.closed_sessions >= 1, true);
    });

    // Verify session was reset to idle in active_sessions
    const activeCheck = await db.query(`
      select status, started_at from public.active_sessions where session_id = '${staleSessionId}';
    `);
    assert.equal((activeCheck.rows[0] as any).status, 'idle');
    assert.equal((activeCheck.rows[0] as any).started_at, null);

    // Verify clipped record was saved to study_sessions strictly at 12 hours (43,200s)
    const savedCheck = await db.query(`
      select duration_seconds, session_id from public.study_sessions where session_id = '${staleSessionId}';
    `);
    assert.equal(savedCheck.rows.length, 1);
    assert.equal((savedCheck.rows[0] as any).duration_seconds, 43200, 'Stale abandoned stopwatch must be clipped to 43,200s');
  });

  // Countdown & Ultra specific limit and isolation tests:

  // 1. A 24h Ultra countdown credited exactly 24h
  it('24h Ultra Countdown: credited exactly 24 hours (86,400s) without being clipped by 12h limit [Role: authenticated]', async () => {
    const ultra24SessionId = 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1';

    await asRole('authenticated', async () => {
      const startRes = await db.query(`
        select public.start_session(
          p_session_id => '${ultra24SessionId}'::uuid,
          p_mode => 'countdown',
          p_planned_duration_seconds => 86400,
          p_is_ultra => true,
          p_device_id => 'test-device-ultra24'
        ) as res;
      `);
      const data = (startRes.rows[0] as any).res;
      assert.equal(data.status, 'running');
      assert.equal(data.is_ultra, true);
      assert.equal(data.confirmed_until, null, 'confirmed_until must be null for Ultra countdown');
    });

    // Simulate full 24h elapsed to completion
    await db.exec(`
      update public.active_sessions
      set started_at = now() - interval '24 hours',
          ultra_ends_at = now(),
          planned_end_at = now()
      where session_id = '${ultra24SessionId}';
    `);

    await asRole('authenticated', async () => {
      const stopRes = await db.query(`
        select public.stop_session(
          '${ultra24SessionId}'::uuid,
          1,
          'test-device-ultra24'
        ) as res;
      `);
      const stopData = (stopRes.rows[0] as any).res;
      assert.equal(stopData.success, true);
      assert.equal(stopData.duration_seconds, 86400, '24h Ultra countdown must be credited full 86,400s');
    });
  });

  // 2. A 24h countdown not interrupted at 12h
  it('24h Countdown Not Interrupted: runs past 12h without interruption or confirmed_until requirement [Role: authenticated]', async () => {
    const count24SessionId = 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2';

    await asRole('authenticated', async () => {
      const startRes = await db.query(`
        select public.start_session(
          p_session_id => '${count24SessionId}'::uuid,
          p_mode => 'countdown',
          p_planned_duration_seconds => 86400,
          p_is_ultra => false,
          p_device_id => 'test-device-cd24'
        ) as res;
      `);
      const data = (startRes.rows[0] as any).res;
      assert.equal(data.status, 'running');
      assert.equal(data.confirmed_until, null, 'confirmed_until must be null for non-stopwatch countdown');
    });

    // Simulate 12.5 hours running (past 12h stopwatch threshold)
    await db.exec(`
      update public.active_sessions
      set started_at = now() - interval '12.5 hours'
      where session_id = '${count24SessionId}';
    `);

    // Verify session remains running and confirm_still_studying is rejected
    await asRole('authenticated', async () => {
      const activeRes = await db.query(`
        select status, confirmed_until from public.active_sessions where session_id = '${count24SessionId}';
      `);
      assert.equal((activeRes.rows[0] as any).status, 'running');
      assert.equal((activeRes.rows[0] as any).confirmed_until, null);

      const confirmRes = await db.query(`
        select public.confirm_still_studying(
          '${count24SessionId}'::uuid,
          'test-device-cd24'
        ) as res;
      `);
      const confirmData = (confirmRes.rows[0] as any).res;
      assert.equal(confirmData.error, 'INVALID_MODE', 'confirm_still_studying must reject countdown sessions');
    });
  });

  // 3. A 13h countdown credited 13h
  it('13h Countdown: credited exactly 13 hours (46,800s), never clipped by 12h stopwatch rule [Role: authenticated]', async () => {
    const count13SessionId = 'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3';

    await asRole('authenticated', async () => {
      await db.exec(`
        select public.start_session(
          p_session_id => '${count13SessionId}'::uuid,
          p_mode => 'countdown',
          p_planned_duration_seconds => 46800,
          p_is_ultra => false,
          p_device_id => 'test-device-cd13'
        );
      `);
    });

    // Simulate 13 hours elapsed
    await db.exec(`
      update public.active_sessions
      set started_at = now() - interval '13 hours',
          planned_end_at = now()
      where session_id = '${count13SessionId}';
    `);

    await asRole('authenticated', async () => {
      const stopRes = await db.query(`
        select public.stop_session(
          '${count13SessionId}'::uuid,
          1,
          'test-device-cd13'
        ) as res;
      `);
      const stopData = (stopRes.rows[0] as any).res;
      assert.equal(stopData.success, true);
      assert.equal(stopData.duration_seconds, 46800, 'Must credit full 13 hours (46800s), not clipped to 12h');
    });
  });

  // 4. Cleanup job leaves running 24h Ultra session alone
  it('Cron Cleanup: leaves running 24h Ultra session untouched even after 18 hours [Role: service_role]', async () => {
    const ultraActiveId = 'd4d4d4d4-d4d4-44d4-84d4-d4d4d4d4d4d4';

    await asRole('authenticated', async () => {
      await db.exec(`
        select public.start_session(
          p_session_id => '${ultraActiveId}'::uuid,
          p_mode => 'countdown',
          p_planned_duration_seconds => 86400,
          p_is_ultra => true,
          p_device_id => 'test-device-ultra-running'
        );
      `);
    });

    // Simulate 18 hours elapsed (6 hours remaining until ultra_ends_at)
    await db.exec(`
      update public.active_sessions
      set started_at = now() - interval '18 hours',
          ultra_ends_at = now() + interval '6 hours',
          planned_end_at = now() + interval '6 hours'
      where session_id = '${ultraActiveId}';
    `);

    // Run cron cleanup
    await asRole('service_role', async () => {
      const cronRes = await db.query(`select public.cleanup_stale_active_sessions() as res;`);
      assert.equal((cronRes.rows[0] as any).res.success, true);
    });

    // Active session MUST still be running with is_ultra = true
    const checkRes = await db.query(`
      select status, is_ultra from public.active_sessions where session_id = '${ultraActiveId}';
    `);
    assert.equal((checkRes.rows[0] as any).status, 'running');
    assert.equal((checkRes.rows[0] as any).is_ultra, true);
  });

  // 5. Cleanup job closes 24h Ultra session only after planned_end_at plus grace
  it('Cron Cleanup: closes 24h Ultra session only after planned_end_at plus 5m grace, crediting full 24h [Role: service_role]', async () => {
    const ultraExpiredId = 'e5e5e5e5-e5e5-45e5-85e5-e5e5e5e5e5e5';

    await asRole('authenticated', async () => {
      await db.exec(`
        select public.start_session(
          p_session_id => '${ultraExpiredId}'::uuid,
          p_mode => 'countdown',
          p_planned_duration_seconds => 86400,
          p_is_ultra => true,
          p_device_id => 'test-device-ultra-expired'
        );
      `);
    });

    // Simulate 24 hours + 6 minutes elapsed (past 5 minutes grace)
    await db.exec(`
      update public.active_sessions
      set started_at = now() - interval '24 hours 6 minutes',
          ultra_ends_at = now() - interval '6 minutes',
          planned_end_at = now() - interval '6 minutes'
      where session_id = '${ultraExpiredId}';
    `);

    // Run cron cleanup
    await asRole('service_role', async () => {
      const cronRes = await db.query(`select public.cleanup_stale_active_sessions() as res;`);
      assert.equal((cronRes.rows[0] as any).res.success, true);
    });

    // Verify reset to idle
    const activeCheck = await db.query(`
      select status, is_ultra from public.active_sessions where session_id = '${ultraExpiredId}';
    `);
    assert.equal((activeCheck.rows[0] as any).status, 'idle');
    assert.equal((activeCheck.rows[0] as any).is_ultra, false);

    // Verify credited full planned duration of 24h (86,400s)
    const savedCheck = await db.query(`
      select duration_seconds from public.study_sessions where session_id = '${ultraExpiredId}';
    `);
    assert.equal(savedCheck.rows.length, 1);
    assert.equal((savedCheck.rows[0] as any).duration_seconds, 86400, 'Must credit full 24 hours (86,400s)');
  });
});
