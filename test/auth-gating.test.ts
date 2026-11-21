import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { isRealUserAccount, hasValidCachedSession, saveCachedUserState, getCachedUserState, clearCachedUserState, CACHED_USER_STATE_KEY } from '../src/lib/userCache';
import { cleanupLegacyDemoData, getCachedStreak, setCachedStreak, clearCachedStreak } from '../src/lib/mockData';

// In-memory mock for localStorage in Node test environment
const storageMock: Record<string, string> = {};
(globalThis as any).window = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => storageMock[key] ?? null,
  setItem: (key: string, val: string) => {
    storageMock[key] = String(val);
  },
  removeItem: (key: string) => {
    delete storageMock[key];
  },
  clear: () => {
    for (const k of Object.keys(storageMock)) delete storageMock[k];
  },
};

describe('Strict Authentication & Guest Account Gating Specification', () => {
  beforeEach(() => {
    (globalThis as any).localStorage.clear();
  });

  it('guarantees isRealUserAccount rejects placeholder and guest IDs', () => {
    assert.strictEqual(isRealUserAccount(null), false);
    assert.strictEqual(isRealUserAccount(undefined), false);
    assert.strictEqual(isRealUserAccount(''), false);
    assert.strictEqual(isRealUserAccount('guest'), false);
    assert.strictEqual(isRealUserAccount('guest-123'), false);
    assert.strictEqual(isRealUserAccount('user-scholar-1'), false);
    assert.strictEqual(isRealUserAccount('user-scholar-99'), false);
    assert.strictEqual(isRealUserAccount('user-demo-1'), false);
    assert.strictEqual(isRealUserAccount('scholar'), false);
    assert.strictEqual(isRealUserAccount('null'), false);
  });

  it('guarantees isRealUserAccount accepts verified Supabase user UUIDs', () => {
    assert.strictEqual(isRealUserAccount('d3b07384-0a37-4b71-b062-81734262145b'), true);
    assert.strictEqual(isRealUserAccount('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), true);
    assert.strictEqual(isRealUserAccount('usr_9283741928374'), true);
  });

  it('guarantees hasValidCachedSession returns false for unauthenticated state', () => {
    assert.strictEqual(hasValidCachedSession(), false);

    // Even if cached state exists with guest/mock profile
    saveCachedUserState({
      profile: { id: 'user-scholar-1', displayName: 'Focus Scholar' } as any,
    });
    assert.strictEqual(hasValidCachedSession(), false);

    // Even if studypulse_is_authenticated is true but profile is guest/mock
    (globalThis as any).localStorage.setItem('studypulse_is_authenticated', 'true');
    assert.strictEqual(hasValidCachedSession(), false);
  });

  it('guarantees saveCachedUserState rejects saving guest / mock user profiles', () => {
    saveCachedUserState({
      profile: { id: 'user-scholar-1', displayName: 'Focus Scholar' } as any,
    });
    const state = (globalThis as any).localStorage.getItem(CACHED_USER_STATE_KEY);
    // Profile should not have been saved
    assert.strictEqual(state, null);
  });

  it('guarantees hasValidCachedSession returns true ONLY when authenticated with a real user', () => {
    const realUserId = 'e2f5a1c0-449b-4682-8b30-c081297e099a';
    (globalThis as any).localStorage.setItem('studypulse_is_authenticated', 'true');
    saveCachedUserState({
      profile: { id: realUserId, displayName: 'Verified Scholar' } as any,
    });

    assert.strictEqual(hasValidCachedSession(), true);
  });

  it('guarantees cleanupLegacyDemoData purges leftover user-scholar and Focus Scholar data', () => {
    (globalThis as any).localStorage.setItem('studypulse_active_user', JSON.stringify({
      id: 'user-scholar-1',
      displayName: 'Focus Scholar',
      email: 'user@study.io',
    }));
    (globalThis as any).localStorage.setItem('studypulse_is_authenticated', 'true');
    (globalThis as any).localStorage.setItem(CACHED_USER_STATE_KEY, JSON.stringify({
      profile: { id: 'user-scholar-1' },
    }));

    const cleaned = cleanupLegacyDemoData();
    assert.strictEqual(cleaned, true);
    assert.strictEqual((globalThis as any).localStorage.getItem('studypulse_active_user'), null);
    assert.strictEqual((globalThis as any).localStorage.getItem('studypulse_is_authenticated'), null);
    assert.strictEqual((globalThis as any).localStorage.getItem(CACHED_USER_STATE_KEY), null);
    assert.strictEqual(hasValidCachedSession(), false);
  });

  it('guarantees account switching does NOT leak cached rank, RP or streak across accounts', () => {
    const userA = 'user-a-uuid-1111-2222-3333';
    const userB = 'user-b-uuid-4444-5555-6666';

    // 1. User A logs in and earns 1200 RP (Silver I) and a 14-day streak
    saveCachedUserState({
      userId: userA,
      profile: { id: userA, displayName: 'User Alpha', seasonRp: 1200, streakDays: 14 } as any,
      rp: 1200,
      streakCount: 14,
      rankTitle: 'SILVER I',
    });
    setCachedStreak(14, undefined, userA);

    // Verify User A reads User A data
    const cachedA = getCachedUserState(userA);
    assert.strictEqual(cachedA?.rp, 1200);
    assert.strictEqual(cachedA?.streakCount, 14);
    assert.strictEqual(getCachedStreak(userA), 14);

    // 2. User switches to User B (a brand new user with 0 RP and 0 streak)
    // User B's cache query MUST NOT return User A's 1200 RP or 14 streak!
    const cachedB = getCachedUserState(userB);
    assert.strictEqual(cachedB, null);
    assert.strictEqual(getCachedStreak(userB), 0);

    // 3. User B saves their own initial state (0 RP, 0 streak)
    saveCachedUserState({
      userId: userB,
      profile: { id: userB, displayName: 'User Beta', seasonRp: 0, streakDays: 0 } as any,
      rp: 0,
      streakCount: 0,
      rankTitle: 'BRONZE I',
    });

    const cachedBUpdated = getCachedUserState(userB);
    assert.strictEqual(cachedBUpdated?.rp, 0);
    assert.strictEqual(cachedBUpdated?.streakCount, 0);
    assert.strictEqual(cachedBUpdated?.rankTitle, 'BRONZE I');

    // User A's cached state must still remain isolated
    const cachedAIsolated = getCachedUserState(userA);
    assert.strictEqual(cachedAIsolated?.rp, 1200);
    assert.strictEqual(cachedAIsolated?.streakCount, 14);
  });
});
