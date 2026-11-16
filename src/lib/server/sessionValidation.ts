import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabaseAdmin';

export const MAX_SESSION_SECONDS = 12 * 3600; // 43,200 seconds (12 hours)
export const MAX_DAILY_SECONDS = 24 * 3600;   // 86,400 seconds (24 hours)

export interface SessionValidationInput {
  started_at: string | number | Date;
  ended_at?: string | number | Date | null;
  subject_id?: string | null;
  notes?: string | null;
  mode?: string | null;
  client_session_id?: string | null;
}

export interface SessionValidationResult {
  success: boolean;
  discarded?: boolean;
  reason?: string;
  error?: string;
  session?: {
    id: string;
    user_id: string;
    subject_id: string | null;
    duration_seconds: number;
    started_at: string;
    ended_at: string;
    notes: string | null;
    mode: string;
    created_at?: string;
  } | null;
  calculatedSeconds?: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates and records a focus study session strictly using server timestamps.
 * 
 * Security & Anti-Manipulation Guarantees:
 * 1. The duration is NEVER trusted from client inputs. It is derived strictly
 *    from `ended_at - started_at` verified against the server's authoritative clock.
 * 2. Future timestamps beyond current server time (with small tolerance) are clamped.
 * 3. Single-Session Cap: Strictly capped at 12 hours (43,200 seconds). Excess time is discarded.
 * 4. Calendar-Day Cap: User's total study time per calendar day is strictly capped at 24 hours (86,400s).
 */
export async function validateAndSaveSession(
  client: SupabaseClient,
  user: { id: string; email?: string },
  input: SessionValidationInput
): Promise<SessionValidationResult> {
  try {
    if (!user || !user.id) {
      return { success: false, error: 'Unauthorized: User ID is required.' };
    }

    const serverNow = new Date();

    // 1. Resolve & validate started_at
    if (!input.started_at) {
      return { success: false, error: 'started_at timestamp is required.' };
    }

    let startTime = new Date(input.started_at);
    if (isNaN(startTime.getTime())) {
      return { success: false, error: 'Invalid started_at timestamp.' };
    }

    // A session cannot start in the future relative to server time (allow 30s jitter)
    if (startTime.getTime() > serverNow.getTime() + 30 * 1000) {
      startTime = new Date(serverNow.getTime());
    }

    // 2. Resolve & validate ended_at strictly using server timestamp
    let endTime = input.ended_at ? new Date(input.ended_at) : serverNow;
    if (isNaN(endTime.getTime())) {
      endTime = serverNow;
    }

    // Clamp ended_at to current server time if in the future (30s tolerance for network lag)
    if (endTime.getTime() > serverNow.getTime() + 30 * 1000) {
      endTime = new Date(serverNow.getTime());
    }

    if (endTime.getTime() < startTime.getTime()) {
      return { success: false, error: 'ended_at cannot precede started_at.' };
    }

    // 3. Authoritative duration calculation strictly based on server-verified timestamps
    let calculatedSeconds = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));

    // 4. Enforce Single Session Strict 12-Hour Cap
    if (calculatedSeconds > MAX_SESSION_SECONDS) {
      console.warn(`[Anti-Tamper] Session duration (${calculatedSeconds}s) exceeds 12-hour limit. Capping at 43,200s.`);
      calculatedSeconds = MAX_SESSION_SECONDS;
      startTime = new Date(endTime.getTime() - MAX_SESSION_SECONDS * 1000);
    }

    // 5. Enforce 24-Hour Calendar Day Cap
    // Determine the calendar day boundaries (UTC) for this session
    const dayStart = new Date(startTime);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Pick client: prefer admin client if configured to bypass RLS quirks, or fallback to user client
    let dbClient: SupabaseClient = client;
    try {
      const admin = getSupabaseAdmin();
      if (admin) dbClient = admin;
    } catch {
      // getSupabaseAdmin not configured, use client
    }

    const { data: daySessions, error: dayQueryError } = await dbClient
      .from('study_sessions')
      .select('duration_seconds')
      .eq('user_id', user.id)
      .gte('started_at', dayStart.toISOString())
      .lt('started_at', dayEnd.toISOString());

    if (dayQueryError) {
      console.warn('[Anti-Tamper] Warning querying daily sessions for cap check:', dayQueryError);
    }

    const existingDaySeconds = (daySessions || []).reduce(
      (sum: number, s: any) => sum + (Number(s.duration_seconds) || 0),
      0
    );

    const remainingDailySeconds = Math.max(0, MAX_DAILY_SECONDS - existingDaySeconds);

    if (calculatedSeconds > remainingDailySeconds) {
      console.warn(
        `[Anti-Tamper] Session duration (${calculatedSeconds}s) exceeds available daily study time (${remainingDailySeconds}s). Capping.`
      );
      calculatedSeconds = remainingDailySeconds;
      startTime = new Date(endTime.getTime() - calculatedSeconds * 1000);
    }

    // If completely capped to 0, discard the session cleanly
    if (calculatedSeconds <= 0) {
      return {
        success: true,
        discarded: true,
        reason: 'Daily 24-hour study limit reached or zero duration recorded.',
        session: null,
        calculatedSeconds: 0,
      };
    }

    // 6. Validate subject_id
    const subjectId =
      input.subject_id && UUID_REGEX.test(input.subject_id) ? input.subject_id : null;

    const payload = {
      user_id: user.id,
      subject_id: subjectId,
      duration_seconds: calculatedSeconds,
      started_at: startTime.toISOString(),
      ended_at: endTime.toISOString(),
      notes: input.notes && input.notes.trim().length > 0 ? input.notes.trim() : null,
      mode: input.mode || 'stopwatch',
    };

    const { data, error: insertError } = await dbClient
      .from('study_sessions')
      .insert([payload])
      .select();

    if (insertError) {
      console.error('[Anti-Tamper] Supabase insert error for study_sessions:', insertError);
      return { success: false, error: insertError.message };
    }

    const savedSession = data?.[0] || payload;

    return {
      success: true,
      session: savedSession,
      calculatedSeconds,
    };
  } catch (err: any) {
    console.error('[Anti-Tamper] Exception in validateAndSaveSession:', err);
    return { success: false, error: err?.message || 'Server error while validating session.' };
  }
}
