import { NextResponse } from 'next/server';
import { LATEST_APK_CDN_URL } from '@/lib/apkDownload';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const versionData = {
    version: '2.5',
    buildCode: 2,
    minRequiredVersion: '2.5',
    minRequiredBuild: 2,
    releaseDate: '2026-11-24',
    title: 'Study.io v2.5 Required Update',
    message: 'A required update is available with essential timer security, keyguard privacy, and background tracking stability. Please update to continue using Study.io.',
    downloadUrl: LATEST_APK_CDN_URL,
    directApkUrl: LATEST_APK_CDN_URL,
    apkSize: '105 MB',
    mandatory: true,
  };

  return NextResponse.json(versionData, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
