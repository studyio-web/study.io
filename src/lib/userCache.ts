import { UserProfile, Subject } from '../types';

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
