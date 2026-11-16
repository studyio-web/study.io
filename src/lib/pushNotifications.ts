'use client';

import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { TimerNotification } from './timerNotificationPlugin';
import { getSupabase } from './supabase';

let isPushInitialized = false;

/**
 * Initialize Push Notifications for Capacitor Native Android.
 * Registers FCM token, handles incoming notifications and taps.
 */
export async function initPushNotifications(userId?: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || isPushInitialized) return;
  isPushInitialized = true;

  try {
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.log('[Push] Notification permission not granted:', permStatus.receive);
      return;
    }

    // Register with FCM / Apple Push
    await PushNotifications.register();

    // Listen for FCM registration token
    PushNotifications.addListener('registration', async (token: Token) => {
      console.log('[Push] Device registered with FCM token:', token.value);
      try {
        localStorage.setItem('studyio_fcm_token', token.value);
        if (userId) {
          await syncPushTokenToAccount(userId, token.value);
        }
      } catch (err) {
        console.warn('[Push] Failed to persist token:', err);
      }
    });

    PushNotifications.addListener('registrationError', (error: any) => {
      console.warn('[Push] Registration error:', error);
    });

    // Listen for incoming notifications while app is in foreground
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Notification received in foreground:', notification);
    });

    // Listen for action performed (notification tapped)
    PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
      const data = notification.notification.data;
      const targetTab = data?.tab || 'timer';
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('studyio:navigate-tab', { detail: { tab: targetTab } })
        );
      }
    });
  } catch (err) {
    console.warn('[Push] Error initializing push notifications:', err);
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
    }
  } catch (err) {
    // Non-blocking
    console.warn('[Push] Sync token to account note:', err);
  }
}

/**
 * Removes the FCM token from the user profile on logout.
 */
export async function clearPushTokenOnLogout(userId?: string): Promise<void> {
  try {
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
