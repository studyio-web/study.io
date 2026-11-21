import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';
import {
  STILL_STUDYING_AFTER_HOURS,
  CONFIRM_WINDOW_MINUTES,
  ABSOLUTE_MAX_SESSION_HOURS,
  PAUSED_SESSION_AUTO_CLOSE_HOURS,
} from '@/config/timerConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TimerActionRequest {
  action: 'start' | 'pause' | 'resume' | 'stop' | 'confirm';
  session_id: string;
  expected_version?: number;
  event_id?: string;
  client_ts?: string;
  mode?: string;
  subject_id?: string | null;
  planned_duration_seconds?: number | null;
  is_ultra?: boolean;
  device_id?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    let user: any = null;

    // 1. Authenticate via cookies or Authorization Bearer header
    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();

    if (cookieUser) {
      user = cookieUser;
    } else {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        try {
          const admin = getSupabaseAdmin();
          const { data: tokenData } = await admin.auth.getUser(token);
          if (tokenData?.user) {
            user = tokenData.user;
          }
        } catch { }
      }
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Session missing or expired.' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as TimerActionRequest;
    const { action, session_id, expected_version, event_id, client_ts, device_id } = body;

    if (!session_id || !action) {
      return NextResponse.json(
        { success: false, error: 'action and session_id are required.' },
        { status: 400 }
      );
    }

    let dbClient = supabase;
    try {
      const admin = getSupabaseAdmin();
      if (admin) dbClient = admin;
    } catch { }

    const serverNow = new Date();

    // Event deduplication check if event_id is supplied
    if (event_id) {
      const { data: existingEvent } = await dbClient
        .from('processed_timer_events')
        .select('event_id')
        .eq('event_id', event_id)
        .maybeSingle();

      if (existingEvent) {
        // Already processed, return current active session idempotently
        const { data: currentActive } = await dbClient
          .from('active_sessions')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        return NextResponse.json({
          success: true,
          isDuplicateEvent: true,
          session: currentActive,
        });
      }

      // Record event
      try {
        await dbClient.from('processed_timer_events').insert({
          event_id,
          session_id,
          user_id: user.id,
          event_type: action,
          processed_at: serverNow.toISOString(),
        });
      } catch { }
    }

    // Process action
    let resultPayload: any = { success: true };

    if (action === 'start') {
      const plannedSec = Number(body.planned_duration_seconds) || null;
      const isUltra = Boolean(body.is_ultra);
      const mode = body.mode || 'stopwatch';
      const subjectId = body.subject_id || null;

      let plannedEnd: Date | null = null;
      let ultraEnds: Date | null = null;

      if (plannedSec && plannedSec > 0) {
        // Allow countdown lengths up to 24h exactly
        const clampedPlannedSec = Math.min(24 * 3600, plannedSec);
        plannedEnd = new Date(serverNow.getTime() + clampedPlannedSec * 1000);
        if (isUltra) {
          ultraEnds = plannedEnd;
        }
      }

      // Default confirmed_until window ONLY for open-ended stopwatch sessions
      // For countdown and Ultra, leave it null and use planned_end_at as the limit
      const confirmedUntil = mode === 'stopwatch'
        ? new Date(serverNow.getTime() + STILL_STUDYING_AFTER_HOURS * 3600 * 1000)
        : null;

      const clientTsDate = client_ts ? new Date(client_ts) : serverNow;
      const skewMs = Math.round(serverNow.getTime() - clientTsDate.getTime());

      const activeRecord = {
        user_id: user.id,
        session_id,
        status: 'running',
        mode,
        subject_id: subjectId,
        started_at: serverNow.toISOString(),
        accumulated_seconds: 0,
        accumulated_ms: 0,
        pomodoro_duration_seconds: plannedSec,
        planned_end_at: plannedEnd ? plannedEnd.toISOString() : null,
        is_ultra: isUltra,
        ultra_ends_at: ultraEnds ? ultraEnds.toISOString() : null,
        confirmed_until: confirmedUntil ? confirmedUntil.toISOString() : null,
        device_id: device_id || null,
        version: 1,
        client_skew_ms: skewMs,
        last_paused_at: null,
        updated_at: serverNow.toISOString(),
      };

      const { data, error } = await dbClient
        .from('active_sessions')
        .upsert(activeRecord, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) {
        console.error('[Timer Action] Error upserting start_session:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      resultPayload = { success: true, session: data || activeRecord };
    } else if (action === 'pause') {
      const { data: active, error: fetchErr } = await dbClient
        .from('active_sessions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchErr || !active) {
        return NextResponse.json({ success: true, session: null });
      }

      // Check version
      if (typeof expected_version === 'number' && active.version !== expected_version) {
        return NextResponse.json(
          {
            error: 'VERSION_CONFLICT',
            current_version: active.version,
            session: active,
          },
          { status: 409 }
        );
      }

      // ULTRA STRICT ENFORCEMENT
      if (active.is_ultra && active.ultra_ends_at) {
        const ultraEndMs = new Date(active.ultra_ends_at).getTime();
        if (serverNow.getTime() < ultraEndMs) {
          const remainingSec = Math.max(0, Math.ceil((ultraEndMs - serverNow.getTime()) / 1000));
          return NextResponse.json(
            {
              error: 'ULTRA_LOCKED',
              message: 'Ultra Strict mode is sealed and cannot be paused.',
              remaining_seconds: remainingSec,
              ultra_ends_at: active.ultra_ends_at,
            },
            { status: 423 }
          );
        }
      }

      let addedMs = 0;
      if (active.started_at && active.status === 'running') {
        addedMs = Math.max(0, serverNow.getTime() - new Date(active.started_at).getTime());
      }
      const totalAccumMs = (Number(active.accumulated_ms) || 0) + addedMs;

      const updateData = {
        status: 'paused',
        started_at: null,
        last_paused_at: serverNow.toISOString(),
        accumulated_ms: totalAccumMs,
        accumulated_seconds: Math.floor(totalAccumMs / 1000),
        version: (active.version || 1) + 1,
        device_id: device_id || active.device_id,
        updated_at: serverNow.toISOString(),
      };

      const { data, error } = await dbClient
        .from('active_sessions')
        .update(updateData)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      resultPayload = { success: true, session: data };
    } else if (action === 'resume') {
      const { data: active, error: fetchErr } = await dbClient
        .from('active_sessions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchErr || !active) {
        return NextResponse.json({ success: true, session: null });
      }

      // Auto-close if paused > 24 hours
      if (active.last_paused_at) {
        const pauseAgeHours = (serverNow.getTime() - new Date(active.last_paused_at).getTime()) / (3600 * 1000);
        if (pauseAgeHours >= PAUSED_SESSION_AUTO_CLOSE_HOURS) {
          await dbClient
            .from('active_sessions')
            .update({
              status: 'idle',
              started_at: null,
              accumulated_seconds: 0,
              accumulated_ms: 0,
              version: (active.version || 1) + 1,
              updated_at: serverNow.toISOString(),
            })
            .eq('user_id', user.id);

          return NextResponse.json(
            {
              error: 'PAUSED_EXPIRED',
              message: 'Session was closed after being paused for more than 24 hours.',
            },
            { status: 410 }
          );
        }
      }

      if (typeof expected_version === 'number' && active.version !== expected_version) {
        return NextResponse.json(
          {
            error: 'VERSION_CONFLICT',
            current_version: active.version,
            session: active,
          },
          { status: 409 }
        );
      }

      const updateData = {
        status: 'running',
        started_at: serverNow.toISOString(),
        last_paused_at: null,
        version: (active.version || 1) + 1,
        device_id: device_id || active.device_id,
        updated_at: serverNow.toISOString(),
      };

      const { data, error } = await dbClient
        .from('active_sessions')
        .update(updateData)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      resultPayload = { success: true, session: data };
    } else if (action === 'stop') {
      // 1. Idempotency Check on study_sessions
      const { data: existingSession } = await dbClient
        .from('study_sessions')
        .select('*')
        .eq('session_id', session_id)
        .maybeSingle();

      if (existingSession) {
        return NextResponse.json({
          success: true,
          isDuplicate: true,
          session: existingSession,
          duration_seconds: existingSession.duration_seconds,
        });
      }

      const { data: active } = await dbClient
        .from('active_sessions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!active || active.status === 'idle') {
        return NextResponse.json({ success: true, duration_seconds: 0, session: null });
      }

      // Check version conflict if expected_version is provided
      if (typeof expected_version === 'number' && active.version !== expected_version) {
        return NextResponse.json(
          {
            error: 'VERSION_CONFLICT',
            current_version: active.version,
            session: active,
          },
          { status: 409 }
        );
      }

      // ULTRA STRICT ENFORCEMENT
      if (active.is_ultra && active.ultra_ends_at) {
        const ultraEndMs = new Date(active.ultra_ends_at).getTime();
        if (serverNow.getTime() < ultraEndMs) {
          const remainingSec = Math.max(0, Math.ceil((ultraEndMs - serverNow.getTime()) / 1000));
          return NextResponse.json(
            {
              error: 'ULTRA_LOCKED',
              message: 'Ultra Strict mode is sealed until the countdown finishes.',
              remaining_seconds: remainingSec,
              ultra_ends_at: active.ultra_ends_at,
            },
            { status: 423 }
          );
        }
      }

      // Offline stops calculation:
      let effectiveEnd = serverNow;
      let isOfflineSynced = false;
      let clientSkew = 0;
      const clientTsDate = body.client_ts ? new Date(body.client_ts) : null;
      if (clientTsDate && !isNaN(clientTsDate.getTime())) {
        const clientSkewMs = serverNow.getTime() - clientTsDate.getTime();
        clientSkew = clientSkewMs;
        if (clientSkewMs > 30000) {
          isOfflineSynced = true;
          // Clamp client stop time to [started_at / last_paused_at / updated_at, now()]
          const startBound = active.started_at
            ? new Date(active.started_at)
            : (active.last_paused_at ? new Date(active.last_paused_at) : (active.updated_at ? new Date(active.updated_at) : serverNow));
          const clampedMs = Math.max(startBound.getTime(), Math.min(serverNow.getTime(), clientTsDate.getTime()));
          effectiveEnd = new Date(clampedMs);
        }
      }

      // Paused session auto-close: if paused for >= 24 hours, credit accumulated time up to pause point
      if (active.status === 'paused' && active.last_paused_at) {
        const pauseAgeHours = (serverNow.getTime() - new Date(active.last_paused_at).getTime()) / (3600 * 1000);
        if (pauseAgeHours >= PAUSED_SESSION_AUTO_CLOSE_HOURS) {
          effectiveEnd = new Date(active.last_paused_at);
        }
      }

      // Calculate authoritative duration
      let totalMs = Number(active.accumulated_ms) || 0;
      if (active.status === 'running' && active.started_at) {
        totalMs += Math.max(0, effectiveEnd.getTime() - new Date(active.started_at).getTime());
      }
      let finalSeconds = Math.max(0, Math.floor(totalMs / 1000));

      // 12h / 24h still studying cap ONLY for open-ended stopwatch sessions
      if (active.mode === 'stopwatch' && !active.planned_end_at) {
        let maxAllowed = STILL_STUDYING_AFTER_HOURS * 3600;
        if (active.confirmed_until) {
          const confDate = new Date(active.confirmed_until);
          const startDate = active.started_at ? new Date(active.started_at) : serverNow;
          const confirmedSpan = Math.floor((confDate.getTime() - startDate.getTime()) / 1000);
          maxAllowed = Math.min(ABSOLUTE_MAX_SESSION_HOURS * 3600, confirmedSpan);
        }
        finalSeconds = Math.min(finalSeconds, maxAllowed);
      } else if (
        active.mode === 'countdown' ||
        active.mode === 'pomodoro' ||
        active.planned_end_at
      ) {
        // For countdown, Pomodoro, and Ultra:
        // The credited time is min(elapsed, planned_end_at - started_at), NEVER clipped by the 12h rule.
        let plannedDuration = 0;
        if (active.planned_end_at && active.started_at) {
          plannedDuration = Math.floor((new Date(active.planned_end_at).getTime() - new Date(active.started_at).getTime()) / 1000);
        } else if (active.pomodoro_duration_seconds) {
          plannedDuration = Number(active.pomodoro_duration_seconds);
        }

        // Allow added time (+5m snooze) up to 25h (90,000s) maximum
        plannedDuration = Math.min(plannedDuration, 90000);

        if (plannedDuration > 0) {
          finalSeconds = Math.min(finalSeconds, plannedDuration);
        }
      }

      const effectiveStart = new Date(effectiveEnd.getTime() - finalSeconds * 1000);

      let savedRecord: any = null;
      if (finalSeconds > 0) {
        const insertPayload: any = {
          user_id: user.id,
          session_id,
          subject_id: active.subject_id || null,
          duration_seconds: finalSeconds,
          started_at: effectiveStart.toISOString(),
          ended_at: effectiveEnd.toISOString(),
          mode: active.mode || 'stopwatch',
          offline_synced: isOfflineSynced,
          client_skew_ms: clientSkew,
        };

        const { data: inserted, error: insertErr } = await dbClient
          .from('study_sessions')
          .insert([insertPayload])
          .select()
          .single();

        if (insertErr && insertErr.code === '23505') {
          // Idempotent duplicate catch
          const { data: dup } = await dbClient
            .from('study_sessions')
            .select('*')
            .eq('session_id', session_id)
            .maybeSingle();
          savedRecord = dup || insertPayload;
        } else {
          savedRecord = inserted || insertPayload;
        }
      }

      // Reset active_sessions
      await dbClient
        .from('active_sessions')
        .update({
          status: 'idle',
          started_at: null,
          accumulated_seconds: 0,
          accumulated_ms: 0,
          is_ultra: false,
          ultra_ends_at: null,
          planned_end_at: null,
          confirmed_until: null,
          last_paused_at: null,
          version: (active.version || 1) + 1,
          device_id: device_id || active.device_id,
          updated_at: serverNow.toISOString(),
        })
        .eq('user_id', user.id);

      resultPayload = {
        success: true,
        duration_seconds: finalSeconds,
        session: savedRecord,
      };
    } else if (action === 'confirm') {
      const { data: active } = await dbClient
        .from('active_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('session_id', session_id)
        .maybeSingle();

      if (!active) {
        return NextResponse.json({ success: false, error: 'SESSION_NOT_FOUND' }, { status: 404 });
      }

      if (active.mode !== 'stopwatch' || active.planned_end_at) {
        return NextResponse.json(
          { error: 'INVALID_MODE', message: 'Confirm still studying is only available for open-ended stopwatch sessions.' },
          { status: 400 }
        );
      }

      const startDate = active.started_at ? new Date(active.started_at) : serverNow;
      const absoluteMaxDate = new Date(startDate.getTime() + ABSOLUTE_MAX_SESSION_HOURS * 3600 * 1000);
      const extendedDate = new Date(serverNow.getTime() + STILL_STUDYING_AFTER_HOURS * 3600 * 1000);
      const newConfirmedUntil = extendedDate < absoluteMaxDate ? extendedDate : absoluteMaxDate;

      const { data, error } = await dbClient
        .from('active_sessions')
        .update({
          confirmed_until: newConfirmedUntil.toISOString(),
          version: (active.version || 1) + 1,
          device_id: device_id || active.device_id,
          updated_at: serverNow.toISOString(),
        })
        .eq('user_id', user.id)
        .eq('session_id', session_id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      resultPayload = {
        success: true,
        confirmed_until: newConfirmedUntil.toISOString(),
        session: data,
      };
    }

    // Trigger cross-device FCM push notification if receiver device exists
    try {
      if (supabase && user.id) {
        supabase.functions.invoke('send-notification', {
          body: {
            receiver_id: user.id,
            type: 'timer_sync',
            sender_id: user.id,
            action,
            session_id,
            status: action === 'stop' ? 'stopped' : action === 'pause' ? 'paused' : 'running',
            device_id,
            timestamp: serverNow.toISOString(),
          },
        }).catch(() => { });
      }
    } catch { }

    return NextResponse.json(resultPayload);
  } catch (err: any) {
    console.error('[Timer Action] Unhandled server error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error processing timer action.' },
      { status: 500 }
    );
  }
}
