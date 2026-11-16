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
 * - Listens for native registration event BEFORE calling register()
 * - Saves device token directly to Supabase profiles table
 * - Sets up listeners for pushNotificationReceived & pushNotificationActionPerformed
 */
export async function initPushNotifications(userId?: string): Promise<void> {
  if (userId) {
    currentActiveUserId = userId;
  }

  // If a token was already saved in localStorage, sync it directly to Supabase profiles
  if (typeof window !== 'undefined') {
    const existingToken = localStorage.getItem('studyio_fcm_token');
    const targetId = currentActiveUserId || userId;
    if (existingToken && targetId && !targetId.startsWith('guest')) {
      syncPushTokenToAccount(targetId, existingToken).catch(() => {});
    }
  }

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  // Pre-initialize Android notification channels
  await initNotificationChannels().catch(() => {});

  // If listeners are already attached, trigger register() again if needed and exit
  if (isPushInitialized) {
    try {
      await PushNotifications.register();
    } catch {}
    return;
  }
  isPushInitialized = true;

  try {
    // 1. Check existing permission status
    let permStatus = await PushNotifications.checkPermissions();

    // 2. Request permission if needed
    if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.log('[Push] Push notifications permission not granted:', permStatus.receive);
      return;
    }

    // 3. Attach listeners BEFORE calling register()
    // Native Listener: Registration Token
    await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('[Push] Native FCM registration token received:', token.value);
      try {
        localStorage.setItem('studyio_fcm_token', token.value);

        const supabase = getSupabase();
        if (supabase) {
          let targetId = currentActiveUserId || userId;
          if (!targetId) {
            const { data } = await supabase.auth.getUser();
            targetId = data?.user?.id;
          }

          if (targetId && !targetId.startsWith('guest')) {
            const { error } = await supabase
              .from('profiles')
              .update({ fcm_token: token.value, fcm_updated_at: new Date().toISOString() })
              .eq('id', targetId);

            if (error) {
              console.warn('[Push] Error updating profiles with fcm_token:', error);
            } else {
              console.log('[Push] Successfully saved FCM token to Supabase profiles for user:', targetId);
            }
          }
        }
      } catch (err) {
        console.warn('[Push] Failed to store/sync token on registration:', err);
      }
    });

    // Native Listener: Registration Error
    await PushNotifications.addListener('registrationError', (error: any) => {
      console.error('[Push] FCM Registration Error:', error);
    });

    // Native Listener: pushNotificationReceived
    // Dispatched when an FCM push is delivered (foreground or background wake)
    await PushNotifications.addListener(
      'pushNotificationReceived',
      async (notification: PushNotificationSchema) => {
        console.log('[Push] pushNotificationReceived:', notification);

        try {
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

    // Native Listener: pushNotificationActionPerformed
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

    // 4. Call register() AFTER all listeners are attached so the registration event is never dropped
    await PushNotifications.register();
    console.log('[Push] PushNotifications.register() called after listeners established');
  } catch (err) {
    console.error('[Push] Fatal error initializing native push notifications:', err);
  }
}

/**
 * Syncs the FCM token to the user profile in Supabase.
 */
export async function syncPushTokenToAccount(userId: string, token: string): Promise<void> {
  if (!userId || !token || userId.startsWith('guest')) return;
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase
        .from('profiles')
        .update({ fcm_token: token, fcm_updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        console.warn('[Push] Failed to sync FCM token to Supabase profile:', error);
      } else {
        console.log('[Push] Successfully synced FCM token to Supabase for user:', userId);
      }
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
          .update({ fcm_token: null, fcm_updated_at: new Date().toISOString() })
          .eq('id', userId);
      }
    }
  } catch (err) {
    console.warn('[Push] Failed to clear push token on logout:', err);
  }
}
