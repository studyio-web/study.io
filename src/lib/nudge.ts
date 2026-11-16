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
 * Retrieve active nudge timestamps (cooldown disabled - returns empty map).
 */
export function loadStoredNudgeTimestamps(roomId?: string, senderUserId?: string): Record<string, number> {
  return {};
}

/**
 * Persist a nudge event (cooldown disabled - no-op).
 */
export function persistNudgeTimestamp(
  targetUserId: string,
  roomId?: string,
  timestamp: number = Date.now(),
  senderUserId?: string
): void {
  // Cooldown disabled - no persistence needed
}

/**
 * Calculate remaining seconds of cooldown (cooldown disabled - always returns 0).
 */
export function getRemainingNudgeCooldownSeconds(timestamp?: number): number {
  return 0;
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
