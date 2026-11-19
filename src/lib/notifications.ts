'use client';

import { Capacitor } from '@capacitor/core';
import { LocalNotifications, Channel } from '@capacitor/local-notifications';
import { startApkDownload } from './apkDownload';

export type NotificationType =
  | 'pomodoro_work_completed'
  | 'pomodoro_break_over'
  | 'countdown_halfway'
  | 'countdown_completed'
  | 'hydration_reminder'
  | 'idle_check'
  | 'focus_nudge'
  | 'room_mention'
  | 'room_reply'
  | 'room_chat'
  | 'mention'
  | 'reply'
  | 'chat'
  | 'daily_goal_reached'
  | 'strict_mode_blocked'
  | 'timer_remote_started'
  | 'custom';

export interface NotificationPayload {
  title?: string;
  body?: string;
  senderName?: string;
  roomName?: string;
  id?: number;
  url?: string;
  tab?: 'timer' | 'tasks' | 'analytics' | 'rooms' | 'leaderboard' | 'timetable' | 'stats';
  channelId?: 'timer_running' | 'timer_alerts' | 'reminders' | 'social_nudges' | 'social_mentions' | 'social_replies' | 'social_chat';
  silent?: boolean;
  scheduleAt?: Date;
  extra?: Record<string, any>;
}

export const CHANNELS: Channel[] = [
  {
    id: 'timer_running',
    name: 'Timer Running',
    description: 'Persistent live chronometer focus notification while timer is running',
    importance: 2, // IMPORTANCE_LOW (no sound, no vibration, no popup)
    visibility: 1, // VISIBILITY_PUBLIC (visible on lock screen)
    sound: undefined,
    vibration: false,
    lights: false,
  },
  {
    id: 'timer_alerts',
    name: 'Timer Alerts',
    description: 'Completion alerts for countdown, Pomodoro phase transitions, and 4-hour idle checks',
    importance: 4, // IMPORTANCE_HIGH (heads-up banner with sound)
    visibility: 1,
    vibration: true,
    lights: true,
  },
  {
    id: 'reminders',
    name: 'Study Reminders',
    description: 'Water hydration reminders, daily focus goals, and streak updates',
    importance: 3, // IMPORTANCE_DEFAULT
    visibility: 1,
    vibration: false,
    lights: false,
  },
  {
    id: 'social_nudges',
    name: 'Study Room Nudges',
    description: 'Alerts when other scholars nudge you in active study rooms',
    importance: 4, // IMPORTANCE_HIGH
    visibility: 1,
    vibration: true,
    lights: true,
  },
  {
    id: 'social_mentions',
    name: 'Room Mentions',
    description: 'Alerts when scholars mention you (@username) in study rooms',
    importance: 4, // IMPORTANCE_HIGH (heads-up banner with sound & vibration)
    visibility: 1,
    vibration: true,
    lights: true,
  },
  {
    id: 'social_replies',
    name: 'Room Replies',
    description: 'Alerts when scholars reply directly to your messages in study rooms',
    importance: 4, // IMPORTANCE_HIGH (heads-up banner with sound & vibration)
    visibility: 1,
    vibration: true,
    lights: true,
  },
  {
    id: 'social_chat',
    name: 'Room Chat Messages',
    description: 'Alerts for room discussion messages',
    importance: 3, // IMPORTANCE_DEFAULT
    visibility: 1,
    vibration: false,
    lights: false,
  },
];

let channelsInitialized = false;

/**
 * Initializes native Android notification channels at application startup.
 */
export async function initNotificationChannels(): Promise<void> {
  if (channelsInitialized || !Capacitor.isNativePlatform()) return;

  try {
    for (const channel of CHANNELS) {
      await LocalNotifications.createChannel(channel);
    }
    channelsInitialized = true;
  } catch (err) {
    console.warn('[Notifications] Failed to create Android notification channels:', err);
  }
}

/**
 * Request notification permission across web and Android (POST_NOTIFICATIONS on Android 13+).
 */
export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') {
        await initNotificationChannels();
        return 'granted';
      }
      const req = await LocalNotifications.requestPermissions();
      if (req.display === 'granted') {
        await initNotificationChannels();
        return 'granted';
      }
      return req.display === 'denied' ? 'denied' : 'prompt';
    } catch (err) {
      console.warn('[Notifications] Native permission request error:', err);
      return 'denied';
    }
  }

  // Web Platform
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
      const perm = await Notification.requestPermission();
      return perm as 'granted' | 'denied' | 'prompt';
    } catch {
      return 'denied';
    }
  }

  return 'denied';
}

