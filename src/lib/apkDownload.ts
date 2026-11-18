export const LATEST_APK_CDN_URL =
  'https://media.githubusercontent.com/media/studyio-web/study.io/main/public/studyio.apk';

/**
 * Triggers APK download in a robust, cross-platform manner:
 * 1. If running inside our Android native WebView bridge: calls native openExternalUrl intent.
 * 2. If running inside standard Capacitor: window.open(url, '_system') or external domain navigation
 *    which triggers Capacitor's Bridge.launchIntent -> Intent.ACTION_VIEW.
 * 3. In mobile or desktop browsers: triggers standard direct download from GitHub LFS CDN.
 */
export function startApkDownload(targetUrl: string = LATEST_APK_CDN_URL): void {
  if (typeof window === 'undefined') return;

  const url = targetUrl || LATEST_APK_CDN_URL;

  // 1. Android native JavaScript interface bridge (if available)
  try {
    const bridge = (window as unknown as { AndroidFullscreenBridge?: { openExternalUrl?: (u: string) => void } }).AndroidFullscreenBridge;
    if (bridge && typeof bridge.openExternalUrl === 'function') {
      bridge.openExternalUrl(url);
      return;
    }
  } catch (err) {
    console.warn('[ApkDownload] Bridge call failed:', err);
  }

  // 2. Capacitor / Cordova _system target (opens external default browser / Android DownloadManager)
  try {
    const sysWin = window.open(url, '_system');
    if (sysWin) return;
  } catch (err) {
    console.warn('[ApkDownload] window.open(_system) failed:', err);
  }

  // 3. Direct window.open with _blank
  try {
    const blankWin = window.open(url, '_blank');
    if (blankWin) return;
  } catch (err) {
    console.warn('[ApkDownload] window.open(_blank) failed:', err);
  }

  // 4. Anchor tag click with target="_blank"
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.download = 'studyio.apk';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return;
  } catch (err) {
    console.warn('[ApkDownload] Anchor dispatch failed:', err);
  }

  // 5. Ultimate fallback: location assignment (Capacitor intercepts external hosts and launches Intent.ACTION_VIEW)
  window.location.href = url;
}
