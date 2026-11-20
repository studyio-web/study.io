import { UserProfile, Subject } from '../types';
import { resolveScholarName, resolveScholarHandle } from './scholarIdentity';

export interface CachedUserState {
  profile: Partial<UserProfile> | null;
  isPro: boolean;
  streakCount: number;
  rankBadge: string;
  rankTitle?: string;
  rp?: number;
  subjects: Subject[];
  lastUpdated?: number;
}

export const CACHED_USER_STATE_KEY = 'studyio_cached_user_state';

/**
 * Checks whether an account ID belongs to a real authenticated user
 * rather than a guest, demo, or fallback placeholder account.
 */
export function isRealUserAccount(userId?: string | null): boolean {
  if (!userId || typeof userId !== 'string') return false;
  const lower = userId.trim().toLowerCase();
  return (
    lower.length > 0 &&
    !lower.startsWith('user-scholar') &&
    !lower.startsWith('user-demo') &&
    !lower.startsWith('guest') &&
    lower !== 'scholar' &&
    lower !== 'null' &&
    lower !== 'undefined'
  );
}

/**
 * Checks whether there is a verified, authenticated cached session on this device.
 * Guarantees that guest/mock accounts can NEVER be treated as authenticated.
 */
export function hasValidCachedSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const isAuth = localStorage.getItem('studypulse_is_authenticated') === 'true';
    if (!isAuth) return false;

    const cached = getCachedUserState();
    const cachedId = cached?.profile?.id;
    if (cachedId && isRealUserAccount(cachedId)) {
      return true;
    }

    const saved = localStorage.getItem('studypulse_active_user');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.id && isRealUserAccount(parsed.id)) {
        return true;
      }
    }
  } catch {}
  return false;
}

/**
 * Synchronously retrieves cached user profile, Pro status, streak, rank badge,
 * and subjects list from localStorage for sub-second optimistic app launch.
 */
export function getCachedUserState(): CachedUserState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHED_USER_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.profile) {
        parsed.profile.displayName = resolveScholarName(parsed.profile);
        parsed.profile.username = resolveScholarHandle(parsed.profile);
      }
      return parsed as CachedUserState;
    }
  } catch (err) {
    console.warn('[userCache] Error reading cached user state:', err);
  }
  return null;
}

/**
 * Updates the cached user state in localStorage without blocking UI execution.
 */
export function saveCachedUserState(updates: Partial<CachedUserState>): void {
  if (typeof window === 'undefined') return;
  try {
    // Never persist a guest or mock profile as cached user state
    if (updates.profile && !isRealUserAccount(updates.profile.id)) {
      return;
    }

    const prev = getCachedUserState() || {
      profile: null,
      isPro: false,
      streakCount: 0,
      rankBadge: '/badges/bronze.png',
      subjects: [],
      lastUpdated: 0,
    };

    const next: CachedUserState = {
      ...prev,
      ...updates,
      lastUpdated: Date.now(),
    };

    localStorage.setItem(CACHED_USER_STATE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[userCache] Error saving cached user state:', err);
  }
}

/**
 * Clears the cached user state (e.g. on user logout).
 */
export function clearCachedUserState(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHED_USER_STATE_KEY);
  } catch {}
}
