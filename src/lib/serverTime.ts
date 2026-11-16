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
      return result;
    }
    // If unauthorized or specific error, check if we should try API route
    if (result && result.error && result.error.includes('Unauthorized')) {
      // Proceed to API fallback with Bearer token
    } else if (result) {
      return result;
    }
  } catch (err) {
    console.warn('[Session Save] Server action call failed, attempting API fallback:', err);
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

      const json = await res.json();
      return json;
    } catch (apiErr: any) {
      console.error('[Session Save] API fallback failed:', apiErr);
      return {
        success: false,
        error: apiErr?.message || 'Network error saving session.',
      };
    }
  }

  return { success: false, error: 'Unable to reach server to save session.' };
}
