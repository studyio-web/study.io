'use client';

export const THREE_HOURS_SECONDS = 3 * 60 * 60; // 10,800 seconds
export const THREE_HOURS_MS = THREE_HOURS_SECONDS * 1000; // 10,800,000 ms

/**
 * Formats a remaining cooldown (in seconds) into human-readable compact format:
 * - 2h 45m
 * - 48m
 * - 32s
 */
export function formatNudgeCooldown(seconds: number): string {
  if (seconds <= 0) return '';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (m > 0) {
    return sec > 0 && m < 5 ? `${m}m ${sec}s` : `${m}m`;
  }
  return `${sec}s`;
}

/**
 * Retrieve active nudge timestamps from localStorage for a given room and sender user.
 * Key: targetUserId -> epoch timestamp (ms)
 * Scoped per sender user ID so one user's nudge never places other users on cooldown.
 */
export function loadStoredNudgeTimestamps(roomId?: string, senderUserId?: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const key = senderUserId
      ? `studyio_nudges_${senderUserId}_${roomId || 'global'}`
      : roomId ? `studyio_nudges_${roomId}` : 'studyio_nudges_global';
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: Record<string, number> = JSON.parse(raw);
    const now = Date.now();
    const active: Record<string, number> = {};

    for (const [targetId, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && now - ts < THREE_HOURS_MS) {
        active[targetId] = ts;
      }
    }
    return active;
  } catch {
    return {};
  }
}

/**
 * Persist a nudge event to localStorage so the 3-hour cooldown survives page reloads.
 * Cooldown is stored strictly for the sender user who initiated the nudge.
 */
export function persistNudgeTimestamp(
  targetUserId: string,
  roomId?: string,
  timestamp: number = Date.now(),
  senderUserId?: string
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = senderUserId
      ? `studyio_nudges_${senderUserId}_${roomId || 'global'}`
      : roomId ? `studyio_nudges_${roomId}` : 'studyio_nudges_global';
    const active = loadStoredNudgeTimestamps(roomId, senderUserId);
    active[targetUserId] = timestamp;
    localStorage.setItem(key, JSON.stringify(active));
  } catch {}
}

/**
 * Calculate remaining seconds of cooldown for a specific scholar.
 */
export function getRemainingNudgeCooldownSeconds(timestamp: number): number {
  if (!timestamp) return 0;
  const elapsedMs = Date.now() - timestamp;
  if (elapsedMs >= THREE_HOURS_MS) return 0;
  return Math.ceil((THREE_HOURS_MS - elapsedMs) / 1000);
}

import { notify, requestNotificationPermission } from './notifications';

/**
 * Request notification permission early from the browser/OS so focus nudges can be delivered.
 */
export async function requestNudgeNotificationPermission(): Promise<NotificationPermission | null> {
  const result = await requestNotificationPermission();
  return result === 'prompt' ? 'default' : (result as NotificationPermission);
}

/**
 * Dispatches an operating system / browser level push notification when someone is nudged.
 */
export async function triggerNudgePushNotification(senderUsername: string): Promise<void> {
  if (typeof window === 'undefined') return;

  await notify('focus_nudge', {
    title: 'Focus Nudge',
    body: `${senderUsername} nudged you to focus in study.io!`,
    url: window.location.href,
    tab: 'rooms',
  });
}