/**
 * Helper to generate stable numeric IDs for local notifications.
 */
function getNotificationId(type: NotificationType, customId?: number): number {
  if (customId) return customId;
  const hashString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };
  return (hashString(type) % 100000) + 1000;
}

/**
 * Formats seconds into mm:ss or h:mm:ss for notification content.
 */
export function formatSecondsForNotification(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface ResolvedNotificationConfig {
  title: string;
  body: string;
  channelId: string;
  tab: 'timer' | 'tasks' | 'stats' | 'rooms' | 'analytics';
}

/**
 * Pure configuration resolver mapping notification type and payload to title, body, channel, and deep-link tab.
 */
export function resolveNotificationConfig(
  type: NotificationType | string,
  payload: NotificationPayload & { senderName?: string; roomName?: string } = {}
): ResolvedNotificationConfig {
  let title = payload.title || 'study.io';
  let body = payload.body || '';
  let channelId = payload.channelId || 'reminders';
  let tab: ResolvedNotificationConfig['tab'] = (payload.tab as any) || 'timer';

  switch (type) {
    case 'pomodoro_work_completed':
      title = payload.title || 'Pomodoro session completed! 🍅';
      body = payload.body || 'Great focus! Take a well-deserved break.';
      channelId = 'timer_alerts';
      tab = 'timer';
      break;

    case 'pomodoro_break_over':
      title = payload.title || 'Break time is over! 🚀';
      body = payload.body || "Ready to focus? Let's get back to work.";
      channelId = 'timer_alerts';
      tab = 'timer';
      break;

    case 'countdown_halfway':
      title = payload.title || 'Halfway there! ⏳';
      body = payload.body || '50% of your countdown completed. Keep up the great focus!';
      channelId = 'timer_alerts';
      tab = 'timer';
      break;

    case 'countdown_completed':
    case 'countdown_finished':
      title = payload.title || 'Countdown Finished! 🚀';
      body = payload.body || 'Your timer is up! Click Save session to record your progress.';
      channelId = 'timer_alerts';
      tab = 'timer';
      break;

    case 'hydration_reminder':
      title = payload.title || 'Time to drink water! 💧';
      body = payload.body || 'Take a quick sip to stay hydrated.';
      channelId = 'reminders';
      tab = 'timer';
      break;

    case 'idle_check':
      title = payload.title || 'Are you still studying?';
      body = payload.body || 'Timer reached 4 hours and auto-paused. Confirm to resume.';
      channelId = 'timer_alerts';
      tab = 'timer';
      break;

    case 'focus_nudge':
      title = payload.senderName ? `${payload.senderName} nudged you!` : payload.title || 'Focus Nudge';
      body = payload.roomName
        ? `Focus session in progress in "${payload.roomName}". Join in!`
        : payload.body || 'A scholar nudged you to focus in study.io!';
      channelId = 'social_nudges';
      tab = 'rooms';
      break;

    case 'room_mention':
    case 'mention':
      title = payload.title || (payload.senderName ? `💬 @${payload.senderName} mentioned you` : 'You were mentioned!');
      body = payload.body || (payload.roomName
        ? `In "${payload.roomName}": "${payload.extra?.snippet || ''}"`
        : 'A scholar mentioned you in room chat.');
      channelId = 'social_mentions';
      tab = 'rooms';
      break;

    case 'room_reply':
    case 'reply':
      title = payload.title || (payload.senderName ? `↩️ ${payload.senderName} replied to you` : 'New reply to your message!');
      body = payload.body || (payload.roomName
        ? `In "${payload.roomName}": "${payload.extra?.snippet || ''}"`
        : 'A scholar replied to your message in room chat.');
      channelId = 'social_replies';
      tab = 'rooms';
      break;

    case 'room_chat':
    case 'chat':
      title = payload.title || (payload.roomName ? payload.roomName : 'Room Chat');
      body = payload.body || (payload.senderName
        ? `${payload.senderName}: "${payload.extra?.snippet || ''}"`
        : 'New message in study room');
      channelId = 'social_chat';
      tab = 'rooms';
      break;

    case 'daily_goal_reached':
    case 'goal_reached':
      title = payload.title || 'Daily Goal Reached! 🔥';
      body = payload.body || 'You completed your daily focus goal! Streak updated.';
      channelId = 'reminders';
      tab = 'stats';
      break;

    case 'streak_saved':
    case 'streak_reminder':
      title = payload.title || 'Keep your streak alive! 🔥';
      body = payload.body || "Log a study session today to protect your streak.";
      channelId = 'reminders';
      tab = 'stats';
      break;

    case 'strict_mode_blocked':
      title = payload.title || 'App Blocked by Strict Mode 🚫';
      body = payload.body || 'Return to Study.io to protect your focus streak!';
      channelId = 'timer_alerts';
      tab = 'timer';
      break;

    case 'timer_remote_started':
      title = payload.title || 'Timer turned on in another device 🔄';
      body = payload.body || 'Your focus timer was turned on on another device and is syncing live.';
      channelId = 'timer_alerts';
      tab = 'timer';
      break;

    case 'custom':
    default:
      title = payload.title || 'study.io';
      body = payload.body || '';
      channelId = payload.channelId || 'reminders';
      break;
  }

  return { title, body, channelId, tab };
}

/**
 * Unified notification dispatcher for both Web and Native Android.
 * Automatically routes to Capacitor LocalNotifications on native devices,
 * or ServiceWorker / Notification API on desktop web.
 */
export async function notify(
  type: NotificationType,
  payload: NotificationPayload = {}
): Promise<boolean> {
  const isNative = Capacitor.isNativePlatform();

  // 1. Resolve notification attributes based on type
  const { title, body, channelId, tab } = resolveNotificationConfig(type, payload);

  // 2. Native Android Execution via @capacitor/local-notifications
  if (isNative) {
    // On native Android, countdown completion alerts are managed exclusively by TimerForegroundService
    // to guarantee exactly one notification appears.
    if ((type as string) === 'countdown_completed' || (type as string) === 'countdown_finished') {
      return true;
    }

    try {
      await initNotificationChannels();
      const notifId = getNotificationId(type, payload.id);

      const iconColor =
        (type === 'room_mention' || type === 'mention')
          ? '#F59E0B'
          : (type === 'room_reply' || type === 'reply')
          ? '#3B82F6'
          : '#0F172A';

      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: notifId,
            channelId,
            smallIcon: 'ic_stat_studyio',
            largeIcon: 'ic_launcher',
            iconColor,
            ongoing: channelId === 'timer_running' || payload.extra?.ongoing === true,
            autoCancel: channelId !== 'timer_running' && !payload.extra?.ongoing,
            schedule: payload.scheduleAt ? { at: payload.scheduleAt } : undefined,
            extra: {
              type,
              tab,
              url: payload.url || `/?tab=${tab}`,
              ...payload.extra,
            },
          },
        ],
      });
      return true;
    } catch (err) {
      console.warn('[Notifications] Native schedule error:', err);
      return false;
    }
  }

  // 3. Web Platform Execution (Service Worker / Notification API)
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const iconUrl = typeof window !== 'undefined' ? `${window.location.origin}/icon-192.png` : '/icon-192.png';
  const tag = `studyio-${type}-${payload.id || Date.now()}`;

  const options: NotificationOptions = {
    body,
    icon: iconUrl,
    badge: iconUrl,
    tag,
    silent: payload.silent ?? true,
    data: {
      type,
      tab,
      url: payload.url || `/?tab=${tab}`,
      ...payload.extra,
    },
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        return true;
      }
    }
    const webNotif = new Notification(title, options);
    webNotif.onclick = () => {
      window.focus();
      if (tab) {
        window.dispatchEvent(new CustomEvent('studyio:navigate-tab', { detail: { tab } }));
      }
      webNotif.close();
    };
    return true;
  } catch (err) {
    try {
      new Notification(title, options);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Initializes deep link listener on native notifications when tapped.
 */
export function setupNotificationListeners(onNavigate?: (tab: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  let removeListener: (() => void) | null = null;

  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const extra = action.notification.extra;
    if (extra?.type === 'app_update') {
      startApkDownload(extra?.url);
      return;
    }
    const targetTab = extra?.tab || 'timer';
    if (onNavigate) {
      onNavigate(targetTab);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('studyio:navigate-tab', { detail: { tab: targetTab } })
      );
    }
  }).then((handle) => {
    removeListener = () => handle.remove();
  });

  return () => {
    if (removeListener) removeListener();
  };
}
