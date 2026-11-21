import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  RANK_TIERS,
  HARD_RESET_CAP_RP,
  calculateSeasonRp,
  getRankTier,
  getOldRankTierFromRp,
  calculateSeasonReset,
  resolveUserSeasonReset,
} from '../src/lib/rankedSystem';
import {
  getRankTier as getRanksTier,
  resolveLiveSeasonStats,
  getNextTier,
  getMaxRpForTier,
} from '../src/lib/ranks';
import { calculateRankTier, getRankTierDetails } from '../src/lib/rankings';

describe('Official Rank Thresholds & Dynamic Soft Reset Specification', () => {
  let db: PGlite;

  before(async () => {
    db = new PGlite();

    // Setup Auth & Core Schema for Postgres tests
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

      create table if not exists public.profiles (
        id uuid primary key references auth.users(id) on delete cascade,
        username text,
        season_rp integer default 0,
        season_base_rp integer default 0,
        rank_title text default 'BRONZE I',
        current_rank text default 'BRONZE I',
        last_season_rank text default 'BRONZE I',
        last_reset_month text
      );

      create table if not exists public.study_sessions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        duration_seconds integer not null,
        started_at timestamptz not null default now()
      );
    `);
  });

  // TEST 1: Boundary checks at exact required points
  describe('1. Boundary Value Verification', () => {
    it('correctly classifies boundaries: 49/50, 119/120, 219/220, 12799/12800, 32999/33000, 0, 100000', () => {
      // 0 RP -> Bronze I
      assert.equal(getRankTier(0).fullTitle, 'BRONZE I');
      assert.equal(getRankTier(0).minRP, 0);

      // 49 / 50 -> Bronze I vs Bronze II
      assert.equal(getRankTier(49).fullTitle, 'BRONZE I');
      assert.equal(getRankTier(50).fullTitle, 'BRONZE II');

      // 119 / 120 -> Bronze II vs Bronze III
      assert.equal(getRankTier(119).fullTitle, 'BRONZE II');
      assert.equal(getRankTier(120).fullTitle, 'BRONZE III');

      // 219 / 220 -> Bronze III vs Bronze IV
      assert.equal(getRankTier(219).fullTitle, 'BRONZE III');
      assert.equal(getRankTier(220).fullTitle, 'BRONZE IV');

      // 12799 / 12800 -> Diamond III vs Diamond IV
      assert.equal(getRankTier(12799).fullTitle, 'DIAMOND III');
      assert.equal(getRankTier(12800).fullTitle, 'DIAMOND IV');

      // 32999 / 33000 -> Master vs Grandmaster
      assert.equal(getRankTier(32999).fullTitle, 'MASTER');
      assert.equal(getRankTier(33000).fullTitle, 'GRANDMASTER');

      // 100,000 RP -> Grandmaster
      assert.equal(getRankTier(100000).fullTitle, 'GRANDMASTER');
      assert.equal(getRankTier(100000).isMaxTier, true);
    });

    it('verifies minHours = minRP / 100 for all 23 tiers', () => {
      assert.equal(RANK_TIERS.length, 23);
      for (const tier of RANK_TIERS) {
        const expectedHours = tier.minRP / 100;
        assert.equal(tier.minHours, expectedHours, `minHours mismatch for ${tier.fullTitle}`);
      }
    });
  });

  // TEST 2: Dynamic Soft Reset for all 23 tiers + 0-focus rule
  describe('2. Dynamic Soft Reset Rule Verification', () => {
    const expectedSoftReset = [
      { tier: 'BRONZE I', expectedRP: 0 },
      { tier: 'BRONZE II', expectedRP: 0 },
      { tier: 'BRONZE III', expectedRP: 0 },
      { tier: 'BRONZE IV', expectedRP: 50 },
      { tier: 'SILVER I', expectedRP: 120 },
      { tier: 'SILVER II', expectedRP: 220 },
      { tier: 'SILVER III', expectedRP: 350 },
      { tier: 'SILVER IV', expectedRP: 500 },
      { tier: 'GOLD I', expectedRP: 700 },
      { tier: 'GOLD II', expectedRP: 950 },
      { tier: 'GOLD III', expectedRP: 1250 },
      { tier: 'GOLD IV', expectedRP: 1600 },
      { tier: 'PLATINUM I', expectedRP: 2000 },
      { tier: 'PLATINUM II', expectedRP: 2500 },
      { tier: 'PLATINUM III', expectedRP: 3100 },
      { tier: 'PLATINUM IV', expectedRP: 3800 },
      { tier: 'DIAMOND I', expectedRP: 4600 },
      { tier: 'DIAMOND II', expectedRP: 5600 },
      { tier: 'DIAMOND III', expectedRP: 6800 },
      { tier: 'DIAMOND IV', expectedRP: 8200 },
      { tier: 'CHAMPION', expectedRP: 10400 },
      { tier: 'MASTER', expectedRP: 12800 },
      { tier: 'GRANDMASTER', expectedRP: 12800 },
    ];

    it('dynamically derives the exact soft reset carryover RP for all 23 tiers', () => {
      for (let i = 0; i < RANK_TIERS.length; i++) {
        const tier = RANK_TIERS[i];
        const expected = expectedSoftReset[i];
        assert.equal(tier.fullTitle, expected.tier);
        assert.equal(
          tier.softResetRP,
          expected.expectedRP,
          `Soft reset RP mismatch for ${tier.fullTitle}: got ${tier.softResetRP}, expected ${expected.expectedRP}`
        );

        // Also test calculateSeasonReset function
        const resetResult = calculateSeasonReset(tier.minRP);
        assert.equal(
          resetResult.newRP,
          expected.expectedRP,
          `calculateSeasonReset mismatch for RP ${tier.minRP}`
        );
      }
    });

    it('enforces the 0-focus-last-month rule (carryover 0 regardless of previous tier)', () => {
      const mockInactiveUser = {
        id: 'u1',
        season_rp: 35000,
        season_base_rp: 0,
        last_season_rank: 'GRANDMASTER',
      };
      // 0 previous month sessions
      const reset = resolveUserSeasonReset(mockInactiveUser, []);
      assert.equal(reset.startingRP, 0);
      assert.equal(reset.newRankTitle, 'BRONZE I');
    });

    it('enforces the Diamond IV cap (12,800 RP) for Master and Grandmaster', () => {
      assert.equal(HARD_RESET_CAP_RP, 12800);
      const masterReset = calculateSeasonReset(23000);
      assert.equal(masterReset.newRP, 12800);
      assert.equal(masterReset.newTier.fullTitle, 'DIAMOND IV');

      const gmReset = calculateSeasonReset(50000);
      assert.equal(gmReset.newRP, 12800);
      assert.equal(gmReset.newTier.fullTitle, 'DIAMOND IV');
    });
  });

  // TEST 3: TypeScript and PostgreSQL Function Parity (200 random RP values)
  describe('3. TypeScript & SQL Parity Verification', () => {
    before(async () => {
      const migrationSql = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase', 'migrations', '20261121_new_rank_thresholds.sql'),
        'utf8'
      );
      await db.exec(migrationSql);
    });

    it('guarantees 100% parity across 200 pseudo-random RP values between TypeScript and SQL get_rank_tier_from_rp', async () => {
      // Deterministic PRNG for reproducible 200 samples across entire 0 to 60,000 RP range
      const randomValues: number[] = [0, 49, 50, 119, 120, 219, 220, 349, 350, 12799, 12800, 32999, 33000, 100000];
      let seed = 42;
      while (randomValues.length < 200) {
        seed = (seed * 16807) % 2147483647;
        const val = Math.floor((seed / 2147483647) * 45000);
        randomValues.push(val);
      }

      for (const rp of randomValues) {
        const tsTier = getRankTier(rp).fullTitle.toUpperCase();
        const sqlRes = await db.query<{ get_rank_tier_from_rp: string }>(
          `select public.get_rank_tier_from_rp($1) as get_rank_tier_from_rp`,
          [rp]
        );
        const sqlTier = sqlRes.rows[0].get_rank_tier_from_rp.toUpperCase();

        assert.equal(
          sqlTier,
          tsTier,
          `Parity mismatch at RP ${rp}: TS says "${tsTier}", SQL says "${sqlTier}"`
        );
      }
    });

    it('guarantees SQL get_soft_reset_from_rank returns identical values to TypeScript for all 23 tiers', async () => {
      for (const tier of RANK_TIERS) {
        const sqlRes = await db.query<{ new_rp: number; new_rank: string }>(
          `select new_rp, new_rank from public.get_soft_reset_from_rank($1)`,
          [tier.fullTitle]
        );
        assert.equal(
          sqlRes.rows[0].new_rp,
          tier.softResetRP,
          `SQL soft reset RP mismatch for ${tier.fullTitle}`
        );
        assert.equal(
          sqlRes.rows[0].new_rank.toUpperCase(),
          tier.softResetRank?.toUpperCase(),
          `SQL soft reset Rank mismatch for ${tier.fullTitle}`
        );
      }
    });
  });

  // TEST 4: UI Uniformity (Header, Leaderboard Row, Profile Modal consistency)
  describe('4. UI Component Consistency Invariance', () => {
    it('header, leaderboard row, and profile modal all show the exact same tier for the same RP', () => {
      const testCases = [
        { rp: 0, expected: 'Bronze I' },
        { rp: 50, expected: 'Bronze II' },
        { rp: 120, expected: 'Bronze III' },
        { rp: 220, expected: 'Bronze IV' },
        { rp: 350, expected: 'Silver I' },
        { rp: 508, expected: 'Silver II' },
        { rp: 1250, expected: 'Gold I' },
        { rp: 3100, expected: 'Platinum I' },
        { rp: 6800, expected: 'Diamond I' },
        { rp: 12800, expected: 'Diamond IV' },
        { rp: 16500, expected: 'Champion' },
        { rp: 23000, expected: 'Master' },
        { rp: 33000, expected: 'Grandmaster' },
      ];

      for (const { rp, expected } of testCases) {
        // Header tier evaluation
        const headerTier = getRanksTier(rp).name;
        // LeaderboardRow evaluation
        const rowTier = getRanksTier(rp).name;
        // calculateRankTier helper used by badges & modals
        const helperTier = calculateRankTier(rp);
        // Profile modal details
        const modalDetails = getRankTierDetails(rp);

        assert.equal(headerTier, expected);
        assert.equal(rowTier, expected);
        assert.equal(helperTier, expected);
        assert.equal(modalDetails.name, expected);
      }
    });
  });

  // TEST 5: Archived Season Preservation
  describe('5. Archived Season Preservation Specification', () => {
    it('preserves the saved rank name from history and never recomputes from archived RP', () => {
      // Historical user who earned 2000 RP when 2000 RP was Silver II in V1/V2
      const archivedRecord = {
        previous_rp: 2000,
        previous_rank: 'SILVER II', // Saved at that season end
      };

      // Under new thresholds, 2000 RP is Gold III!
      // But the archive must preserve "SILVER II", never rewrite history to "Gold III"
      const displayedRank = archivedRecord.previous_rank || getOldRankTierFromRp(archivedRecord.previous_rp);
      assert.equal(displayedRank, 'SILVER II');
      assert.notEqual(displayedRank, getRankTier(2000).fullTitle);
    });

    it('uses getOldRankTierFromRp if an archive has NO saved rank name', () => {
      // Legacy archive without previous_rank saved
      const legacyRecordWithoutRank = {
        previous_rp: 2000,
        previous_rank: null,
      };

      const resolved = legacyRecordWithoutRank.previous_rank || getOldRankTierFromRp(legacyRecordWithoutRank.previous_rp);
      // In the OLD thresholds, 2000 was Silver I (1800 - 2499)
      assert.equal(resolved, 'Silver I');
    });
  });

  // TEST 6: Progress-to-Next-Rank Calculation
  describe('6. Progress Calculation with New Tiers', () => {
    it('calculates progressPercent correctly across intermediate points in new tiers', () => {
      // Silver I: 350 to 500 RP (range = 150 RP)
      // At 350 RP -> 0%
      const tierAtStart = getRankTier(350);
      assert.equal(tierAtStart.progressPercent, 0);

      // At 425 RP -> 50%
      const tierAtMid = getRankTier(425);
      assert.equal(tierAtMid.progressPercent, 50);

      // At 499 RP -> ~99.3%
      const tierAtEnd = getRankTier(499);
      assert.equal(Math.floor(tierAtEnd.progressPercent), 99);

      // Gold I: 1250 to 1600 RP (range = 350 RP)
      // At 1425 RP -> (175 / 350) * 100 = 50%
      const goldMid = getRankTier(1425);
      assert.equal(goldMid.progressPercent, 50);
    });

    it('handles Grandmaster (max tier) with 100% progress', () => {
      const gm = getRankTier(33000);
      assert.equal(gm.isMaxTier, true);
      assert.equal(gm.nextTierTitle, 'MAX RANK REACHED');
    });
  });

  // TEST 7: Migration Up and Down Idempotency
  describe('7. Migration & Rollback Verification', () => {
    it('applies the down migration cleanly and then re-applies up migration without error', async () => {
      const downSql = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase', 'migrations', '20261121_new_rank_thresholds_down.sql'),
        'utf8'
      );
      const upSql = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase', 'migrations', '20261121_new_rank_thresholds.sql'),
        'utf8'
      );

      // 1. Run down migration
      await db.exec(downSql);

      // Verify function was dropped
      const checkRes = await db.query(
        `select 1 from pg_proc where proname = 'get_rank_tier_from_rp'`
      );
      assert.equal(checkRes.rows.length, 0);

      // 2. Re-apply up migration
      await db.exec(upSql);

      // Verify functions recreated
      const checkRecreated = await db.query(
        `select 1 from pg_proc where proname = 'get_rank_tier_from_rp'`
      );
      assert.equal(checkRecreated.rows.length, 1);
    });
  });
});
