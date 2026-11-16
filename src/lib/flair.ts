import { getSupabase } from './supabase';

export type FlairFrame = 'gold' | 'aurora' | 'ember';

export interface FlairConfig {
  id: FlairFrame;
  name: string;
  gradient: string;
  ringBorder: string;
  crownColor: string;
  starColor: string;
  glowColor: string;
  description: string;
}

export const FLAIR_FRAMES: Record<FlairFrame, FlairConfig> = {
  gold: {
    id: 'gold',
    name: 'Imperial Gold',
    gradient: 'linear-gradient(135deg, #F5E6A8 0%, #E6C15A 50%, #B8892B 100%)',
    ringBorder: '#E6C15A',
    crownColor: '#E6C15A',
    starColor: '#E6C15A',
    glowColor: 'rgba(230, 193, 90, 0.35)',
    description: 'Prestige gold gradient inspired by Free Fire Grandmaster accolades.',
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora Teal',
    gradient: 'linear-gradient(135deg, #2DD4BF 0%, #06B6D4 50%, #3B82F6 100%)',
    ringBorder: '#2DD4BF',
    crownColor: '#2DD4BF',
    starColor: '#2DD4BF',
    glowColor: 'rgba(45, 212, 191, 0.35)',
    description: 'Vibrant celestial teal and electric cyan glow.',
  },
  ember: {
    id: 'ember',
    name: 'Ember Orange',
    gradient: 'linear-gradient(135deg, #F97316 0%, #EF4444 50%, #B91C1C 100%)',
    ringBorder: '#F97316',
    crownColor: '#F97316',
    starColor: '#F97316',
    glowColor: 'rgba(249, 115, 22, 0.35)',
    description: 'Blazing thermal fire gradient for intense focus champions.',
  },
};

interface CacheEntry {
  frame: FlairFrame | null;
  expiresAt: number;
}

// In-memory cache with TTL (60s) for resolved flair map entries to avoid redundant queries
const flairMemoryCache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 60 * 1000;

export function clearFlairCache(userId?: string) {
  if (userId) {
    delete flairMemoryCache[userId];
  } else {
    for (const k of Object.keys(flairMemoryCache)) {
      delete flairMemoryCache[k];
    }
  }
}

/**
 * Fetch flair frames for an array of user IDs via security definer RPC get_flair,
 * with a resilient direct query fallback on public.subscriptions.
 * Strictly verifies that subscriptions are unexpired (premium_until > now).
 * Never throws — returns empty map on any error or offline state.
 */
export async function fetchFlairMap(userIds: string[]): Promise<Record<string, FlairFrame>> {
  if (!userIds || userIds.length === 0) return {};

  try {
    const supabase = getSupabase();
    if (!supabase) return {};

    const isUuid = (id: string) =>
      typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());

    const validUids = Array.from(new Set(userIds.map((u) => String(u).trim()).filter(isUuid))).slice(0, 100);
    if (validUids.length === 0) return {};

    const now = Date.now();
    const map: Record<string, FlairFrame> = {};

    // 1. Populate from memory cache first if available and unexpired
    const uncachedUids: string[] = [];
    for (const uid of validUids) {
      const entry = flairMemoryCache[uid];
      if (entry && entry.expiresAt > now) {
        if (entry.frame) {
          map[uid] = entry.frame;
        }
      } else {
        uncachedUids.push(uid);
      }
    }

    if (uncachedUids.length === 0) {
      return map;
    }

    // 2. Try get_flair RPC (Primary path)
    let rpcWorked = false;
    try {
      const { data, error } = await supabase.rpc('get_flair', { p_user_ids: uncachedUids });

      if (!error && Array.isArray(data)) {
        rpcWorked = true;
        const foundUids = new Set<string>();
        for (const row of data) {
          if (row?.user_id) {
            foundUids.add(row.user_id);
            const frame = (row.frame as FlairFrame) || 'gold';
            map[row.user_id] = frame;
            flairMemoryCache[row.user_id] = { frame, expiresAt: now + CACHE_TTL_MS };
          }
        }
        for (const uid of uncachedUids) {
          if (!foundUids.has(uid)) {
            flairMemoryCache[uid] = { frame: null, expiresAt: now + CACHE_TTL_MS };
          }
        }
      } else if (error) {
        // Fallback below will resolve
      }
    } catch (rpcErr) {
      // Proceed to fallback
    }

    // 3. Resilient fallback to public.subscriptions for any user IDs not resolved via get_flair
    if (!rpcWorked) {
      try {
        const { data: subRows, error: subError } = await supabase
          .from('subscriptions')
          .select('user_id, status, premium_until')
          .in('user_id', uncachedUids);

        if (!subError && subRows && Array.isArray(subRows)) {
          const resolvedUids = new Set<string>();
          for (const s of subRows) {
            if (!s?.user_id) continue;
            resolvedUids.add(s.user_id);

            const hasExpiry = Boolean(s.premium_until);
            const isFuture = hasExpiry ? new Date(s.premium_until).getTime() > now : false;
            const isStatusActive = s.status === 'active' || s.status === 'trialing';

            // CRITICAL: If premium_until is specified, it MUST strictly be in the future.
            // If premium_until is past, the subscription is expired regardless of the status column.
            const isValid = hasExpiry ? isFuture : isStatusActive;

            if (isValid) {
              const frame: FlairFrame = 'gold';
              map[s.user_id] = frame;
              flairMemoryCache[s.user_id] = { frame, expiresAt: now + CACHE_TTL_MS };
            } else {
              flairMemoryCache[s.user_id] = { frame: null, expiresAt: now + CACHE_TTL_MS };
            }
          }

          for (const uid of uncachedUids) {
            if (!resolvedUids.has(uid)) {
              flairMemoryCache[uid] = { frame: null, expiresAt: now + CACHE_TTL_MS };
            }
          }
        }
      } catch (subErr) {
        // Silently ignore fallback failure
      }
    }

    return map;
  } catch (err) {
    console.warn('[Flair] fetchFlairMap error:', err);
    return {};
  }
}

/**
 * Read the current user's own profile_flair configuration. Defaults to 'gold'.
 */
export async function getMyFlair(userId: string): Promise<{ frame: FlairFrame; showBadge: boolean } | null> {
  if (!userId) return null;

  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('profile_flair')
      .select('frame, show_badge')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[Flair] getMyFlair notice:', error.message);
      return { frame: 'gold', showBadge: true };
    }

    if (data) {
      return {
        frame: (data.frame as FlairFrame) || 'gold',
        showBadge: data.show_badge ?? true,
      };
    }

    return { frame: 'gold', showBadge: true };
  } catch (err) {
    console.warn('[Flair] getMyFlair exception:', err);
    return { frame: 'gold', showBadge: true };
  }
}

/**
 * Save the current user's profile_flair configuration.
 */
export async function saveMyFlair(
  userId: string,
  frame: FlairFrame,
  showBadge: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!userId) return { success: false, error: 'User not authenticated' };

  try {
    const supabase = getSupabase();
    if (!supabase) return { success: false, error: 'Supabase client unavailable' };

    const { error } = await supabase.from('profile_flair').upsert(
      {
        user_id: userId,
        frame,
        show_badge: showBadge,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update flair' };
  }
}
