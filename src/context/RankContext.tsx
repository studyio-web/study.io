'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { useAuth } from './AuthContext';
import { useStudy } from './StudyContext';
import { getRankTier, getNextTier, RankTier, HARD_RESET_CAP_RP, calculateSeasonRp } from '@/lib/ranks';
import { getSupabase } from '@/lib/supabase';
import { LeaderboardEntry } from '@/types';
import { useDevRankPreview } from '@/lib/devRankPreview';
import { getCachedUserState, saveCachedUserState } from '@/lib/userCache';
import { getLevelFromLifetimeXP } from '@/lib/gamification';

export interface UserRankState {
  seasonRp: number;
  tier: RankTier;
  rankTitle: string;
  badge: string;
  badgeUrl: string;
  focusMinutes: number;
  thisMonthSeconds: number;
  nextTier: RankTier | null;
  progressPercent: number;
}

interface RankContextType {
  userRank: UserRankState;
  leaderboard: LeaderboardEntry[];
  currentUserEntry: LeaderboardEntry | null;
  timeframe: 'today' | 'week' | 'month' | 'all';
  setTimeframe: (tf: 'today' | 'week' | 'month' | 'all') => void;
  isLoading: boolean;
  isFetching: boolean;
  refetchRank: () => Promise<void>;
  refetchLeaderboard: () => Promise<void>;
}

const RankContext = createContext<RankContextType | undefined>(undefined);

// In-memory cache per user id to prevent cross-account pollution
const rankCacheByUserId: Record<
  string,
  {
    entries: LeaderboardEntry[];
    currentUserEntry: LeaderboardEntry | null;
    timestamp: number;
    timeframe: string;
  }
> = {};

export function clearRankCache(userId?: string) {
  if (userId) {
    delete rankCacheByUserId[userId];
  } else {
    for (const k of Object.keys(rankCacheByUserId)) {
      delete rankCacheByUserId[k];
    }
  }
}

