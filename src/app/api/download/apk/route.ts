import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cacheBuster = Date.now();
  const targetApk = new URL(`/studyio.apk?v=2.5&t=${cacheBuster}`, url.origin);

  return NextResponse.redirect(targetApk, {
    status: 307,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
