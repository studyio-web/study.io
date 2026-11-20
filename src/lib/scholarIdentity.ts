import { UserProfile } from '../types';

/**
 * Checks whether a given string is a raw OAuth / Google account metadata name
 * (such as an institutional name with roll numbers like "EBIN K A URK26CS7129")
 * rather than a chosen in-app Scholar identity.
 */
export function isRawOAuthName(name?: string | null, metaFullName?: string | null): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed) return false;

  // 1. Matches Google OAuth metadata full_name or name
  if (metaFullName && typeof metaFullName === 'string') {
    const metaClean = metaFullName.trim().toLowerCase();
    if (metaClean && trimmed.toLowerCase() === metaClean) {
      return true;
    }
    if (metaClean && metaClean.includes(trimmed.toLowerCase()) && (/\d/.test(trimmed) || trimmed.length > 5)) {
      return true;
    }
  }

  // 2. Pattern matching university/institutional registration codes / student IDs
  // e.g., "URK26CS7129", "2021BCS012", "RA2111003010123"
  if (/\b(?:[A-Za-z]{2,}\d{2,}[A-Za-z0-9]*|\d{2,}[A-Za-z]{2,}\d*)\b/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Resolves the display name for the user in the app.
 * Guarantees that raw Google OAuth names (e.g. "EBIN K A URK26CS7129") are never
 * displayed, defaulting to the in-app Scholar identity "Scholar" unless
 * a genuine custom name has been set via Edit Profile.
 */
export function resolveScholarName(user?: Partial<UserProfile> | null): string {
  if (!user) return 'Scholar';

  const rawMeta = (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (user as any)?.user_metadata?.display_name ||
    ''
  ).trim();

  // 1. Explicit custom in-app profile name (set via Edit Profile)
  if (user.name && user.name.trim() && !isRawOAuthName(user.name, rawMeta)) {
    return user.name.trim();
  }

  // 2. Explicit in-app username/handle if valid and not raw OAuth
  if (
    user.username &&
    user.username.trim() &&
    !user.username.includes(' ') &&
    !isRawOAuthName(user.username, rawMeta)
  ) {
    return user.username.trim();
  }

  // 3. User displayName if valid, not raw OAuth, and not placeholder
  if (
    user.displayName &&
    user.displayName.trim() &&
    user.displayName !== 'Focus Scholar' &&
    !isRawOAuthName(user.displayName, rawMeta)
  ) {
    return user.displayName.trim();
  }

  // Default in-app identity
  return 'Scholar';
}

/**
 * Resolves the handle (@username) for the user in the app.
 * Returns empty string if the current username is empty or matches raw Google account data.
 */
export function resolveScholarHandle(user?: Partial<UserProfile> | null): string {
  if (!user?.username || typeof user.username !== 'string') return '';
  const trimmed = user.username.trim();
  if (!trimmed || trimmed.includes(' ')) return '';

  const rawMeta = (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (user as any)?.user_metadata?.display_name ||
    ''
  ).trim();

  if (isRawOAuthName(trimmed, rawMeta)) {
    return '';
  }

  return trimmed.toLowerCase();
}
