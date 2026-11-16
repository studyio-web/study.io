import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';
import { validateAndSaveSession } from '@/lib/server/sessionValidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * REST API Route: POST /api/sessions/save
 * Authenticates user via cookies OR Authorization Bearer token, then applies
 * server-side duration calculation and 12h/24h caps.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    let user: any = null;

    // 1. Try cookie auth first
    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();

    if (cookieUser) {
      user = cookieUser;
    } else {
      // 2. Fallback to Bearer token in Authorization header
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        try {
          const admin = getSupabaseAdmin();
          const { data: tokenData } = await admin.auth.getUser(token);
          if (tokenData?.user) {
            user = tokenData.user;
          }
        } catch {
          // Token verification fallback
        }
      }
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Session missing or expired.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const result = await validateAndSaveSession(supabase, user, body);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Error in POST /api/sessions/save:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error' },
      { status: 500 }
    );
  }
}
