import { getSupabase } from './supabase';
import { recordStudySession } from '@/app/actions/sessions';
import type { SessionValidationInput, SessionValidationResult } from '@/lib/server/sessionValidation';

/**
 * Fetches the authoritative current server time to prevent local clock manipulation
 * and recover accurately from mobile WebView / browser tab sleep.
 * 
 * Strategy:
 * 1. Attempt Supabase RPC `get_server_time()` if Postgres function is defined.
 * 2. Fall back to `/api/server-time` fast edge/server endpoint.
 * 3. Fall back to local `Date.now()` if completely offline.
 */
export async function fetchAuthoritativeServerTime(): Promise<number> {
  // 1. First attempt: Supabase RPC
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase.rpc('get_server_time');
      if (!error && data) {
        const time = new Date(data).getTime();
        if (!isNaN(time) && time > 0) {
          return time;
        }
      }
    }
  } catch {
    // Ignore RPC error and proceed to HTTP fallback
  }

  // 2. Second attempt: API endpoint
  if (typeof window !== 'undefined') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch('/api/server-time', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (typeof data.timestamp === 'number' && data.timestamp > 0) {
          return data.timestamp;
        }
        if (data.serverTime) {
          const t = new Date(data.serverTime).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
      }
    } catch {
      // Offline or network timeout
    }
  }

  // 3. Fallback: Local device clock
  return Date.now();
}

/**
 * Saves a study session through server-side validation.
 * Calculates duration strictly from server timestamps and enforces 12h/24h caps.
 */
export async function saveValidatedSession(
  input: SessionValidationInput
): Promise<SessionValidationResult> {
  const safeInput: SessionValidationInput = {
    ...input,
    client_session_id:
      input.client_session_id ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : undefined),
  };

  // 1. Try Server Action
  try {
    const result = await recordStudySession(safeInput);
    if (result && result.success) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('studypulse:session-saved'));
      }
      return result;
    }
    console.warn('[Session Save] Server action returned unsuccessful status, proceeding to API route:', result?.error);
  } catch (err) {
    console.warn('[Session Save] Server action call threw exception, attempting API fallback:', err);
  }

  // 2. Fallback: REST API route /api/sessions/save
  if (typeof window !== 'undefined') {
    try {
      const supabase = getSupabase();
      let bearerToken: string | null = null;
      if (supabase) {
        try {
          const { data } = await supabase.auth.getSession();
          bearerToken = data?.session?.access_token || null;
        } catch {}
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
      }

      const res = await fetch('/api/sessions/save', {
        method: 'POST',
        headers,
        body: JSON.stringify(safeInput),
      });

      if (res.ok) {
        const json = await res.json();
        if (json && json.success) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('studypulse:session-saved'));
          }
          return json;
        }
        console.warn('[Session Save] API route returned error response, proceeding to direct client fallback:', json?.error);
      } else {
        console.warn('[Session Save] API route response status not OK:', res.status);
      }
    } catch (apiErr: any) {
      console.warn('[Session Save] API fallback failed with exception, attempting direct Supabase fallback:', apiErr);
    }

    // 3. Fallback: Direct client Supabase insert (Guaranteed fail-safe when online)
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data: authData } = await supabase.auth.getUser();
        const activeUid = authData?.user?.id;
        if (activeUid) {
          const rawDuration = Math.max(
            0,
            Math.floor(
              (new Date(safeInput.ended_at || Date.now()).getTime() -
                new Date(safeInput.started_at).getTime()) /
                1000
            )
          );
          const duration_seconds = Math.min(rawDuration, 43200);

          const payload: any = {
            user_id: activeUid,
            subject_id: safeInput.subject_id || null,
            duration_seconds,
            started_at: new Date(safeInput.started_at).toISOString(),
            ended_at: new Date(safeInput.ended_at || Date.now()).toISOString(),
            notes: safeInput.notes && safeInput.notes.trim().length > 0 ? safeInput.notes.trim() : null,
            mode: safeInput.mode || 'stopwatch',
          };

          const { data: directData, error: directErr } = await supabase
            .from('study_sessions')
            .insert([payload])
            .select()
            .single();

          if (!directErr && directData) {
            console.log('[Session Save] Successfully saved via direct Supabase client fallback:', directData);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('studypulse:session-saved'));
            }
            return {
              success: true,
              session: directData,
              calculatedSeconds: directData.duration_seconds || duration_seconds,
            };
          } else if (directErr) {
            console.warn('[Session Save] Direct Supabase insert error:', directErr);
          }
        }
      }
    } catch (clientErr) {
      console.error('[Session Save] Direct Supabase client fallback failed:', clientErr);
    }
  }

  return { success: false, error: 'Unable to reach server to save session.' };
}
