'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Download, ShieldAlert, ShieldCheck, RefreshCw } from 'lucide-react';
import { isNativeAndroid } from '@/lib/timerNotificationPlugin';
import { startApkDownload, LATEST_APK_CDN_URL } from '@/lib/apkDownload';
import { isOlderVersion, fetchServerAppVersion, VersionData } from '@/lib/appVersion';
import { Logo } from '@/components/Logo';

export const STORAGE_KEY_MANDATORY = 'studyio_mandatory_update_active';
export const STORAGE_KEY_MIN_BUILD = 'studyio_min_required_build';
export const STORAGE_KEY_MIN_VERSION = 'studyio_min_required_version';

export function MandatoryUpdateGate() {
  const [isUpdateRequired, setIsUpdateRequired] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_MANDATORY) === 'true';
    }
    return false;
  });

  const [installedVersion, setInstalledVersion] = useState<string>('');
  const [installedBuild, setInstalledBuild] = useState<string>('');
  const [targetVersion, setTargetVersion] = useState<string>('2.5');
  const [downloadUrl, setDownloadUrl] = useState<string>(LATEST_APK_CDN_URL);
  const [isDownloading, setIsDownloading] = useState(false);
  const [apkSize, setApkSize] = useState<string>('105 MB');
  const hasMountedRef = useRef(false);

  const checkVersion = useCallback(async () => {
    // Only enforce mandatory update on native Android application environments
    if (!isNativeAndroid()) {
      setIsUpdateRequired(false);
      try {
        localStorage.removeItem(STORAGE_KEY_MANDATORY);
      } catch {}
      return;
    }

    let clientVersion = '';
    let clientBuild = '';

    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      if (info) {
        clientVersion = info.version || '';
        clientBuild = info.build || '';
        setInstalledVersion(clientVersion);
        setInstalledBuild(clientBuild);
      }
    } catch (err) {
      console.warn('[MandatoryUpdateGate] Error reading App.getInfo():', err);
    }

    const versionData: VersionData | null = await fetchServerAppVersion();

    if (versionData) {
      setTargetVersion(versionData.version || '2.5');
      if (versionData.downloadUrl) setDownloadUrl(versionData.downloadUrl);
      if (versionData.apkSize) setApkSize(versionData.apkSize);

      const minBuild = versionData.minRequiredBuild ?? versionData.buildCode ?? 2;
      const minVersion = versionData.minRequiredVersion || versionData.version || '2.5';

      try {
        localStorage.setItem(STORAGE_KEY_MIN_BUILD, String(minBuild));
        localStorage.setItem(STORAGE_KEY_MIN_VERSION, minVersion);
      } catch {}

      const requiresUpdate = Boolean(
        versionData.mandatory &&
        isOlderVersion(clientVersion, clientBuild, minVersion, minBuild)
      );

      if (requiresUpdate) {
        setIsUpdateRequired(true);
        try {
          localStorage.setItem(STORAGE_KEY_MANDATORY, 'true');
        } catch {}
      } else {
        setIsUpdateRequired(false);
        try {
          localStorage.removeItem(STORAGE_KEY_MANDATORY);
        } catch {}
      }
    } else {
      // Offline fallback: check cached requirements
      try {
        const cachedMinBuild = localStorage.getItem(STORAGE_KEY_MIN_BUILD);
        const cachedMinVersion = localStorage.getItem(STORAGE_KEY_MIN_VERSION);
        if (cachedMinBuild || cachedMinVersion) {
          const requiresUpdate = isOlderVersion(
            clientVersion,
            clientBuild,
            cachedMinVersion || '2.5',
            cachedMinBuild || '2'
          );
          if (requiresUpdate) {
            setIsUpdateRequired(true);
          }
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;
    checkVersion();
  }, [checkVersion]);

  // Intercept hardware Android back button to prevent dismissing this gate
  useEffect(() => {
    if (!isUpdateRequired) return;

    let backHandler: { remove: () => void } | null = null;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        backHandler = await App.addListener('backButton', () => {
          try {
            App.exitApp();
          } catch {}
        });
      } catch (err) {
        console.warn('[MandatoryUpdateGate] Back button listener error:', err);
      }
    })();

    return () => {
      backHandler?.remove();
    };
  }, [isUpdateRequired]);

  const handleDownload = useCallback(() => {
    setIsDownloading(true);
    startApkDownload(downloadUrl || LATEST_APK_CDN_URL);
    setTimeout(() => {
      setIsDownloading(false);
    }, 4000);
  }, [downloadUrl]);

  if (!isUpdateRequired) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
      className="fixed inset-0 z-[999999] flex flex-col items-center justify-center p-4 sm:p-6 bg-[#050507] text-white select-none overflow-y-auto"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 1.5rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.5rem)',
      }}
    >
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-amber-500/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-80 h-80 rounded-full bg-amber-600/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center text-center">
        {/* Brand Icon / Logo with pulse ring */}
        <div className="relative mb-5 flex items-center justify-center">
          <div className="absolute -inset-2 rounded-3xl bg-amber-500/20 blur-md animate-pulse" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1A1813] to-[#0D0C0A] border border-amber-500/40 flex items-center justify-center shadow-2xl">
            <Logo className="w-8 h-8" />
          </div>
        </div>

        {/* Status Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/35 bg-amber-500/10 text-amber-300 font-hud text-[11px] font-bold uppercase tracking-wider mb-3">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>MANDATORY UPDATE REQUIRED</span>
        </div>

        {/* Title */}
        <h1 id="update-title" className="font-hud font-extrabold text-2xl tracking-tight text-white mb-2">
          Update Required
        </h1>

        {/* Version comparison */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-mono text-zinc-400 mb-4">
          <span>Installed: <strong className="text-zinc-300 font-semibold">{installedVersion ? `v${installedVersion}` : (installedBuild ? `Build ${installedBuild}` : 'v1.0')}</strong></span>
          <span className="text-amber-400 font-bold">→</span>
          <span>Latest: <strong className="text-amber-400 font-semibold">v{targetVersion}</strong></span>
          {apkSize && <span className="text-zinc-500 text-[10px]">({apkSize})</span>}
        </div>

        {/* Description */}
        <p className="text-xs sm:text-sm text-zinc-300/90 leading-relaxed mb-6 font-sans">
          A critical update is required to continue using Study.io. This release includes important timer security, lockscreen protection, and background sync reliability.
        </p>

        {/* Primary Action Button */}
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-black font-hud font-bold text-xs sm:text-sm tracking-wider uppercase transition-all shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer disabled:opacity-75"
        >
          <Download className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
          <span>{isDownloading ? 'Starting Download...' : 'Download & Install Update'}</span>
        </button>

        {/* VirusTotal Verification Trust Indicator */}
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-mono text-emerald-400/90">
          <ShieldCheck className="w-3.5 h-3.5 stroke-[2] text-emerald-400" />
          <span>Verified Safe &bull; 63/64 Clean on VirusTotal</span>
        </div>

        {/* Installation Instructions */}
        <div className="w-full mt-4 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-left text-xs space-y-2 text-zinc-400">
          <div className="font-hud font-bold text-zinc-200 text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>How to update:</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono text-amber-400 font-bold shrink-0">1.</span>
            <span>Tap <strong>Download & Install Update</strong> above.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono text-amber-400 font-bold shrink-0">2.</span>
            <span>When finished, open <strong>studyio.apk</strong> from notifications.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono text-amber-400 font-bold shrink-0">3.</span>
            <span>Tap <strong>Update</strong> when asked, then reopen Study.io.</span>
          </div>
        </div>

        {/* Refresh check button */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95 py-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Already installed? Tap to refresh</span>
        </button>
      </div>
    </div>
  );
}
