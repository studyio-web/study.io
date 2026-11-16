'use server';

import { createClient } from '@/lib/supabaseServer';
import { revalidatePath } from 'next/cache';
import {
  validateAndSaveSession,
  SessionValidationInput,
  SessionValidationResult,
} from '@/lib/server/sessionValidation';

/**
 * Server Action: Securely records and validates a study focus session.
 * 
 * Enforces server-side duration calculation (ended_at - started_at) and
 * strict 12-hour session and 24-hour daily limits. Client-provided duration is ignored.
 */
export async function recordStudySession(
  input: SessionValidationInput
): Promise<SessionValidationResult> {
  try {
    const supabase = await createClient();

    // Authenticate user via server session cookie
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Unauthorized. Please sign in to record sessions.' };
    }

    const result = await validateAndSaveSession(supabase, user, input);

    if (result.success) {
      try {
        revalidatePath('/', 'layout');
      } catch {
        // Ignore revalidatePath in non-standard request contexts
      }
    }

    return result;
  } catch (err: any) {
    console.error('Exception in recordStudySession server action:', err);
    return {
      success: false,
      error: err?.message || 'Server error recording study session.',
    };
  }
}
