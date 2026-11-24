import { isNativeAndroid } from '@/lib/timerNotificationPlugin';

export interface VersionData {
  version: string;
  buildCode: number;
  minRequiredVersion: string;
  minRequiredBuild: number;
  releaseDate?: string;
  title: string;
  message: string;
  downloadUrl: string;
  directApkUrl?: string;
  apkSize?: string;
  mandatory: boolean;
}

/**
 * Splits a version string into an array of numeric parts.
 * Example: "2.5" -> [2, 5], "1.0.3" -> [1, 0, 3]
 */
export function parseSemver(v: string): number[] {
  if (!v) return [0];
  const cleaned = v.replace(/[^0-9.]/g, '');
  return cleaned.split('.').map((p) => parseInt(p, 10) || 0);
}

/**
 * Compares two semantic version strings.
 * Returns 1 if v1 > v2, -1 if v1 < v2, and 0 if v1 === v2.
 */
export function compareSemver(v1: string, v2: string): number {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);
  const maxLen = Math.max(p1.length, p2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Checks whether an installed client version is older than the minimum required version.
 * Checks both the Android versionCode (build number) and semantic versionName.
 */
export function isOlderVersion(
  installedVersion: string,
  installedBuild: string | number | undefined,
  minVersion: string,
  minBuild: string | number | undefined
): boolean {
  // 1. Android build number / versionCode check
  if (installedBuild !== undefined && minBuild !== undefined) {
    const iBuild = Number(installedBuild);
    const mBuild = Number(minBuild);
    if (!isNaN(iBuild) && !isNaN(mBuild)) {
      if (iBuild < mBuild) return true;
      if (iBuild > mBuild) return false;
    }
  }

  // 2. Semantic version comparison (versionName check)
  if (installedVersion && minVersion) {
    return compareSemver(installedVersion, minVersion) < 0;
  }

  return false;
}

/**
 * Fetches the authoritative version definition from /api/app-version.
 */
export async function fetchServerAppVersion(): Promise<VersionData | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/app-version', {
      cache: 'no-store',
      headers: {
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as VersionData;
  } catch (err) {
    console.warn('[AppVersion] Failed to fetch version data:', err);
    return null;
  }
}
