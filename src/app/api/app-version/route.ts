import { NextResponse } from 'next/server';
import { LATEST_APK_CDN_URL } from '@/lib/apkDownload';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const versionData = {
    version: '2.5',
    buildCode: 250,
    releaseDate: '2026-11-17',
    title: 'Study.io v2.5 Update Available',
    message: 'Persistent background timer tracking, screen-off WakeLock, and live chronometer notification updates.',
    downloadUrl: LATEST_APK_CDN_URL,
    directApkUrl: LATEST_APK_CDN_URL,
    apkSize: '208 MB',
    mandatory: false,
  };

  return NextResponse.json(versionData, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
