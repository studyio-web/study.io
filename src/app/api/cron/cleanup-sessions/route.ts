import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * REST API Route: POST /api/cron/cleanup-sessions
 * Scheduled cleanup job: Closes stale active sessions exceeding allowable limits
 * (12h unconfirmed, 24h absolute cap, 24h paused, countdown completion)
 * and authoritatively saves them clipped to study_sessions.
 */
export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized cron trigger.' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('cleanup_stale_active_sessions');

    if (error) {
      console.error('[Cron Cleanup] RPC error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || { success: true });
  } catch (err: any) {
    console.error('[Cron Cleanup] Exception:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error during session cleanup.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
