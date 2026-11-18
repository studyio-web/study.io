'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Download, Sparkles, X } from 'lucide-react';
import { isNativeAndroid } from '@/lib/timerNotificationPlugin';
import { LocalNotifications } from '@capacitor/local-notifications';
import { startApkDownload, LATEST_APK_CDN_URL } from '@/lib/apkDownload';

const CURRENT_CLIENT_BUILD = 240; // baseline build of previously installed APKs
const TARGET_VERSION_KEY = 'studyio_update_v25_dismissed';
const TARGET_NOTIF_KEY = 'studyio_update_v25_notified';

interface VersionInfo {
  version: string;
  buildCode: number;
  title: string;
  message: string;
  downloadUrl: string;
  apkSize?: string;
}

export function AppUpdateNotifier() {
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkUpdate = async () => {
      try {
        const res = await fetch('/api/app-version', { cache: 'no-store' });
        if (!res.ok || !isMounted) return;
        const data: VersionInfo = await res.json();

        const isNative = isNativeAndroid();
        const storedBuild = Number(localStorage.getItem('studyio_app_build_version') || CURRENT_CLIENT_BUILD);
        const isDismissed = localStorage.getItem(TARGET_VERSION_KEY) === 'true';

        // An update is available if server buildCode (250) is greater than client build
        if (data.buildCode > storedBuild) {
          if (!isMounted) return;
          setUpdateInfo(data);

          // 1. Post native phone notification for existing installed Android app users
          if (isNative) {
            const hasNotified = localStorage.getItem(TARGET_NOTIF_KEY) === 'true';
            if (!hasNotified) {
              try {
                await LocalNotifications.schedule({
                  notifications: [
                    {
                      id: 7777,
                      title: '🚀 Study.io v2.5 Update Ready',
                      body: 'New update with background timer tracking & notification fixes. Tap to download.',
                      channelId: 'timer_alerts',
                      smallIcon: 'ic_stat_studyio',
                      iconColor: '#E6C15A',
                      sound: 'default',
                      extra: {
                        type: 'app_update',
                        url: data.downloadUrl || LATEST_APK_CDN_URL,
                      },
                    },
                  ],
                });
                localStorage.setItem(TARGET_NOTIF_KEY, 'true');
              } catch (notifErr) {
                console.warn('[AppUpdate] Failed to post local update notification:', notifErr);
              }
            }
          }

          // 2. Show in-app banner for native app users (if not dismissed)
          if (isNative && !isDismissed) {
            setIsVisible(true);
          }
        }
      } catch (err) {
        console.warn('[AppUpdate] Version check failed:', err);
      }
    };

    // Run check after a short 1.5s delay to ensure app boot is smooth
    const timer = setTimeout(checkUpdate, 1500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    localStorage.setItem(TARGET_VERSION_KEY, 'true');
  }, []);

  const handleDownload = useCallback(() => {
    localStorage.setItem('studyio_app_build_version', '250');
    setIsVisible(false);
    startApkDownload(updateInfo?.downloadUrl || LATEST_APK_CDN_URL);
  }, [updateInfo]);

  if (!isVisible || !updateInfo) return null;

  return (
    <aside
      aria-label="Application update announcement"
      className="fixed top-4 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="rounded-2xl border border-amber-500/35 bg-[#0F1117]/95 p-3.5 shadow-2xl backdrop-blur-xl flex items-start gap-3 text-left">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/20 border border-amber-500/30 text-amber-300">
          <Sparkles className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-hud font-bold text-xs uppercase tracking-wider text-amber-400">
              Update Available · v{updateInfo.version}
            </span>
            {updateInfo.apkSize && (
              <span className="text-[10px] font-mono text-white/40">
                ({updateInfo.apkSize})
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-white/80 line-clamp-2 font-sans">
            {updateInfo.message}
          </p>

          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#07090E] hover:bg-slate-100 transition-colors cursor-pointer shadow-sm active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Update</span>
            </button>
            <button
              onClick={handleDismiss}
              className="px-2.5 py-1.5 text-xs text-white/50 hover:text-white transition-colors cursor-pointer"
            >
              Later
            </button>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="text-white/40 hover:text-white p-1 rounded-lg transition-colors cursor-pointer shrink-0"
          aria-label="Dismiss update notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
