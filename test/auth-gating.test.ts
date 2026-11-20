import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { isRealUserAccount, hasValidCachedSession, saveCachedUserState, clearCachedUserState, CACHED_USER_STATE_KEY } from '../src/lib/userCache';
import { cleanupLegacyDemoData } from '../src/lib/mockData';

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
});
