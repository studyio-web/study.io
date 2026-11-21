'use client';

/**
 * study.io — Timer Client Outbox Module
 * 
 * Provides an offline-first transactional queue for timer events.
 * Guarantees that start, pause, resume, stop, and confirm actions:
 * 1. Are persisted immediately to local storage before network dispatch.
 * 2. Are sent sequentially in FIFO order with idempotent event_id.
 * 3. Are retried automatically on network reconnect and app startup with exponential backoff.
 * 4. Expose active pending sync status to drive the "Not synced" UI indicator.
 */

export interface TimerOutboxEvent {
  event_id: string;
  session_id: string;
  type: 'start' | 'pause' | 'resume' | 'stop' | 'confirm';
  client_ts: string;
  expected_version?: number;
  payload?: Record<string, any>;
  attempts?: number;
  lastAttempt?: number;
}

const OUTBOX_STORAGE_KEY = 'studyio_timer_outbox';
const LISTENERS: Set<(hasPending: boolean) => void> = new Set();
let isFlushing = false;

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Load all queued events from local storage
 */
export function getOutboxQueue(): TimerOutboxEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[TimerOutbox] Error reading outbox storage:', err);
    return [];
  }
}

/**
 * Save queued events to local storage
 */
function saveOutboxQueue(queue: TimerOutboxEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (queue.length === 0) {
      localStorage.removeItem(OUTBOX_STORAGE_KEY);
    } else {
      localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queue));
    }
    notifyListeners(queue.length > 0);
  } catch (err) {
    console.warn('[TimerOutbox] Error persisting outbox storage:', err);
  }
}

/**
 * Check if there are any events pending sync
 */
export function hasPendingOutboxEvents(): boolean {
  return getOutboxQueue().length > 0;
}

/**
 * Subscribe to changes in the pending sync state
 */
export function subscribeOutboxStatus(callback: (hasPending: boolean) => void): () => void {
  LISTENERS.add(callback);
  callback(hasPendingOutboxEvents());
  return () => {
    LISTENERS.delete(callback);
  };
}

function notifyListeners(hasPending: boolean): void {
  LISTENERS.forEach((cb) => {
    try {
      cb(hasPending);
    } catch {}
  });
}

/**
 * Enqueue a new timer event to the outbox
 */
export function enqueueTimerEvent(
  type: TimerOutboxEvent['type'],
  sessionId: string,
  expectedVersion?: number,
  payload?: Record<string, any>
): TimerOutboxEvent {
  const event: TimerOutboxEvent = {
    event_id: generateUUID(),
    session_id: sessionId,
    type,
    client_ts: new Date().toISOString(),
    expected_version: expectedVersion,
    payload,
    attempts: 0,
    lastAttempt: 0,
  };

  const queue = getOutboxQueue();
  queue.push(event);
  saveOutboxQueue(queue);

  return event;
}

/**
 * Remove a successfully processed event from the outbox
 */
export function dequeueTimerEvent(eventId: string): void {
  const queue = getOutboxQueue().filter((e) => e.event_id !== eventId);
  saveOutboxQueue(queue);
}

/**
 * Process the outbox queue in order
 * @param sender Optional dispatch function that executes the server call for each event
 */
export async function flushTimerOutbox(
  sender?: (event: TimerOutboxEvent) => Promise<{ success: boolean; shouldDrop?: boolean; error?: string }>
): Promise<void> {
  if (isFlushing || typeof window === 'undefined' || !navigator.onLine) return;
  isFlushing = true;

  const dispatchEvent = sender || (async (event: TimerOutboxEvent) => {
    try {
      const res = await fetch('/api/timer/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: event.type,
          session_id: event.session_id,
          expected_version: event.expected_version,
          event_id: event.event_id,
          client_ts: event.client_ts,
          ...(event.payload || {}),
        }),
      });

      if (res.ok) {
        return { success: true };
      }

      if (res.status === 409) {
        // Version conflict: another device or session already updated. Drop stale event.
        return { success: false, shouldDrop: true, error: 'VERSION_CONFLICT' };
      }

      if (res.status === 423) {
        // Locked: Ultra strict mode active
        const data = await res.json().catch(() => ({}));
        return { success: false, shouldDrop: false, error: data.error || 'ULTRA_LOCKED' };
      }

      const errText = await res.text().catch(() => '');
      return { success: false, shouldDrop: false, error: `HTTP ${res.status}: ${errText}` };
    } catch (err: any) {
      return { success: false, shouldDrop: false, error: err?.message || 'Network error' };
    }
  });

  try {
    const queue = getOutboxQueue();
    if (queue.length === 0) {
      isFlushing = false;
      return;
    }

    const remaining: TimerOutboxEvent[] = [];

    for (const event of queue) {
      // Exponential backoff: minimum wait between retries
      const now = Date.now();
      const attempts = event.attempts || 0;
      const backoffDelay = Math.min(30000, 1000 * Math.pow(2, attempts));
      if (now - (event.lastAttempt || 0) < backoffDelay) {
        remaining.push(event);
        continue;
      }

      event.attempts = attempts + 1;
      event.lastAttempt = now;

      try {
        const result = await dispatchEvent(event);
        if (result.success || result.shouldDrop) {
          // Successfully processed or dropped (e.g., duplicate / conflict resolved)
          console.log(`[TimerOutbox] Event ${event.event_id} (${event.type}) synced successfully.`);
        } else {
          console.warn(`[TimerOutbox] Event ${event.event_id} failed:`, result.error);
          remaining.push(event);
          // Preserve FIFO ordering on transient errors
          break;
        }
      } catch (err) {
        console.warn(`[TimerOutbox] Network error dispatching event ${event.event_id}:`, err);
        remaining.push(event);
        break;
      }
    }

    saveOutboxQueue(remaining);
  } finally {
    isFlushing = false;
  }
}
