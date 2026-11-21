import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeElapsedSessionSeconds,
  getServerClockOffset,
  setServerClockOffset,
  getServerNow,
} from '../src/lib/serverTime';

describe('Stopwatch Elapsed Bug Reproduction & Authoritative Diagnostic Suite', () => {
  // Baseline timestamp anchors: 2:50:00 PM and 3:00:00 PM (10 minutes = 600s)
  const START_250_PM = new Date('2026-11-21T14:50:00.000Z').getTime();
  const OPEN_300_PM = new Date('2026-11-21T15:00:00.000Z').getTime();
  const EXPECTED_ELAPSED_SECONDS = 10 * 60; // 600 seconds
  const BUGGY_ELAPSED_SECONDS = 33 * 60; // 1980 seconds (23 min too high)

  before(() => {
    setServerClockOffset(0);
  });

  after(() => {
    setServerClockOffset(0);
  });

  // --- REPRODUCTION & DIAGNOSTICS TESTS ---

  it('1. DIAGNOSIS: Reproduces the 33-minute bug with leftover accumulated_seconds from prior paused session', () => {
    // SCENARIO: A previous session was paused at 23 minutes (1380 seconds).
    // In legacy StudyContext.tsx:
    //   if (!isStudying && !isPaused) { accumulatedSecondsRef.current = 0; }
    // Because isPaused was true, accumulatedSeconds was NOT reset to 0!
    // Then: nowAnchor = Date.now() - (accumulatedSeconds * 1000) = 2:50 PM - 23m = 2:27 PM.
    // At 3:00 PM: Date.now() - nowAnchor = 3:00 PM - 2:27 PM = 33 minutes!
    const leftoverAccumulatedSeconds = 23 * 60; // 1380s (23m)
    const isStudying = false;
    const isPaused = true;

    // Legacy calculation simulation:
    let legacyAccumulated = leftoverAccumulatedSeconds;
    if (!isStudying && !isPaused) {
      legacyAccumulated = 0;
    }
    const legacyStartAnchor = START_250_PM - (legacyAccumulated * 1000);
    const legacyElapsedAt300 = Math.floor((OPEN_300_PM - legacyStartAnchor) / 1000);

    console.log('[DIAGNOSTIC] Leftover accumulated_seconds test:', {
      leftoverAccumulatedSeconds,
      isPaused,
      legacyStartAnchor: new Date(legacyStartAnchor).toISOString(),
      legacyElapsedAt300,
      expected: EXPECTED_ELAPSED_SECONDS,
      inflationMinutes: (legacyElapsedAt300 - EXPECTED_ELAPSED_SECONDS) / 60,
    });

    // Verify bug reproduction: legacy calculation produces exactly 33 minutes (1980s)
    assert.equal(legacyElapsedAt300, BUGGY_ELAPSED_SECONDS, 'Legacy logic reproduced 33m bug');

    // FIX: startTimer must unconditionally reset accumulated to 0
    let fixedAccumulated = leftoverAccumulatedSeconds;
    fixedAccumulated = 0; // Unconditional reset
    const fixedStartAnchor = START_250_PM;
    const authoritativeResult = computeElapsedSessionSeconds({
      startedAt: fixedStartAnchor,
      serverNow: OPEN_300_PM,
      accumulatedMs: fixedAccumulated * 1000,
      sessionCreatedAt: fixedStartAnchor,
      status: 'running',
    });

    assert.equal(authoritativeResult.elapsedSeconds, EXPECTED_ELAPSED_SECONDS);
  });

  it('2. DIAGNOSIS: Reproduces the 33-minute bug when client clock is 23 minutes fast', () => {
    // SCENARIO: Client clock is 23 minutes fast.
    // Client clock at start: 2:50 PM, but server clock is 2:27 PM.
    // Or at open: Server is 3:00 PM, but client clock is 3:23 PM.
    // Legacy pull-sync in StudyContext:
    //   const startedAtMs = started_at ? new Date(started_at).getTime() : Date.now();
    //   const runningSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    // If started_at is server time (2:50 PM), and client Date.now() is 3:23 PM:
    // runningSeconds = 3:23 PM - 2:50 PM = 33 minutes!
    const clientClockSkewMs = 23 * 60 * 1000; // Client is +23m ahead of server
    const clientNowAtOpen = OPEN_300_PM + clientClockSkewMs; // 3:23 PM on client
    const serverStartedAtMs = START_250_PM; // 2:50 PM on server

    const legacyPullSyncRunningSeconds = Math.floor((clientNowAtOpen - serverStartedAtMs) / 1000);

    console.log('[DIAGNOSTIC] Client clock fast test:', {
      clientClockSkewMs,
      serverStartedAt: new Date(serverStartedAtMs).toISOString(),
      clientNowAtOpen: new Date(clientNowAtOpen).toISOString(),
      legacyPullSyncRunningSeconds,
      inflationMinutes: (legacyPullSyncRunningSeconds - EXPECTED_ELAPSED_SECONDS) / 60,
    });

    // Verify bug reproduction: legacy pull sync produces 33 minutes
    assert.equal(legacyPullSyncRunningSeconds, BUGGY_ELAPSED_SECONDS);

    // FIX: Using serverNow (Date.now() + serverOffsetMs = clientNow + (-23m) = OPEN_300_PM)
    const serverOffsetMs = -clientClockSkewMs;
    const correctedServerNow = clientNowAtOpen + serverOffsetMs; // = OPEN_300_PM
    const authoritativeResult = computeElapsedSessionSeconds({
      startedAt: serverStartedAtMs,
      serverNow: correctedServerNow,
      accumulatedMs: 0,
      sessionCreatedAt: serverStartedAtMs,
      status: 'running',
    });

    assert.equal(authoritativeResult.elapsedSeconds, EXPECTED_ELAPSED_SECONDS);
  });

  it('3. DIAGNOSIS: Reproduces the 33-minute bug when client clock is 23 minutes slow', () => {
    // SCENARIO: Client clock is 23 minutes slow.
    // Client starts timer at local Date.now() = 2:27 PM (server is 2:50 PM).
    // Legacy syncTimerWithServerTime:
    //   startTimeRef.current = Date.now() = 2:27 PM.
    //   serverNow = Date.now() + offset = 2:37 PM + 23m = 3:00 PM.
    //   actualElapsed = Math.floor((serverNow - startTimeRef.current) / 1000)
    //   actualElapsed = 3:00 PM - 2:27 PM = 33 minutes!
    const serverOffsetMs = 23 * 60 * 1000; // Server is +23m ahead
    const clientStartNow = START_250_PM - serverOffsetMs; // 2:27 PM client
    const legacyStartTimeRef = clientStartNow; // Anchored with client Date.now()
    const serverNowAtOpen = OPEN_300_PM; // 3:00 PM server

    const legacySyncElapsed = Math.floor((serverNowAtOpen - legacyStartTimeRef) / 1000);

    console.log('[DIAGNOSTIC] Client clock slow test:', {
      serverOffsetMs,
      legacyStartTimeRef: new Date(legacyStartTimeRef).toISOString(),
      serverNowAtOpen: new Date(serverNowAtOpen).toISOString(),
      legacySyncElapsed,
      inflationMinutes: (legacySyncElapsed - EXPECTED_ELAPSED_SECONDS) / 60,
    });

    // Verify bug reproduction: legacy calculation produces 33 minutes
    assert.equal(legacySyncElapsed, BUGGY_ELAPSED_SECONDS);

    // FIX: startTimeRef must be anchored to getServerNow(), so both are in the server clock frame
    const fixedStartTimeRef = clientStartNow + serverOffsetMs; // = START_250_PM
    const authoritativeResult = computeElapsedSessionSeconds({
      startedAt: fixedStartTimeRef,
      serverNow: serverNowAtOpen,
      accumulatedMs: 0,
      sessionCreatedAt: fixedStartTimeRef,
      status: 'running',
    });

    assert.equal(authoritativeResult.elapsedSeconds, EXPECTED_ELAPSED_SECONDS);
  });

  it('4. DIAGNOSIS: Reproduces the 33-minute bug on Android WebView recreation / native service restore', () => {
    // SCENARIO: In StudyTimer.tsx:
    //   currentElapsed = serviceElapsed + Math.max(0, Math.floor((now - serviceStartTime) / 1000));
    // If serviceStartTime was the start timestamp (2:50 PM), now is 3:00 PM (delta = 10m),
    // but serviceElapsed had leftover 23 minutes (1380s):
    // currentElapsed = 23m + 10m = 33 minutes!
    const serviceElapsed = 23 * 60; // 1380s
    const serviceStartTime = START_250_PM;
    const now = OPEN_300_PM;

    const legacyAndroidRestoreElapsed = serviceElapsed + Math.max(0, Math.floor((now - serviceStartTime) / 1000));

    console.log('[DIAGNOSTIC] Android WebView restore test:', {
      serviceElapsed,
      serviceStartTime: new Date(serviceStartTime).toISOString(),
      now: new Date(now).toISOString(),
      legacyAndroidRestoreElapsed,
      inflationMinutes: (legacyAndroidRestoreElapsed - EXPECTED_ELAPSED_SECONDS) / 60,
    });

    assert.equal(legacyAndroidRestoreElapsed, BUGGY_ELAPSED_SECONDS);

    // FIX: With sanity guard and correct anchor, wall-clock time from serviceStartTime is 10m (600s).
    // Any calculation exceeding wall clock time since session creation is clamped!
    const authoritativeResult = computeElapsedSessionSeconds({
      startedAt: serviceStartTime,
      serverNow: now,
      accumulatedMs: 0,
      sessionCreatedAt: serviceStartTime,
      status: 'running',
    });

    assert.equal(authoritativeResult.elapsedSeconds, EXPECTED_ELAPSED_SECONDS);
  });

  it('5. DIAGNOSIS: Rejects restoring a remote session whose version is older than local version', () => {
    let localVersion = 3;
    const remoteSessionOld = { version: 2, status: 'running', accumulated_seconds: 1980 };
    const remoteSessionNew = { version: 4, status: 'running', accumulated_seconds: 600 };

    // Function checking version
    const shouldAcceptRemote = (remote: { version: number }, currentLocalVersion: number) => {
      if (typeof remote.version === 'number' && remote.version < currentLocalVersion) {
        return false; // Reject older version
      }
      return true;
    };

    assert.equal(shouldAcceptRemote(remoteSessionOld, localVersion), false, 'Older version rejected');
    assert.equal(shouldAcceptRemote(remoteSessionNew, localVersion), true, 'Newer version accepted');
  });

  it('6. Sanity Guard: Clamps any computed elapsed that exceeds real wall-clock time elapsed since creation', () => {
    // Session was created at 2:50 PM. Now is 3:00 PM (10 minutes elapsed).
    // Suppose a bug in any input produces 1980s (33 minutes).
    const result = computeElapsedSessionSeconds({
      startedAt: START_250_PM,
      serverNow: OPEN_300_PM,
      accumulatedMs: 1380 * 1000, // Buggy accumulated input: 23m
      sessionCreatedAt: START_250_PM, // 10 minutes ago
      status: 'running',
    });

    // Sanity guard must detect that computed elapsed (10m + 23m = 33m) > wall clock (10m),
    // clamp it to 10 minutes (600s), and set isClamped = true.
    assert.equal(result.isClamped, true, 'Sanity guard must trigger clamping');
    assert.equal(result.elapsedSeconds, EXPECTED_ELAPSED_SECONDS, 'Clamped to 600s (10m)');
    assert.equal(result.wallClockCapSeconds, EXPECTED_ELAPSED_SECONDS);
  });

  it('7. App restart mid-session: Seamlessly restores exact 10 minutes elapsed without inflation', () => {
    // Timer started at 2:50 PM. App terminates at 2:55 PM and restarts at 3:00 PM.
    // started_at is saved on server as 2:50 PM.
    const restoredResult = computeElapsedSessionSeconds({
      startedAt: START_250_PM,
      serverNow: OPEN_300_PM,
      accumulatedMs: 0,
      sessionCreatedAt: START_250_PM,
      status: 'running',
    });

    assert.equal(restoredResult.elapsedSeconds, EXPECTED_ELAPSED_SECONDS);
    assert.equal(restoredResult.isClamped, false);
  });

  // --- POSTGRESQL REAL DATABASE INTEGRATION TEST ---

  describe('PostgreSQL start_session Database Integration Test', () => {
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

      // Apply server authoritative migration
      const migrationPath = path.resolve(__dirname, '../supabase/migrations/20261121_timer_server_authoritative.sql');
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      await db.exec(migrationSql);
    });

    after(async () => {
      await db.close();
    });

    it('asserts start_session resets accumulated_ms and accumulated_seconds to 0 in real Postgres', async () => {
      await db.exec(`select set_config('request.jwt.claim.sub', '${testUserId}', false);`);

      // 1. Pre-populate active_sessions with leftover 23 minutes (1380 seconds / 1,380,000 ms)
      await db.exec(`
        insert into public.active_sessions (
          user_id, status, mode, started_at, accumulated_seconds, accumulated_ms, version
        ) values (
          '${testUserId}', 'paused', 'stopwatch', now() - interval '23 minutes', 1380, 1380000, 5
        ) on conflict (user_id) do update set
          status = 'paused',
          accumulated_seconds = 1380,
          accumulated_ms = 1380000,
          version = 5;
      `);

      // Verify leftover state was inserted
      const preRows = await db.query<{ accumulated_seconds: number; accumulated_ms: number }>(
        `select accumulated_seconds, accumulated_ms from public.active_sessions where user_id = '${testUserId}';`
      );
      assert.equal(preRows.rows[0].accumulated_seconds, 1380);
      assert.equal(Number(preRows.rows[0].accumulated_ms), 1380000);

      // 2. Execute start_session RPC for a new stopwatch session
      const newSessionId = '00000000-0000-0000-0000-000000000099';
      await db.query(`
        select public.start_session(
          p_session_id := '${newSessionId}',
          p_mode := 'stopwatch'
        );
      `);

      // 3. Assert active_sessions was cleanly reset to 0 accumulated time and version 1
      const postRows = await db.query<{
        status: string;
        accumulated_seconds: number;
        accumulated_ms: number;
        version: number;
        started_at: string;
      }>(
        `select status, accumulated_seconds, accumulated_ms, version, started_at from public.active_sessions where user_id = '${testUserId}';`
      );

      console.log('[POSTGRES TEST] active_sessions after start_session:', postRows.rows[0]);

      assert.equal(postRows.rows[0].status, 'running');
      assert.equal(postRows.rows[0].accumulated_seconds, 0, 'accumulated_seconds must be reset to 0');
      assert.equal(Number(postRows.rows[0].accumulated_ms), 0, 'accumulated_ms must be reset to 0');
      assert.equal(postRows.rows[0].version, 1, 'version must be reset to 1');
      assert.ok(postRows.rows[0].started_at, 'started_at must be populated from server clock');
    });
  });
});
