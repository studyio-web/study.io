'use client';

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  Token,
  PushNotificationSchema,
  ActionPerformed,
} from '@capacitor/push-notifications';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

/**
 * Root-level native push notification bridge for Android/iOS.
 * Mounts at the application root (via Providers / RootLayout) to:
 * 1. Request notification permissions
 * 2. Create the 'social_nudges' Android notification channel
 * 3. Attach 'registration' listener to save device FCM token to Supabase profiles
 * 4. Attach 'pushNotificationReceived' & 'pushNotificationActionPerformed' listeners
 * 5. Call PushNotifications.register()
 */
export function PushNotificationBridge() {
  const { user, isAuthenticated } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const isRegisteredRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let isMounted = true;

    async function setupPush() {
      try {
        // Ensure the native Android high-importance channel exists
        try {
          await PushNotifications.createChannel({
            id: 'social_nudges',
            name: 'Study Room Nudges',
            description: 'Alerts when other scholars nudge you in active study rooms',
            importance: 4, // High importance (heads-up banner with sound & vibration)
            visibility: 1, // Public (visible on secure lock screen)
            vibration: true,
            lights: true,
          });
        } catch (channelErr) {
          console.warn('[Push] Channel creation notice:', channelErr);
        }

        // a. Request push notification permissions
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          console.log('[Push] Notification permission status:', permStatus.receive);
          return;
        }

        if (!isMounted) return;

        // Prevent attaching multiple redundant event listeners
        if (!isRegisteredRef.current) {
          isRegisteredRef.current = true;

          // c. Add the registration listener to explicitly save token to Supabase profiles table
          await PushNotifications.addListener('registration', async (token: Token) => {
            console.log('[Push] Native FCM registration token received:', token.value);
            if (typeof window !== 'undefined') {
              localStorage.setItem('studyio_fcm_token', token.value);
            }

            try {
              const supabase = getSupabase();
              if (!supabase) return;

              let targetId: string | undefined = userRef.current?.id;
              if (!targetId || targetId.startsWith('guest')) {
                const { data } = await supabase.auth.getUser();
                targetId = data?.user?.id;
              }

              if (targetId && !targetId.startsWith('guest')) {
                const { error } = await supabase
                  .from('profiles')
                  .update({
                    fcm_token: token.value,
                    fcm_updated_at: new Date().toISOString(),
                  })
                  .eq('id', targetId);

                if (error) {
                  console.warn('[Push] Error updating profiles fcm_token:', error);
                } else {
                  console.log('[Push] Successfully saved FCM token to Supabase profiles for user:', targetId);
                }
              }
            } catch (saveErr) {
              console.warn('[Push] Failed to save registration token to Supabase:', saveErr);
            }
          });

          // Registration error listener
          await PushNotifications.addListener('registrationError', (error: any) => {
            console.error('[Push] FCM Registration Error:', error);
          });

          // d. Add pushNotificationReceived listener
          await PushNotifications.addListener(
            'pushNotificationReceived',
            (notification: PushNotificationSchema) => {
              console.log('[Push] pushNotificationReceived in foreground:', notification);
            }
          );

          // d. Add pushNotificationActionPerformed listener
          await PushNotifications.addListener(
            'pushNotificationActionPerformed',
            (action: ActionPerformed) => {
              console.log('[Push] pushNotificationActionPerformed:', action);
              const data = action.notification.data;
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

          // b. Call register() AFTER listeners are attached
          await PushNotifications.register();
          console.log('[Push] PushNotifications.register() called successfully');
        }
      } catch (err) {
        console.error('[Push] Fatal error during push notification setup:', err);
      }
    }

    setupPush();

    return () => {
      isMounted = false;
    };
  }, []);

  // When user state changes (e.g., login), sync cached token to user's profile
  useEffect(() => {
    if (!isAuthenticated || !user?.id || user.id.startsWith('guest')) return;
    if (typeof window === 'undefined') return;

    const cachedToken = localStorage.getItem('studyio_fcm_token');
    if (cachedToken) {
      const supabase = getSupabase();
      if (supabase) {
        supabase
          .from('profiles')
          .update({
            fcm_token: cachedToken,
            fcm_updated_at: new Date().toISOString(),
          })
          .eq('id', user.id)
          .then(({ error }) => {
            if (error) {
              console.warn('[Push] Error syncing cached FCM token on auth change:', error);
            } else {
              console.log('[Push] Synced cached FCM token to user profile:', user.id);
            }
          }, (err) => {
            console.warn('[Push] Error during token sync on auth change:', err);
          });
      }
    }
  }, [isAuthenticated, user?.id]);

  return null;
}
