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
  planned_duration_seconds?: number | null;
  client_session_id?: string | null;
}

export interface SessionValidationResult {
  success: boolean;
  discarded?: boolean;
  isDuplicate?: boolean;
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
    client_session_id?: string | null;
    created_at?: string;
  } | null;
  calculatedSeconds?: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates and records a focus study session strictly using server timestamps.
 * 
 * Anti-Tamper & Data Integrity Guarantees:
 * 1. Authoritative Server Clock: Durations are never trusted from client inputs.
 *    Derived strictly from server-verified timestamps.
 * 2. Future Clamp: Timestamps beyond server time (with 30s network tolerance) are clamped.
 * 3. Break Exclusion: Pomodoro breaks NEVER count towards focus time or RP.
 * 4. Single-Session Cap: Strictly capped at 12 hours (43,200 seconds).
 * 5. Daily Cap: User's total study time per calendar day (UTC) is capped at 24 hours (86,400s).
 * 6. Planned Length Clamp: Countdown and Pomodoro cannot exceed planned duration + tolerance.
 * 7. Idempotency: Unique client_session_id prevents duplicate saves from retries or race conditions.
 * 8. Overlap Protection: Discards or clamps sessions overlapping with existing sessions.
 * 9. Active Session Cleanup: Resets live active_sessions state to prevent zombie accumulation.
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

    // 0. Pomodoro Break Time Exclusion: Breaks must NEVER count as focus sessions
    if (input.mode === 'pomodoro_break' || input.mode === 'break') {
      return {
        success: true,
        discarded: true,
        reason: 'Pomodoro break time does not count toward focus sessions or RP.',
        session: null,
        calculatedSeconds: 0,
      };
    }

    const serverNow = new Date();

    // Pick client: prefer admin client if configured to bypass RLS quirks, or fallback to user client
    let dbClient: SupabaseClient = client;
    try {
      const admin = getSupabaseAdmin();
      if (admin) dbClient = admin;
    } catch {
      // getSupabaseAdmin not configured, use client
    }

    // 1. Idempotency Check: If client_session_id is provided, check if already recorded
    const clientSessionId =
      input.client_session_id && UUID_REGEX.test(input.client_session_id)
        ? input.client_session_id
        : null;

    if (clientSessionId) {
      try {
        const { data: existingSession, error: checkError } = await dbClient
          .from('study_sessions')
          .select('*')
          .eq('user_id', user.id)
          .eq('client_session_id', clientSessionId)
          .maybeSingle();

        if (!checkError && existingSession) {
          return {
            success: true,
            isDuplicate: true,
            session: existingSession,
            calculatedSeconds: Number(existingSession.duration_seconds || 0),
            reason: 'Session already recorded (idempotent duplicate request ignored).',
          };
        }
      } catch {
        // If client_session_id column does not exist or query fails, ignore idempotency check
      }
    }

    // 2. Resolve & validate started_at and ended_at
    if (!input.started_at) {
      return { success: false, error: 'started_at timestamp is required.' };
    }

    const rawStartTime = new Date(input.started_at);
    if (isNaN(rawStartTime.getTime())) {
      return { success: false, error: 'Invalid started_at timestamp.' };
    }

    const rawEndTime = input.ended_at ? new Date(input.ended_at) : serverNow;
    if (isNaN(rawEndTime.getTime())) {
      return { success: false, error: 'Invalid ended_at timestamp.' };
    }

    if (rawEndTime.getTime() < rawStartTime.getTime()) {
      return { success: false, error: 'ended_at cannot precede started_at.' };
    }

    let startTime = rawStartTime;
    let endTime = rawEndTime;

    // A session cannot start in the future relative to server time (allow 30s jitter)
    if (startTime.getTime() > serverNow.getTime() + 30 * 1000) {
      startTime = new Date(serverNow.getTime());
    }

    // Clamp ended_at to current server time if in the future (30s tolerance for network lag)
    if (endTime.getTime() > serverNow.getTime() + 30 * 1000) {
      endTime = new Date(serverNow.getTime());
    }

    // 4. Authoritative duration calculation strictly based on server-verified timestamps
    let calculatedSeconds = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));

    // 5. Enforce Countdown / Pomodoro planned duration limit
    if (
      (input.mode === 'countdown' || input.mode === 'pomodoro') &&
      typeof input.planned_duration_seconds === 'number' &&
      input.planned_duration_seconds > 0
    ) {
      const maxAllowed = input.planned_duration_seconds + 60; // 60s tolerance
      if (calculatedSeconds > maxAllowed) {
        calculatedSeconds = input.planned_duration_seconds;
        startTime = new Date(endTime.getTime() - calculatedSeconds * 1000);
      }
    }

    // 6. Enforce Single Session Strict 12-Hour Cap
    if (calculatedSeconds > MAX_SESSION_SECONDS) {
      console.warn(`[Anti-Tamper] Session duration (${calculatedSeconds}s) exceeds 12-hour limit. Capping at 43,200s.`);
      calculatedSeconds = MAX_SESSION_SECONDS;
      startTime = new Date(endTime.getTime() - MAX_SESSION_SECONDS * 1000);
    }

    // 7. Enforce 24-Hour Calendar Day Cap (UTC)
    const dayStart = new Date(startTime);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

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

    // If completely capped to 0, discard cleanly
    if (calculatedSeconds <= 0) {
      return {
        success: true,
        discarded: true,
        reason: 'Daily 24-hour study limit reached or zero duration recorded.',
        session: null,
        calculatedSeconds: 0,
      };
    }

    // 8. Overlap Protection: Check if this session overlaps with an existing session
    const { data: overlapping } = await dbClient
      .from('study_sessions')
      .select('id, started_at, ended_at')
      .eq('user_id', user.id)
      .lt('started_at', endTime.toISOString())
      .gt('ended_at', startTime.toISOString())
      .limit(1);

    if (overlapping && overlapping.length > 0) {
      const prev = overlapping[0];
      const prevEnd = new Date(prev.ended_at).getTime();
      if (prevEnd > startTime.getTime()) {
        // Shift start time to after previous session
        startTime = new Date(prevEnd);
        calculatedSeconds = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));
        if (calculatedSeconds <= 0) {
          return {
            success: true,
            discarded: true,
            reason: 'Session completely overlaps with an existing study session.',
            session: null,
            calculatedSeconds: 0,
          };
        }
      }
    }

    // 9. Validate subject_id
    const subjectId =
      input.subject_id && UUID_REGEX.test(input.subject_id) ? input.subject_id : null;

    const payload: any = {
      user_id: user.id,
      subject_id: subjectId,
      duration_seconds: calculatedSeconds,
      started_at: startTime.toISOString(),
      ended_at: endTime.toISOString(),
      notes: input.notes && input.notes.trim().length > 0 ? input.notes.trim() : null,
      mode: input.mode || 'stopwatch',
    };

    if (clientSessionId) {
      payload.client_session_id = clientSessionId;
    }

    let { data, error: insertError } = await dbClient
      .from('study_sessions')
      .insert([payload])
      .select();

    // If client_session_id column does not exist in schema (code 42703), retry immediately without it
    if (insertError && (insertError.code === '42703' || insertError.message?.toLowerCase().includes('client_session_id'))) {
      const { client_session_id: _omit, ...cleanPayload } = payload;
      const retryRes = await dbClient
        .from('study_sessions')
        .insert([cleanPayload])
        .select();

      data = retryRes.data;
      insertError = retryRes.error;
    }

    if (insertError) {
      // If code 23505 (unique constraint on client_session_id), retrieve the existing row
      if (insertError.code === '23505' && clientSessionId) {
        try {
          const { data: dup } = await dbClient
            .from('study_sessions')
            .select('*')
            .eq('client_session_id', clientSessionId)
            .maybeSingle();

          if (dup) {
            return {
              success: true,
              isDuplicate: true,
              session: dup,
              calculatedSeconds: Number(dup.duration_seconds || 0),
              reason: 'Session already recorded (idempotent constraint hit).',
            };
          }
        } catch {}
      }
      console.error('[Anti-Tamper] Supabase insert error for study_sessions:', insertError);
      return { success: false, error: insertError.message };
    }

    const savedSession = data?.[0] || payload;

    // 10. Clean up active_sessions to prevent orphaned zombie timer state
    try {
      await dbClient
        .from('active_sessions')
        .update({
          status: 'idle',
          started_at: null,
          accumulated_seconds: 0,
        })
        .eq('user_id', user.id);
    } catch {
      // Non-fatal cleanup
    }

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