export function RankProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isStudying } = useStudy();
  const { previewRp, isPreviewActive } = useDevRankPreview();

  const [timeframe, setTimeframe] = useState<'today' | 'week' | 'month' | 'all'>('month');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const uid = user?.id;
      if (uid && !uid.startsWith('user-scholar') && uid !== 'guest') {
        const stored = localStorage.getItem(`studyio_cached_user_entry_${uid}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object' && parsed.season_rp) {
            return parsed as LeaderboardEntry;
          }
        }
      }
      const cachedState = getCachedUserState(uid);
      const isUidMatch = Boolean(uid && cachedState && (cachedState.userId === uid || cachedState.profile?.id === uid));
      const rp = Number((isUidMatch ? cachedState?.rp : 0) || user?.seasonRp || (user as any)?.season_rp || 0);
      if (rp > 0) {
        const tier = getRankTier(rp);
        return {
          user_id: uid || (isUidMatch ? cachedState?.profile?.id : undefined) || 'me',
          name: (isUidMatch ? cachedState?.profile?.displayName : undefined) || user?.displayName || 'Scholar',
          display_name: (isUidMatch ? cachedState?.profile?.displayName : undefined) || user?.displayName || null,
          username: (isUidMatch ? cachedState?.profile?.username : undefined) || user?.username || null,
          avatar_url: (isUidMatch ? cachedState?.profile?.avatarUrl : undefined) || user?.avatarUrl || null,
          level: Number((isUidMatch ? cachedState?.profile?.level : undefined) ?? user?.level ?? 1),
          lifetime_xp: Number((isUidMatch ? (cachedState?.profile?.lifetime_xp ?? cachedState?.profile?.xp) : undefined) ?? user?.lifetime_xp ?? user?.xp ?? 0),
          rank_title: (isUidMatch ? cachedState?.rankTitle : undefined) || tier.name,
          tier: tier.tier,
          division: tier.division,
          badge: tier.badge,
          badge_url: tier.imagePath,
          season_rp: rp,
          this_month_seconds: rp * 36,
          total_seconds: rp * 36,
          focus_minutes: Math.floor(rp * 0.6),
          is_current_user: true,
        };
      }
    } catch {}
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);

  const prevUserIdRef = useRef<string | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const [prevRankUserId, setPrevRankUserId] = useState<string | null>(user?.id || null);
  if (user?.id !== prevRankUserId) {
    setPrevRankUserId(user?.id || null);
    if (prevRankUserId) {
      clearRankCache(prevRankUserId);
    }
    clearRankCache();
    setLeaderboard([]);
    let newEntry: LeaderboardEntry | null = null;
    if (user?.id && !user.id.startsWith('user-scholar') && user.id !== 'guest') {
      try {
        const stored = localStorage.getItem(`studyio_cached_user_entry_${user.id}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.season_rp) {
            newEntry = parsed;
          }
        }
      } catch {}
    }
    setCurrentUserEntry(newEntry);
  }

  // Clear cache on login / logout or user switch
  useEffect(() => {
    const currentId = user?.id || null;
    if (prevUserIdRef.current && prevUserIdRef.current !== currentId) {
      clearRankCache(prevUserIdRef.current);
      clearRankCache();
      setLeaderboard([]);
      let newEntry: LeaderboardEntry | null = null;
      if (currentId && !currentId.startsWith('user-scholar') && currentId !== 'guest') {
        try {
          const stored = localStorage.getItem(`studyio_cached_user_entry_${currentId}`);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.season_rp) {
              newEntry = parsed;
            }
          }
        } catch {}
      }
      setCurrentUserEntry(newEntry);
    }
    prevUserIdRef.current = currentId;
  }, [user?.id]);

  const fetchRankData = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsFetching(true);

    try {
      let apiSucceeded = false;

      try {
        const supabase = getSupabase();
        let headers: Record<string, string> = {};
        if (supabase) {
          try {
            const { data } = await supabase.auth.getSession();
            if (data?.session?.access_token) {
              headers['Authorization'] = `Bearer ${data.session.access_token}`;
            }
          } catch {}
        }

        const url = `/api/leaderboard?timeframe=${timeframe}${user?.id ? `&userId=${encodeURIComponent(user.id)}` : ''}`;
        const res = await fetch(url, {
          cache: 'no-store',
          headers,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.entries)) {
            apiSucceeded = true;
            setLeaderboard(data.entries);

            let myEntry: LeaderboardEntry | null = data.currentUserEntry || null;
            if (!myEntry && user?.id) {
              myEntry = data.entries.find((e: LeaderboardEntry) => e.user_id === user.id || (user.username && e.username === user.username)) || null;
            }
            if (myEntry) {
              myEntry.is_current_user = true;
            }
            setCurrentUserEntry(myEntry);

            if (user?.id) {
              rankCacheByUserId[user.id] = {
                entries: data.entries,
                currentUserEntry: myEntry,
                timestamp: Date.now(),
                timeframe,
              };
              if (myEntry) {
                try {
                  localStorage.setItem(`studyio_cached_user_entry_${user.id}`, JSON.stringify(myEntry));
                  saveCachedUserState({
                    rp: myEntry.season_rp,
                    rankBadge: myEntry.badge,
                    rankTitle: myEntry.rank_title,
                  });
                } catch {}
              }
            }
          }
        }
      } catch (err) {
        console.warn('[RankContext] API route error, attempting fallback:', err);
      }

      if (!apiSucceeded) {
        try {
          const supabase = getSupabase();
          if (supabase) {
            const now = new Date();
            const monthStartISO = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
            const monthEndISO = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0) - 1).toISOString();

            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, username, name, avatar_url, level, lifetime_xp, season_base_rp, season_rp, current_rank, rank_title, rank_badge');

            const { data: monthSessions } = await supabase
              .from('study_sessions')
              .select('user_id, duration_seconds')
              .gte('started_at', monthStartISO)
              .lte('started_at', monthEndISO);

            const monthSecsByUser: Record<string, number> = {};
            if (Array.isArray(monthSessions)) {
              for (const s of monthSessions) {
                if (!s?.user_id) continue;
                monthSecsByUser[s.user_id] = (monthSecsByUser[s.user_id] || 0) + Math.max(0, Number(s.duration_seconds || 0));
              }
            }

            if (Array.isArray(profiles) && profiles.length > 0) {
              const mapped: LeaderboardEntry[] = profiles.map((p) => {
                const isMe = Boolean(user?.id && p.id === user.id);
                const mSec = monthSecsByUser[p.id] || 0;
                const carryoverRp = Math.min(HARD_RESET_CAP_RP, Math.max(0, Number(p.season_base_rp || 0)));
                const seasonRp = calculateSeasonRp(carryoverRp, mSec);
                const tierObj = getRankTier(seasonRp);

                return {
                  user_id: p.id,
                  name: p.name || p.username || 'Scholar',
                  display_name: p.name || p.username || null,
                  username: p.username || null,
                  avatar_url: p.avatar_url || null,
                  level: Math.max(Number(p.level || 1), getLevelFromLifetimeXP(Number(p.lifetime_xp || 0))),
                  lifetime_xp: Number(p.lifetime_xp || 0),
                  rank_title: tierObj.name,
                  tier: tierObj.tier,
                  division: tierObj.division,
                  badge: tierObj.badge,
                  badge_url: tierObj.imagePath,
                  season_rp: seasonRp,
                  this_month_seconds: mSec,
                  total_seconds: mSec,
                  focus_minutes: Math.floor(mSec / 60),
                  is_current_user: isMe,
                };
              });

              mapped.sort((a, b) => (b.total_seconds || 0) - (a.total_seconds || 0));
              mapped.forEach((e, i) => {
                e.rank = i + 1;
              });
              setLeaderboard(mapped);
              const myFbEntry = mapped.find((e) => e.is_current_user) || null;
              setCurrentUserEntry(myFbEntry);
              if (myFbEntry && user?.id) {
                try {
                  localStorage.setItem(`studyio_cached_user_entry_${user.id}`, JSON.stringify(myFbEntry));
                  saveCachedUserState({
                    rp: myFbEntry.season_rp,
                    rankBadge: myFbEntry.badge,
                    rankTitle: myFbEntry.rank_title,
                  });
                } catch {}
              }
            }
          }
        } catch (fbErr) {
          console.warn('[RankContext] Supabase fallback error:', fbErr);
        }
      }
    } finally {
      setIsLoading(false);
      setIsFetching(false);
      inFlightRef.current = false;
    }
  }, [timeframe, user?.id]);

  // Initial fetch and on timeframe change
  useEffect(() => {
    fetchRankData();
  }, [fetchRankData]);

  // Live updates: Listen to session saved events
  useEffect(() => {
    const handleSessionSaved = () => {
      fetchRankData();
    };

    window.addEventListener('studypulse:session-saved', handleSessionSaved);
    window.addEventListener('studyio:session-saved', handleSessionSaved);

    return () => {
      window.removeEventListener('studypulse:session-saved', handleSessionSaved);
      window.removeEventListener('studyio:session-saved', handleSessionSaved);
    };
  }, [fetchRankData]);

  // Live periodic updates: every 45s while studying is active
  useEffect(() => {
    if (!isStudying) return;

    const interval = setInterval(() => {
      fetchRankData();
    }, 45000);

    return () => clearInterval(interval);
  }, [isStudying, fetchRankData]);

  // Calculate live userRank strictly from currentUserEntry or single source of truth getRankTier
  const userRank: UserRankState = useMemo(() => {
    if (isPreviewActive && previewRp !== null) {
      const tier = getRankTier(previewRp);
      const nextTier = getNextTier(tier.name);
      let progress = 100;
      if (nextTier) {
        progress = Math.min(100, Math.max(0, Math.round(((previewRp - tier.minRp) / (nextTier.minRp - tier.minRp)) * 100)));
      }
      return {
        seasonRp: previewRp,
        tier,
        rankTitle: tier.name,
        badge: tier.badge,
        badgeUrl: tier.imagePath,
        focusMinutes: Math.floor(previewRp * 0.36),
        thisMonthSeconds: previewRp * 36,
        nextTier,
        progressPercent: progress,
      };
    }

    // Resolve authoritative live season RP from user state and leaderboard entry
    // Prioritize verified server leaderboard entry when available; fallback to verified user state baseline
    const isEntryValid = Boolean(
      currentUserEntry &&
      user?.id &&
      (currentUserEntry.user_id === user.id || (user.username && currentUserEntry.username === user.username))
    );
    const entrySeasonRp = isEntryValid ? Number(currentUserEntry?.season_rp || 0) : 0;
    const userSeasonRp = Number(user?.seasonRp ?? (user as any)?.season_rp ?? user?.rp ?? 0);
    const userBaseRp = Math.min(HARD_RESET_CAP_RP, Math.max(0, Number(user?.season_base_rp ?? user?.carryover_rp ?? 0)));
    const cachedStateRp = Number(getCachedUserState(user?.id)?.rp || 0);
    const authoritativeRp = Math.max(entrySeasonRp, userSeasonRp, userBaseRp, cachedStateRp);

    const tier = getRankTier(authoritativeRp);
    const nextTier = getNextTier(tier.name);
    let progress = 100;
    if (nextTier) {
      progress = Math.min(100, Math.max(0, Math.round(((authoritativeRp - tier.minRp) / (nextTier.minRp - tier.minRp)) * 100)));
    }

    const focusMinutes = (isEntryValid ? currentUserEntry?.focus_minutes : undefined) ?? (user?.totalFocusMinutes || 0);
    const thisMonthSeconds = (isEntryValid ? (currentUserEntry?.this_month_seconds ?? currentUserEntry?.total_seconds) : undefined) || 0;

    return {
      seasonRp: authoritativeRp,
      tier,
      rankTitle: tier.name,
      badge: tier.badge,
      badgeUrl: tier.imagePath,
      focusMinutes,
      thisMonthSeconds,
      nextTier,
      progressPercent: progress,
    };
  }, [isPreviewActive, previewRp, currentUserEntry, user]);

  return (
    <RankContext.Provider
      value={{
        userRank,
        leaderboard,
        currentUserEntry,
        timeframe,
        setTimeframe,
        isLoading,
        isFetching,
        refetchRank: fetchRankData,
        refetchLeaderboard: fetchRankData,
      }}
    >
      {children}
    </RankContext.Provider>
  );
}

export function useRank(): RankContextType {
  const context = useContext(RankContext);
  if (!context) {
    throw new Error('useRank must be used within a RankProvider');
  }
  return context;
}
