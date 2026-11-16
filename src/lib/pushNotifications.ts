'use client';

import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  Token,
  ActionPerformed,
  PushNotificationSchema,
} from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { TimerNotification } from './timerNotificationPlugin';
import { initNotificationChannels } from './notifications';
import { getSupabase } from './supabase';

let isPushInitialized = false;
let currentActiveUserId: string | null = null;

/**
 * Initialize Push Notifications for Capacitor Native Android using @capacitor/push-notifications.
 * - Requests POST_NOTIFICATIONS permission
 * - Registers device token with Firebase Cloud Messaging
 * - Adds native listeners for pushNotificationReceived & pushNotificationActionPerformed
 */
export async function initPushNotifications(userId?: string): Promise<void> {
  if (userId) {
    currentActiveUserId = userId;
    // If a token was already obtained, sync it immediately
    const existingToken = typeof window !== 'undefined' ? localStorage.getItem('studyio_fcm_token') : null;
    if (existingToken) {
      syncPushTokenToAccount(userId, existingToken).catch(() => {});
    }
  }

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  // Ensure notification channels are registered on the Android OS first
  await initNotificationChannels().catch(() => {});

  if (isPushInitialized) {
    return;
  }
  isPushInitialized = true;

  try {
    // 1. Check existing permission status
    let permStatus = await PushNotifications.checkPermissions();

    // 2. Request permission if not determined
    if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.log('[Push] Push notifications permission not granted:', permStatus.receive);
      return;
    }

    // 3. Register device token natively with FCM
    await PushNotifications.register();
    console.log('[Push] PushNotifications.register() invoked successfully');

    // 4. Native Listener: Registration Token
    await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('[Push] Native FCM registration token received:', token.value);
      try {
        localStorage.setItem('studyio_fcm_token', token.value);
        const targetUser = currentActiveUserId || userId;
        if (targetUser) {
          await syncPushTokenToAccount(targetUser, token.value);
        }
      } catch (err) {
        console.warn('[Push] Error storing/syncing token:', err);
      }
    });

    // 5. Native Listener: Registration Error
    await PushNotifications.addListener('registrationError', (error: any) => {
      console.error('[Push] FCM Registration Error:', error);
    });

    // 6. Native Listener: pushNotificationReceived
    // Dispatched when an FCM push is delivered (foreground or background wake)
    await PushNotifications.addListener(
      'pushNotificationReceived',
      async (notification: PushNotificationSchema) => {
        console.log('[Push] pushNotificationReceived:', notification);

        try {
          // Extract title, body, and custom data from incoming FCM payload
          const title =
            notification.title ||
            notification.data?.title ||
            'study.io';
          const body =
            notification.body ||
            notification.data?.body ||
            '';
          const channelId =
            notification.data?.channelId ||
            (notification.data?.type === 'nudge' || notification.data?.type === 'chat'
              ? 'social_nudges'
              : 'reminders');

          // Schedule local notification to guarantee display in notification tray with icon and sound
          await LocalNotifications.schedule({
            notifications: [
              {
                title,
                body,
                id: Math.floor(Date.now() % 100000) + 1000,
                channelId,
                smallIcon: 'ic_stat_timer',
                iconColor: '#F59E0B',
                sound: 'default',
                extra: {
                  ...notification.data,
                  title,
                  body,
                },
              },
            ],
          });
        } catch (err) {
          console.warn('[Push] Error displaying local notification for push:', err);
        }
      }
    );

    // 7. Native Listener: pushNotificationActionPerformed
    // Dispatched when the user taps the push notification from the notification drawer / lockscreen
    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (notification: ActionPerformed) => {
        console.log('[Push] pushNotificationActionPerformed:', notification);
        const data = notification.notification.data;
        const targetTab =
          data?.tab ||
          (data?.type === 'nudge' || data?.type === 'chat' ? 'rooms' : 'timer');

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('studyio:navigate-tab', { detail: { tab: targetTab } })
          );
        }
      }
    );
  } catch (err) {
    console.error('[Push] Fatal error initializing native push notifications:', err);
  }
}

/**
 * Syncs the FCM token to the user profile in Supabase.
 */
export async function syncPushTokenToAccount(userId: string, token: string): Promise<void> {
  if (!userId || !token) return;
  try {
    const supabase = getSupabase();
    if (supabase) {
      await supabase
        .from('profiles')
        .update({ fcm_token: token, fcm_updated_at: new Date().toISOString() } as any)
        .eq('id', userId);
      console.log('[Push] Successfully synced FCM token to Supabase for user:', userId);
    }
  } catch (err) {
    console.warn('[Push] Failed to sync FCM token to Supabase profile:', err);
  }
}

/**
 * Removes the FCM token from the user profile on logout and cleans up notifications.
 */
export async function clearPushTokenOnLogout(userId?: string): Promise<void> {
  try {
    currentActiveUserId = null;
    localStorage.removeItem('studyio_fcm_token');

    // Stop native timer foreground service and clear any lingering notifications
    if (Capacitor.isNativePlatform()) {
      TimerNotification.stop().catch(() => {});
      LocalNotifications.cancel({ notifications: [{ id: 1001 }, { id: 1002 }] }).catch(() => {});
    }

    if (userId) {
      const supabase = getSupabase();
      if (supabase) {
        await supabase
          .from('profiles')
          .update({ fcm_token: null, fcm_updated_at: new Date().toISOString() } as any)
          .eq('id', userId);
      }
    }
  } catch (err) {
    console.warn('[Push] Failed to clear push token on logout:', err);
  }
}
