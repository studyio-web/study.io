import { UserProfile, Subject } from '../types';
import { resolveScholarName, resolveScholarHandle } from './scholarIdentity';

export interface CachedUserState {
  userId?: string;
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
 * If forUserId is specified, guarantees only data belonging to that user is returned.
 */
export function getCachedUserState(forUserId?: string): CachedUserState | null {
  if (typeof window === 'undefined') return null;
  try {
    // 1. Try user-scoped storage key first if specific user ID is requested
    if (forUserId && isRealUserAccount(forUserId)) {
      const userScoped = localStorage.getItem(`${CACHED_USER_STATE_KEY}_${forUserId}`);
      if (userScoped) {
        const parsed = JSON.parse(userScoped);
        if (parsed && typeof parsed === 'object') {
          if (parsed.profile) {
            parsed.profile.displayName = resolveScholarName(parsed.profile);
            parsed.profile.username = resolveScholarHandle(parsed.profile);
          }
          return parsed as CachedUserState;
        }
      }
    }

    // 2. Global fallback cache (strictly validated against forUserId)
    const raw = localStorage.getItem(CACHED_USER_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const cachedUid = parsed.userId || parsed.profile?.id;
      // If caller requested a specific user, reject if the global cache belongs to another account
      if (forUserId && cachedUid && cachedUid !== forUserId) {
        return null;
      }
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
 * Saves to both the active key and user-scoped key to prevent cross-account leakage.
 */
export function saveCachedUserState(updates: Partial<CachedUserState>): void {
  if (typeof window === 'undefined') return;
  try {
    const targetUserId = updates.userId || updates.profile?.id;

    // Never persist a guest or mock profile as cached user state
    if (targetUserId && !isRealUserAccount(targetUserId)) {
      return;
    }

    const prev = getCachedUserState(targetUserId);
    // If previous cache belongs to a different user, start completely fresh
    const isSameUser = Boolean(
      prev && targetUserId && (prev.userId === targetUserId || prev.profile?.id === targetUserId)
    );

    const base: CachedUserState = isSameUser && prev
      ? prev
      : {
          userId: targetUserId,
          profile: null,
          isPro: false,
          streakCount: 0,
          rankBadge: '/badges/bronze.png',
          subjects: [],
          lastUpdated: 0,
        };

    const next: CachedUserState = {
      ...base,
      ...updates,
      userId: targetUserId || base.userId,
      lastUpdated: Date.now(),
    };

    localStorage.setItem(CACHED_USER_STATE_KEY, JSON.stringify(next));
    if (targetUserId && isRealUserAccount(targetUserId)) {
      localStorage.setItem(`${CACHED_USER_STATE_KEY}_${targetUserId}`, JSON.stringify(next));
    }
  } catch (err) {
    console.warn('[userCache] Error saving cached user state:', err);
  }
}

/**
 * Clears the cached user state (e.g. on user logout or account switch).
 */
export function clearCachedUserState(userId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId) {
      localStorage.removeItem(`${CACHED_USER_STATE_KEY}_${userId}`);
      const raw = localStorage.getItem(CACHED_USER_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.userId === userId || parsed?.profile?.id === userId) {
          localStorage.removeItem(CACHED_USER_STATE_KEY);
        }
      }
    } else {
      localStorage.removeItem(CACHED_USER_STATE_KEY);
    }
  } catch {}
}
