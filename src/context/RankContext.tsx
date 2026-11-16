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
import { getRankTier, getNextTier, RankTier, HARD_RESET_CAP_RP } from '@/lib/ranks';
import { getSupabase } from '@/lib/supabase';
import { LeaderboardEntry } from '@/types';
import { useDevRankPreview } from '@/lib/devRankPreview';

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
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);

  const prevUserIdRef = useRef<string | null>(null);
  const inFlightRef = useRef<boolean>(false);

  // Clear cache on login / logout or user switch
  useEffect(() => {
    const currentId = user?.id || null;
    if (prevUserIdRef.current && prevUserIdRef.current !== currentId) {
      clearRankCache(prevUserIdRef.current);
      clearRankCache();
      setLeaderboard([]);
      setCurrentUserEntry(null);
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
        const res = await fetch(`/api/leaderboard?timeframe=${timeframe}`, {
          cache: 'no-store',
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.entries)) {
            apiSucceeded = true;
            setLeaderboard(data.entries);
            setCurrentUserEntry(data.currentUserEntry || null);

            if (user?.id) {
              rankCacheByUserId[user.id] = {
                entries: data.entries,
                currentUserEntry: data.currentUserEntry || null,
                timestamp: Date.now(),
                timeframe,
              };
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
                const seasonRp = carryoverRp + Math.floor(mSec / 36);
                const tierObj = getRankTier(seasonRp);

                return {
                  user_id: p.id,
                  name: p.name || p.username || 'Scholar',
                  display_name: p.name || p.username || null,
                  username: p.username || null,
                  avatar_url: p.avatar_url || null,
                  level: p.level ? Number(p.level) : undefined,
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
              setCurrentUserEntry(mapped.find((e) => e.is_current_user) || null);
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

    if (currentUserEntry) {
      const seasonRp = Number(currentUserEntry.season_rp || 0);
      const tier = getRankTier(seasonRp);
      const nextTier = getNextTier(tier.name);
      let progress = 100;
      if (nextTier) {
        progress = Math.min(100, Math.max(0, Math.round(((seasonRp - tier.minRp) / (nextTier.minRp - tier.minRp)) * 100)));
      }
      return {
        seasonRp,
        tier,
        rankTitle: tier.name,
        badge: tier.badge,
        badgeUrl: tier.imagePath,
        focusMinutes: currentUserEntry.focus_minutes || 0,
        thisMonthSeconds: currentUserEntry.this_month_seconds || (currentUserEntry.total_seconds || 0),
        nextTier,
        progressPercent: progress,
      };
    }

    // Fallback if not loaded yet: evaluate from user profile or 0
    const rawCarryover = Math.min(HARD_RESET_CAP_RP, Math.max(0, Number(user?.season_base_rp ?? user?.carryover_rp ?? 0)));
    const tier = getRankTier(rawCarryover);
    const nextTier = getNextTier(tier.name);
    let progress = 100;
    if (nextTier) {
      progress = Math.min(100, Math.max(0, Math.round(((rawCarryover - tier.minRp) / (nextTier.minRp - tier.minRp)) * 100)));
    }
    return {
      seasonRp: rawCarryover,
      tier,
      rankTitle: tier.name,
      badge: tier.badge,
      badgeUrl: tier.imagePath,
      focusMinutes: 0,
      thisMonthSeconds: 0,
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
