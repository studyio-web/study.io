'use client';

import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRankTheme } from '../../hooks/useRankTheme';
import {
  preloadRankBadgesForUser,
  preloadAllRankBadges,
  preloadAllRankBadgesImmediately,
  getRankBadgeSources,
} from '../../lib/preloadRankBadges';

/**
 * RankBadgePreloader
 * Headless client component mounted on app startup in Providers.
 * 1. Immediately preloads user's active rank badge and surrounding tier divisions.
 * 2. Background-preloads all remaining rank badges during idle cycles.
 * 3. Injects <link rel="preload"> for the current user rank badge.
 */
export function RankBadgePreloader() {
  const { isAuthenticated } = useAuth();
  const { userRank } = useRankTheme();

  useEffect(() => {
    // Only preload all badges for authenticated users with active ranked progression
    if (!isAuthenticated || !userRank) return;

    // 1. Trigger background preload of rank badge assets into browser memory cache
    if (process.env.NODE_ENV !== 'production') {
      preloadAllRankBadgesImmediately();
    } else {
      preloadAllRankBadges();
    }

    // 2. High priority preload of active rank and surrounding tier divisions
    preloadRankBadgesForUser(userRank.tier, userRank.division);
  }, [isAuthenticated, userRank]);

  if (!isAuthenticated || !userRank) return null;

  const currentSources = getRankBadgeSources(userRank.tier, userRank.division);

  return (
    <>
      {/* High-priority browser hints for user's active rank badge (both PNG and WebP) */}
      <link
        rel="preload"
        as="image"
        type="image/png"
        href={currentSources.png}
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        type="image/webp"
        href={currentSources.webp}
        fetchPriority="high"
      />
    </>
  );
}
