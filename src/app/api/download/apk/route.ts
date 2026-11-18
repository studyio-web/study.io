import { NextResponse } from 'next/server';
import { LATEST_APK_CDN_URL } from '@/lib/apkDownload';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  // Directly 302 redirect to the full ~208MB APK hosted on GitHub LFS Fastly CDN
  // This bypasses Vercel's 100MB static asset limit and 50MB function payload limits
  return NextResponse.redirect(LATEST_APK_CDN_URL, {
    status: 302,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
