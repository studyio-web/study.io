import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { executeMonthlySeasonReset } from '@/lib/server/seasonReset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * REST API Route: POST /api/cron/season-reset
 * Automated or manually triggered month-boundary soft reset.
 * Idempotent: can be executed multiple times without double-resetting users.
 */
export async function POST(req: NextRequest) {
  try {
    // Check authorization header for CRON_SECRET or service key if configured
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized cron trigger.' }, { status: 401 });
    }

    const result = await executeMonthlySeasonReset();
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err: any) {
    console.error('Exception in season reset cron route:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error during season reset.' },
      { status: 500 }
    );
  }
}
