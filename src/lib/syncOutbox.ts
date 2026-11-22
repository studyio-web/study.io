'use client';

import { db, OfflineOutboxEvent } from './db';
import toast from 'react-hot-toast';

export interface SyncOutboxEvent {
  event_id: string;
  entity_type: 'timer' | 'task' | 'subject' | 'setting' | 'session';
  action: string;
  entity_id?: string;
  client_ts: string;
  updated_at: string;
  payload: Record<string, any>;
  attempts: number;
  last_attempt: number;
}

const SYNC_OUTBOX_STORAGE_KEY = 'studyio_sync_outbox';
const LISTENERS: Set<(hasPending: boolean) => void> = new Set();
let isFlushing = false;
let autoFlushRegistered = false;

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

function getLocalFallback(): SyncOutboxEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SYNC_OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalFallback(events: SyncOutboxEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (events.length === 0) {
      localStorage.removeItem(SYNC_OUTBOX_STORAGE_KEY);
    } else {
      localStorage.setItem(SYNC_OUTBOX_STORAGE_KEY, JSON.stringify(events));
    }
  } catch {}
}

/**
 * Read all queued sync events from Dexie and localStorage fallback
 */
export async function getSyncOutboxQueue(): Promise<SyncOutboxEvent[]> {
  if (typeof window === 'undefined') return [];

  try {
    if (db && db.outbox) {
      const records = await db.outbox.orderBy('client_ts').toArray();
      if (records && records.length > 0) {
        return records as SyncOutboxEvent[];
      }
    }
  } catch (err) {
    console.warn('[SyncOutbox] Dexie read error, falling back to localStorage:', err);
  }

  return getLocalFallback();
}

/**
 * Persist queue to Dexie and localStorage
 */
async function saveSyncOutboxQueue(queue: SyncOutboxEvent[]): Promise<void> {
  setLocalFallback(queue);

  if (typeof window !== 'undefined' && db && db.outbox) {
    try {
      await db.outbox.clear();
      if (queue.length > 0) {
        await db.outbox.bulkAdd(queue as OfflineOutboxEvent[]);
      }
    } catch (err) {
      console.warn('[SyncOutbox] Dexie save error:', err);
    }
  }

  notifyListeners(queue.length > 0);
}

export function subscribeSyncOutbox(callback: (hasPending: boolean) => void): () => void {
  LISTENERS.add(callback);
  getSyncOutboxQueue().then((q) => callback(q.length > 0));
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

export async function hasPendingSyncEvents(): Promise<boolean> {
  const q = await getSyncOutboxQueue();
  return q.length > 0;
}

/**
 * Enqueue a sync event (tasks, subjects, settings, sessions)
 */
export async function enqueueSyncEvent(
  entity_type: SyncOutboxEvent['entity_type'],
  action: string,
  payload: Record<string, any>,
  entity_id?: string,
  updated_at?: string
): Promise<SyncOutboxEvent> {
  const event: SyncOutboxEvent = {
    event_id: generateUUID(),
    entity_type,
    action,
    entity_id,
    client_ts: new Date().toISOString(),
    updated_at: updated_at || payload.updated_at || new Date().toISOString(),
    payload,
    attempts: 0,
    last_attempt: 0,
  };

  const queue = await getSyncOutboxQueue();
  queue.push(event);
  await saveSyncOutboxQueue(queue);

  // If online, flush immediately
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    flushSyncOutbox().catch(() => {});
  }

  return event;
}

/**
 * Remove an event from the outbox
 */
export async function dequeueSyncEvent(eventId: string): Promise<void> {
  const queue = (await getSyncOutboxQueue()).filter((e) => e.event_id !== eventId);
  await saveSyncOutboxQueue(queue);
}

/**
 * Flush all pending events in chronological order with exponential backoff
 */
export async function flushSyncOutbox(): Promise<void> {
  if (isFlushing || typeof window === 'undefined' || !navigator.onLine) return;
  isFlushing = true;

  try {
    const queue = await getSyncOutboxQueue();
    if (queue.length === 0) return;

    const remaining: SyncOutboxEvent[] = [];

    for (const event of queue) {
      const now = Date.now();
      const attempts = event.attempts || 0;
      const backoffDelay = Math.min(30000, 1000 * Math.pow(2, attempts));
      if (now - (event.last_attempt || 0) < backoffDelay) {
        remaining.push(event);
        continue;
      }

      event.attempts = attempts + 1;
      event.last_attempt = now;

      try {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });

        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          console.log(`[SyncOutbox] Event ${event.event_id} (${event.entity_type}:${event.action}) synced.`);
          if (json.rejected) {
            toast(`Sync note: ${json.reason || 'Server has newer updates'}`, {
              id: `sync-reject-${event.event_id}`,
              icon: 'ℹ️',
            });
          }
        } else if (res.status === 409) {
          // Version / conflict: dropped per last-write-wins
          console.warn(`[SyncOutbox] Event ${event.event_id} dropped by server conflict rule.`);
          toast('Sync update superseded by newer change', {
            id: `sync-conflict-${event.event_id}`,
            icon: 'ℹ️',
          });
        } else if (res.status === 400 || res.status === 422) {
          // Unprocessable entity or malformed payload, drop to prevent poison pill
          console.error(`[SyncOutbox] Event ${event.event_id} rejected permanently:`, res.status);
          toast.error(`Event sync error: ${event.entity_type}`, { id: `sync-err-${event.event_id}` });
        } else {
          // Transient error: retain for backoff retry
          remaining.push(event);
          break; // preserve FIFO order
        }
      } catch (networkErr) {
        console.warn(`[SyncOutbox] Network error on event ${event.event_id}:`, networkErr);
        remaining.push(event);
        break; // stop loop while offline/unreachable
      }
    }

    await saveSyncOutboxQueue(remaining);
  } finally {
    isFlushing = false;
  }
}

/**
 * Register global listeners for reconnect, visibilitychange and periodic backoff
 */
export function registerAutoSync(): void {
  if (autoFlushRegistered || typeof window === 'undefined') return;
  autoFlushRegistered = true;

  window.addEventListener('online', () => {
    flushSyncOutbox().catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      flushSyncOutbox().catch(() => {});
    }
  });

  // Check periodically if pending events exist
  setInterval(() => {
    if (navigator.onLine) {
      flushSyncOutbox().catch(() => {});
    }
  }, 15000);
}
