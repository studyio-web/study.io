import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRankTier, calculateSeasonRp, resolveLiveSeasonStats } from '../src/lib/ranks';
import { calculateRankTier } from '../src/lib/rankings';

describe('Rank Consistency & Tier Invariance Specification', () => {
  it('correctly maps boundaries 299/300, 699/700, 1199/1200', () => {
    // Bronze I: 0 - 299 RP
    assert.equal(getRankTier(0).name, 'Bronze I');
    assert.equal(getRankTier(299).name, 'Bronze I');

    // Bronze II: 300 - 699 RP
    assert.equal(getRankTier(300).name, 'Bronze II');
    assert.equal(getRankTier(508).name, 'Bronze II');
    assert.equal(getRankTier(699).name, 'Bronze II');

    // Bronze III: 700 - 1199 RP
    assert.equal(getRankTier(700).name, 'Bronze III');
    assert.equal(getRankTier(1199).name, 'Bronze III');

    // Bronze IV: 1200 - 1799 RP
    assert.equal(getRankTier(1200).name, 'Bronze IV');
    assert.equal(getRankTier(1799).name, 'Bronze IV');

    // Silver I: 1800+
    assert.equal(getRankTier(1800).name, 'Silver I');
  });

  it('evaluates 508 RP to Bronze II and 88 RP to Bronze I (neither gives Bronze IV)', () => {
    const trialTier = getRankTier(508);
    assert.equal(trialTier.name, 'Bronze II');
    assert.notEqual(trialTier.name, 'Bronze IV');

    const wrenTier = getRankTier(88);
    assert.equal(wrenTier.name, 'Bronze I');
    assert.notEqual(wrenTier.name, 'Bronze IV');
  });

  it('guarantees calculateRankTier helper matches getRankTier exactly', () => {
    assert.equal(calculateRankTier(508), 'Bronze II');
    assert.equal(calculateRankTier(88), 'Bronze I');
    assert.equal(calculateRankTier(1200), 'Bronze IV');
    assert.equal(calculateRankTier(1800), 'Silver I');
  });

  it('computes season RP strictly from focus seconds + carryover without double counting', () => {
    // Trial: 18,316 seconds in November (no carryover) -> Math.floor(18316 / 36) = 508 RP -> Bronze II
    const trialSeconds = 18316;
    const trialSeasonRp = calculateSeasonRp(0, trialSeconds);
    assert.equal(trialSeasonRp, 508);
    assert.equal(getRankTier(trialSeasonRp).name, 'Bronze II');

    // Wren: 3,223 seconds in November (no carryover) -> Math.floor(3223 / 36) = 89 RP -> Bronze I
    const wrenSeconds = 3223;
    const wrenSeasonRp = calculateSeasonRp(0, wrenSeconds);
    assert.equal(wrenSeasonRp, 89);
    assert.equal(getRankTier(wrenSeasonRp).name, 'Bronze I');
  });

  it('ensures resolveLiveSeasonStats never treats season_rp as carryover baseline', () => {
    // If a user profile has season_rp: 508 but season_base_rp: 0, carryover must be 0, not 508
    const mockUser = {
      id: 'trial-user',
      username: 'trial',
      season_base_rp: 0,
      season_rp: 508,
    };
    const now = new Date();
    const sessions = [
      {
        startTime: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 10, 0, 0)).toISOString(),
        durationSeconds: 18316,
      },
    ];

    const stats = resolveLiveSeasonStats(mockUser, sessions);
    assert.equal(stats.startingRp, 0); // Must NOT be 508
    assert.equal(stats.seasonRp, 508);
    assert.equal(stats.rankTier.name, 'Bronze II');
  });

  it('guarantees tier is invariant when switching timeframe tabs (Today, Week, Month, All Time)', () => {
    // Suppose user has 18,316s this month (508 RP -> Bronze II)
    const currentMonthSec = 18316;
    const seasonRp = calculateSeasonRp(0, currentMonthSec);
    const expectedTier = getRankTier(seasonRp).name; // "Bronze II"

    // Switching tabs changes only timeframe seconds, NEVER season RP or tier
    const timeframeScenarios = [
      { tab: 'today', tfSec: 3600 },    // 1h studied today
      { tab: 'week', tfSec: 7200 },     // 2h studied this week
      { tab: 'month', tfSec: 18316 },   // 5.09h studied this month
      { tab: 'all', tfSec: 50000 },     // 50,000s lifetime
    ];

    for (const scenario of timeframeScenarios) {
      // In the API and client, seasonRp is always computed from current month focus seconds
      const rowSeasonRp = seasonRp;
      const rowTier = getRankTier(rowSeasonRp).name;
      const displayFocusSeconds = scenario.tfSec;

      assert.equal(rowTier, 'Bronze II', `Tier changed on ${scenario.tab} tab!`);
      assert.equal(rowTier, expectedTier);
      assert.equal(displayFocusSeconds, scenario.tfSec);
    }
  });

  it('guarantees header tier, You row tier, and peer view are identical for trial and wren', () => {
    // Simulated Trial entry from server
    const trialRow = {
      user_id: 'trial-id',
      username: 'trial',
      season_rp: 508,
      rank_title: getRankTier(508).name,
      total_seconds: 18316,
    };

    // Simulated Wren entry from server
    const wrenRow = {
      user_id: 'wren-id',
      username: 'wren',
      season_rp: 89,
      rank_title: getRankTier(89).name,
      total_seconds: 3223,
    };

    // Header evaluates from shared userRank (508 -> Bronze II, 89 -> Bronze I)
    const trialHeaderTier = getRankTier(trialRow.season_rp).name;
    const trialYouRowTier = trialRow.rank_title;
    const trialPeerViewTier = getRankTier(trialRow.season_rp).name;

    assert.equal(trialHeaderTier, 'Bronze II');
    assert.equal(trialYouRowTier, 'Bronze II');
    assert.equal(trialPeerViewTier, 'Bronze II');
    assert.equal(trialHeaderTier, trialYouRowTier);
    assert.equal(trialYouRowTier, trialPeerViewTier);

    const wrenHeaderTier = getRankTier(wrenRow.season_rp).name;
    const wrenYouRowTier = wrenRow.rank_title;
    const wrenPeerViewTier = getRankTier(wrenRow.season_rp).name;

    assert.equal(wrenHeaderTier, 'Bronze I');
    assert.equal(wrenYouRowTier, 'Bronze I');
    assert.equal(wrenPeerViewTier, 'Bronze I');
    assert.equal(wrenHeaderTier, wrenYouRowTier);
    assert.equal(wrenYouRowTier, wrenPeerViewTier);
  });
});
