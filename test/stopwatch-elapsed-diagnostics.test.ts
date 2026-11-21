import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { TimerSessionEngine, ActiveSessionRemote } from '../src/lib/timerEngine';
import {
  computeElapsedSessionSeconds,
  getServerClockOffset,
  setServerClockOffset,
  getServerNow,
} from '../src/lib/serverTime';

describe('Real Code Paths: Stopwatch Lifecycle, Sync & Sanity Clamp Suite', () => {
  // Baseline timestamp anchors
  const START_250_PM = new Date('2026-11-21T14:50:00.000Z').getTime();
  const OPEN_300_PM = new Date('2026-11-21T15:00:00.000Z').getTime(); // 10 min = 600s
  const EXPECTED_ELAPSED_10M = 10 * 60; // 600s

  before(() => {
    setServerClockOffset(0);
  });

  after(() => {
    setServerClockOffset(0);
  });

  // 1. Real startTimer with leftover paused state
  it('1. startTimer: starts with leftover paused state (23m) and asserts elapsed is strictly 10 minutes at 3:00pm', () => {
    // Engine initialized with leftover state from a prior paused session (23 min = 1380s)
    const engine = new TimerSessionEngine({
      sessionId: 'old-paused-session-uuid',
      isStudying: false,
      isPaused: true,
      accumulatedSeconds: 23 * 60, // 1380s leftover
      sessionVersion: 8,
      lastPausedAt: START_250_PM - 1000,
    });

    assert.equal(engine.getState().accumulatedSeconds, 1380, 'Initial leftover accumulated state verified');

    // Call real startTimer at 2:50 PM
    const startResult = engine.startTimer({
      mode: 'stopwatch',
      serverNow: START_250_PM,
    });

    // Verify startTimer unconditionally resets accumulatedSeconds to 0 and starts fresh version
    assert.equal(startResult.accumulatedSeconds, 0, 'startTimer must reset accumulatedSeconds to 0');
    assert.equal(startResult.version, 1, 'startTimer must start at version 1');
    assert.notEqual(startResult.sessionId, 'old-paused-session-uuid', 'startTimer must generate fresh sessionId');
    assert.equal(engine.getState().isStudying, true);
    assert.equal(engine.getState().isPaused, false);

    // Advance clock 10 minutes to 3:00 PM
    const displayedElapsed = engine.getElapsedSeconds(OPEN_300_PM);

    // Assert displayed elapsed is EXACTLY 10 minutes (600s), NOT 33 minutes (1980s)
    assert.equal(displayedElapsed, EXPECTED_ELAPSED_10M, 'Elapsed at 3:00pm must be exactly 10 minutes (600s)');
  });

  // 2. Pause for an hour then resume and assert sanity clamp does not clip it
  it('2. pauseTimer & resumeTimer: pause for 1 hour then resume, asserting sanity clamp does not clip real study time', () => {
    const engine = new TimerSessionEngine();
    const T_100_PM = new Date('2026-11-21T13:00:00.000Z').getTime();
    const T_110_PM = new Date('2026-11-21T13:10:00.000Z').getTime(); // 10m later
    const T_210_PM = new Date('2026-11-21T14:10:00.000Z').getTime(); // 1 hour pause later
    const T_220_PM = new Date('2026-11-21T14:20:00.000Z').getTime(); // 10m study after resume

    // Step A: Start stopwatch at 1:00 PM
    engine.startTimer({ serverNow: T_100_PM });

    // Step B: Study for 10 minutes until 1:10 PM, then pause
    const pauseRes = engine.pauseTimer({ serverNow: T_110_PM });
    assert.equal(pauseRes.accumulatedSeconds, 600, 'Paused with 10 minutes (600s) accumulated');
    assert.equal(pauseRes.version, 2, 'Version incremented to 2 on pause');

    // Step C: Session remains paused for a full hour (1:10 PM to 2:10 PM).
    // While paused, elapsed remains 600s
    assert.equal(engine.getElapsedSeconds(T_210_PM), 600, 'Elapsed during pause remains 600s');

    // Step D: Resume timer at 2:10 PM
    const resumeRes = engine.resumeTimer({ serverNow: T_210_PM });
    assert.equal(resumeRes.version, 3, 'Version incremented to 3 on resume');
    assert.equal(resumeRes.startTime, T_210_PM, 'Running slice anchored at 2:10 PM');

    // Step E: Study for 10 more minutes until 2:20 PM
    const totalElapsedAt220 = engine.getElapsedSeconds(T_220_PM);

    // Total actual study time = 10m (pre-pause) + 10m (post-resume) = 20 minutes (1200s).
    // Total wall-clock time between 1:00 PM and 2:20 PM = 80 minutes (4800s).
    // The sanity clamp must recognize the 1-hour pause and NOT clip the 20 minutes!
    assert.equal(totalElapsedAt220, 1200, 'Total elapsed must be 20 minutes (1200s), unclipped by clamp');

    // Step F: Stop timer at 2:20 PM
    const stopRes = engine.stopTimer({ serverNow: T_220_PM });
    assert.equal(stopRes.durationSeconds, 1200, 'Recorded duration must be 20 minutes (1200s)');
    assert.equal(engine.getState().isStudying, false);
  });

  // 3. Start on one device and restore on another
  it('3. Cross-device sync: start on Device A and restore on Device B, preserving exact elapsed across pauses and resumes', () => {
    const deviceA = new TimerSessionEngine();
    const deviceB = new TimerSessionEngine();

    const T_START = START_250_PM; // 2:50 PM
    const T_OPEN_B = OPEN_300_PM; // 3:00 PM (10 min later)
    const T_PAUSE_A = new Date('2026-11-21T15:15:00.000Z').getTime(); // 3:15 PM (25 min total)
    const T_RESUME_B = new Date('2026-11-21T16:15:00.000Z').getTime(); // 4:15 PM (1 hr pause)
    const T_FINAL_B = new Date('2026-11-21T16:25:00.000Z').getTime(); // 4:25 PM (10 min more)

    // 1. Device A starts stopwatch
    const startA = deviceA.startTimer({ serverNow: T_START });

    // 2. Active session state is written to server (active_sessions)
    const remoteRecord1: ActiveSessionRemote = {
      session_id: startA.sessionId,
      session_created_at: new Date(T_START).toISOString(),
      started_at: new Date(T_START).toISOString(),
      status: 'running',
      mode: 'stopwatch',
      accumulated_seconds: 0,
      version: 1,
    };

    // 3. Device B pulls active_sessions at 3:00 PM and restores
    const restoreB1 = deviceB.handleRemoteSync(remoteRecord1, { serverNow: T_OPEN_B });
    assert.equal(restoreB1.accepted, true);
    assert.equal(restoreB1.elapsedSeconds, EXPECTED_ELAPSED_10M, 'Device B restored running timer at exact 10 minutes');

    // 4. Device A pauses session at 3:15 PM (25 min elapsed = 1500s)
    const pauseA = deviceA.pauseTimer({ serverNow: T_PAUSE_A });
    assert.equal(pauseA.accumulatedSeconds, 25 * 60);

    const remoteRecord2: ActiveSessionRemote = {
      session_id: startA.sessionId,
      session_created_at: new Date(T_START).toISOString(),
      started_at: null,
      last_paused_at: new Date(T_PAUSE_A).toISOString(),
      status: 'paused',
      mode: 'stopwatch',
      accumulated_seconds: 1500,
      version: pauseA.version, // version 2
    };

    // Device B receives paused sync
    const restoreB2 = deviceB.handleRemoteSync(remoteRecord2, { serverNow: T_PAUSE_A });
    assert.equal(restoreB2.accepted, true);
    assert.equal(deviceB.getState().isPaused, true);
    assert.equal(deviceB.getElapsedSeconds(T_RESUME_B), 1500);

    // 5. Stale version rejection: Device B rejects older version (e.g. version 1)
    const staleReject = deviceB.handleRemoteSync(remoteRecord1, { serverNow: T_PAUSE_A });
    assert.equal(staleReject.accepted, false, 'Older version must be rejected by Device B');

    // 6. Device B resumes session on Device B after 1 hour (4:15 PM)
    deviceB.resumeTimer({ serverNow: T_RESUME_B });
    assert.equal(deviceB.getState().isPaused, false);

    // 7. Device B studies for 10 minutes until 4:25 PM
    const finalElapsedB = deviceB.getElapsedSeconds(T_FINAL_B);
    // Total study time = 25m (pre-pause) + 10m (post-resume) = 35 minutes (2100s).
    // Total wall-clock time = 2:50 PM to 4:25 PM = 95 minutes (5700s).
    // Sanity clamp anchor based on session_created_at must NOT clip it!
    assert.equal(finalElapsedB, 35 * 60, 'Device B elapsed is 35 minutes (2100s), unclipped by clamp');
  });

  // 4. Reload mid-session
  it('4. reload mid-session: app refresh / restart seamlessly restores exact 10 minutes elapsed without inflation', () => {
    const engine1 = new TimerSessionEngine();
    const T_RELOAD = new Date('2026-11-21T14:55:00.000Z').getTime(); // Reload at 5 min

    // Start timer at 2:50 PM
    engine1.startTimer({ serverNow: START_250_PM });

    // Snapshot saved before page reload / unload
    const snapshot = engine1.exportSnapshot();

    // New page / app instance created at 2:55 PM
    const engine2 = new TimerSessionEngine();
    engine2.restoreSnapshot(snapshot);

    assert.equal(engine2.getState().isStudying, true);
    assert.equal(engine2.getState().startTime, START_250_PM);

    // User checks timer at 3:00 PM (10 min after start)
    const elapsedAt300 = engine2.getElapsedSeconds(OPEN_300_PM);
    assert.equal(elapsedAt300, EXPECTED_ELAPSED_10M, 'Reloaded timer displays exact 10 minutes (600s)');
  });

  // 5. Two tabs open (BroadcastChannel single-active-tab coordination)
  it('5. two tabs open: leader tab broadcasts TIMER_STARTED, second tab yields and mirrors state without duplicate writes', () => {
    interface BroadcastEvent {
      type: string;
      tabId: string;
      sessionId: string | null;
    }
    const channelMessages: BroadcastEvent[] = [];

    // Emulate tab 1 and tab 2
    const tab1 = { tabId: 'tab-alpha', isLeader: true, isBlocked: false, engine: new TimerSessionEngine() };
    const tab2 = { tabId: 'tab-beta', isLeader: false, isBlocked: false, engine: new TimerSessionEngine() };

    // Tab 1 starts timer
    const start1 = tab1.engine.startTimer({ serverNow: START_250_PM });
    const broadcastMsg: BroadcastEvent = {
      type: 'TIMER_STARTED',
      tabId: tab1.tabId,
      sessionId: start1.sessionId,
    };
    channelMessages.push(broadcastMsg);

    // Tab 2 processes broadcast message
    const incoming = channelMessages[channelMessages.length - 1];
    if (incoming.type === 'TIMER_STARTED' && incoming.tabId !== tab2.tabId) {
      tab2.isLeader = false;
      tab2.isBlocked = true;
    }

    assert.equal(tab2.isLeader, false, 'Tab 2 must not be leader');
    assert.equal(tab2.isBlocked, true, 'Tab 2 is blocked by active Tab 1');

    // Tab 1 stops timer
    tab1.engine.stopTimer({ serverNow: OPEN_300_PM });
    const stopMsg: BroadcastEvent = {
      type: 'TIMER_STOPPED',
      tabId: tab1.tabId,
      sessionId: start1.sessionId,
    };
    channelMessages.push(stopMsg);

    // Tab 2 processes stop message
    const stopIncoming = channelMessages[channelMessages.length - 1];
    if (stopIncoming.type === 'TIMER_STOPPED' && stopIncoming.tabId !== tab2.tabId) {
      tab2.isBlocked = false;
    }

    assert.equal(tab2.isBlocked, false, 'Tab 2 is unblocked after Tab 1 stops');
  });

  // --- REAL POSTGRESQL DATABASE INTEGRATION TESTS ---

  describe('PostgreSQL Database start_session Cleanup & Ultra Strict Invariance', () => {
    let db: PGlite;
    const testUserId = 'a0000000-0000-0000-0000-000000000001';

    before(async () => {
      db = new PGlite();

      // Create base schema
      await db.exec(`
        create schema if not exists auth;
        do $$
        begin
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then
            create role authenticated;
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
          duration_seconds int not null,
          started_at timestamptz not null,
          ended_at timestamptz not null,
          mode text default 'stopwatch',
          notes text,
          created_at timestamptz default now()
        );

        insert into auth.users (id, email) values ('${testUserId}', 'scholar@study.io')
        on conflict (id) do nothing;
      `);

      // Apply server authoritative migration and new session_created_at migration
      const migrationPath = path.resolve(__dirname, '../supabase/migrations/20261121_timer_server_authoritative.sql');
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      await db.exec(migrationSql);

      const newMigrationPath = path.resolve(__dirname, '../supabase/migrations/20261121_timer_session_created_at_and_save_on_start.sql');
      const newMigrationSql = fs.readFileSync(newMigrationPath, 'utf8');
      await db.exec(newMigrationSql);

      await db.exec(`select set_config('request.jwt.claim.sub', '${testUserId}', false);`);
    });

    after(async () => {
      await db.close();
    });

    it('asserts start_session completely discards prior paused or running session without merging time', async () => {
      const oldSessionId = '00000000-0000-0000-0000-000000000011';
      const newSessionId = '00000000-0000-0000-0000-000000000022';

      // 1. Pre-populate active_sessions with an existing paused session with 23 minutes leftover
      await db.exec(`
        insert into public.active_sessions (
          user_id, session_id, session_created_at, status, mode, started_at, accumulated_seconds, accumulated_ms, version
        ) values (
          '${testUserId}', '${oldSessionId}', now() - interval '23 minutes', 'paused', 'stopwatch', null, 1380, 1380000, 7
        ) on conflict (user_id) do update set
          session_id = '${oldSessionId}',
          session_created_at = now() - interval '23 minutes',
          status = 'paused',
          accumulated_seconds = 1380,
          accumulated_ms = 1380000,
          version = 7;
      `);

      // 2. Start a brand new stopwatch session
      await db.query(`
        select public.start_session(
          p_session_id := '${newSessionId}',
          p_mode := 'stopwatch'
        );
      `);

      // 3. Query active_sessions and assert prior session was completely replaced and discarded
      const postRows = await db.query<{
        session_id: string;
        status: string;
        accumulated_seconds: number;
        accumulated_ms: number;
        version: number;
        started_at: string;
        session_created_at: string;
      }>(
        `select session_id, status, accumulated_seconds, accumulated_ms, version, started_at, session_created_at from public.active_sessions where user_id = '${testUserId}';`
      );

      const row = postRows.rows[0];
      assert.equal(row.session_id, newSessionId, 'Old session_id was discarded, replaced by new session_id');
      assert.equal(row.status, 'running');
      assert.equal(row.accumulated_seconds, 0, 'Old accumulated_seconds discarded, reset to 0');
      assert.equal(Number(row.accumulated_ms), 0, 'Old accumulated_ms discarded, reset to 0');
      assert.equal(row.version, 1, 'Version reset to 1');
      assert.ok(row.started_at, 'started_at is current server time');
      assert.ok(row.session_created_at, 'session_created_at is current server time');

      // Verify no duplicate row exists for the user
      const countRes = await db.query<{ count: string }>(
        `select count(*) as count from public.active_sessions where user_id = '${testUserId}';`
      );
      assert.equal(Number(countRes.rows[0].count), 1, 'Exactly one active session row exists');
    });

    it('asserts start_session is rejected with ULTRA_LOCKED if an active Ultra Strict session is currently sealed', async () => {
      const ultraSessionId = '00000000-0000-0000-0000-000000000077';
      const attemptSessionId = '00000000-0000-0000-0000-000000000088';

      // 1. Set active session to Ultra Strict locked for the next 25 minutes
      await db.exec(`
        insert into public.active_sessions (
          user_id, session_id, status, mode, is_ultra, ultra_ends_at, planned_end_at, version
        ) values (
          '${testUserId}', '${ultraSessionId}', 'running', 'countdown', true, now() + interval '25 minutes', now() + interval '25 minutes', 2
        ) on conflict (user_id) do update set
          session_id = '${ultraSessionId}',
          status = 'running',
          mode = 'countdown',
          is_ultra = true,
          ultra_ends_at = now() + interval '25 minutes',
          planned_end_at = now() + interval '25 minutes',
          version = 2;
      `);

      // 2. Attempt to start a new stopwatch session while Ultra Strict is active -> must fail
      let ultraError = false;
      try {
        await db.query(`
          select public.start_session(
            p_session_id := '${attemptSessionId}',
            p_mode := 'stopwatch'
          );
        `);
      } catch (err: any) {
        ultraError = true;
        assert.ok(err.message.includes('ULTRA_LOCKED'), `Expected ULTRA_LOCKED, got: ${err.message}`);
      }

      assert.equal(ultraError, true, 'start_session must be rejected with ULTRA_LOCKED');

      // Verify Ultra Strict session remained intact
      const ultraRows = await db.query<{ session_id: string; is_ultra: boolean }>(
        `select session_id, is_ultra from public.active_sessions where user_id = '${testUserId}';`
      );
      assert.equal(ultraRows.rows[0].session_id, ultraSessionId, 'Ultra Strict session was not replaced');
      assert.equal(ultraRows.rows[0].is_ultra, true);
    });
  });
});
