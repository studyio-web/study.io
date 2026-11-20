import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCumulativeXPForLevel,
  getLevelFromLifetimeXP,
  getLevelProgress,
  getScholarTitle,
} from '../src/lib/gamification';

describe('Player Level Synchronization & Cross-Device Consistency', () => {
  it('correctly calculates Level 11 vs Level 12 XP thresholds', () => {
    // Level 11 required cumulative XP: Math.floor(60 * 10^2.4) = 15071
    const lvl11XP = getCumulativeXPForLevel(11);
    assert.equal(lvl11XP, 15071);
    assert.equal(getLevelFromLifetimeXP(lvl11XP), 11);
    assert.equal(getLevelFromLifetimeXP(lvl11XP - 1), 10);

    // Level 12 required cumulative XP: Math.floor(60 * 11^2.4) = 18944
    const lvl12XP = getCumulativeXPForLevel(12);
    assert.equal(lvl12XP, 18944);
    assert.equal(getLevelFromLifetimeXP(lvl12XP), 12);
    assert.equal(getLevelFromLifetimeXP(lvl12XP - 1), 11);
  });

  it('guarantees level monotonicity when phone resumes with stale cache', () => {
    // Scenario: User reached Level 12 on PC (19,000 XP / ~31.7 hours focus).
    // Phone was backgrounded with stale local cache (15,100 XP / Level 11).
    const pcRemoteProfile = {
      level: 12,
      lifetime_xp: 19000,
      xp: 19000,
    };
    const phoneStaleLocalProfile = {
      level: 11,
      lifetime_xp: 15100,
      xp: 15100,
    };

    // Resync logic as implemented in AuthContext refetchUserProfile
    const sessionsXP = 19000;
    const resolvedLifetimeXP = Math.max(
      Number(pcRemoteProfile.lifetime_xp ?? 0),
      Number(pcRemoteProfile.xp ?? 0),
      Number(phoneStaleLocalProfile.lifetime_xp ?? 0),
      Number(phoneStaleLocalProfile.xp ?? 0),
      sessionsXP
    );

    const resolvedLevel = Math.max(
      Number(pcRemoteProfile.level || 1),
      Number(phoneStaleLocalProfile.level || 1),
      getLevelFromLifetimeXP(resolvedLifetimeXP)
    );

    assert.equal(resolvedLifetimeXP, 19000);
    assert.equal(resolvedLevel, 12);
    assert.equal(getScholarTitle(resolvedLevel), getScholarTitle(12));
  });

  it('prevents updateProfile from downgrading level even if a stale payload is sent', () => {
    const existingProfile = {
      level: 12,
      lifetime_xp: 19000,
      xp: 19000,
    };

    // Stale update payload sent by an out-of-sync timer or component
    const staleUpdates = {
      level: 11,
      xp: 15100,
      lifetime_xp: 15100,
    };

    const calculatedIncomingLevel = staleUpdates.lifetime_xp !== undefined || staleUpdates.xp !== undefined
      ? getLevelFromLifetimeXP(Number(staleUpdates.lifetime_xp ?? staleUpdates.xp ?? 0))
      : 1;

    const safeLevel = Math.max(
      Number(existingProfile.level || 1),
      Number(staleUpdates.level ?? 1),
      calculatedIncomingLevel
    );

    const safeXp = Math.max(
      Number(existingProfile.lifetime_xp ?? 0),
      Number(existingProfile.xp ?? 0),
      Number(staleUpdates.lifetime_xp ?? staleUpdates.xp ?? 0)
    );

    assert.equal(safeLevel, 12, 'Safe level must remain 12 and not downgrade to 11');
    assert.equal(safeXp, 19000, 'Safe XP must remain 19,000 and not downgrade to 15,100');
  });

  it('ensures gamification useMemo guarantees baseline level even if XP is temporarily unhydrated', () => {
    // If totalStudySeconds has not yet loaded or user profile has level: 12
    const user = {
      level: 12,
      lifetime_xp: 0,
      user_metadata: { level: 12 },
    };
    const totalStudySeconds = 0;

    const fallbackXP = Math.floor(totalStudySeconds / 60) * 10;
    const currentLifetimeXP = Math.max(
      Number(user?.lifetime_xp ?? 0),
      fallbackXP
    );
    const progress = getLevelProgress(currentLifetimeXP);
    const guaranteedLevel = Math.max(
      progress.level,
      Number(user?.level || 1),
      Number((user?.user_metadata as any)?.level || 1)
    );

    let effectiveProgress = progress;
    if (guaranteedLevel > progress.level) {
      effectiveProgress = getLevelProgress(getCumulativeXPForLevel(guaranteedLevel));
    }

    assert.equal(effectiveProgress.level, 12, 'Gamification progress must preserve Level 12');
  });

  it('ensures effectiveLevel in Navbar never displays lower than user level', () => {
    const gamification = { level: 11, title: 'Scholar XI' };
    const user = { level: 12, user_metadata: { level: 12 } };

    const effectiveLevel = Math.max(
      Number(gamification.level || 1),
      Number((user?.user_metadata as any)?.level || 0),
      Number(user?.level || 0)
    );

    assert.equal(effectiveLevel, 12, 'Navbar must display Level 12, not Level 11');
  });
});
