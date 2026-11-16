import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Authoritative Server Time Endpoint
 * Returns the exact server timestamp to prevent local clock manipulation and
 * allow client timers to accurately resync when waking up from background sleep.
 */
export async function GET() {
  const now = new Date();
  return NextResponse.json(
    {
      serverTime: now.toISOString(),
      timestamp: now.getTime(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    }
  );
}
