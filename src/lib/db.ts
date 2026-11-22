import Dexie, { type Table } from 'dexie';

export interface OfflineTask {
  id: string;
  user_id: string;
  task: string;
  is_completed: boolean;
  priority: 'low' | 'medium' | 'high';
  due_date?: string;
  estimated_minutes?: number;
  subject_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfflineSubject {
  id: string;
  user_id: string;
  name: string;
  color: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface OfflineSession {
  id: string;
  user_id: string;
  duration_seconds: number;
  credited_seconds?: number;
  raw_seconds?: number;
  overlap_seconds_removed?: number;
  overlap_adjusted?: boolean;
  started_at: string;
  ended_at: string;
  subject_id?: string | null;
  mode?: string;
  notes?: string | null;
  client_session_id?: string;
  offline_synced?: boolean;
  created_at?: string;
}

export interface OfflineProfile {
  id: string;
  email: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  streakDays: number;
  seasonRp: number;
  rp: number;
  rank_title?: string;
  last_updated: number;
}

export interface OfflineLeaderboard {
  id: string;
  season_id: string;
  data: any[];
  updated_at: number;
}

export interface OfflineSetting {
  key: string;
  value: any;
  updated_at: number;
}

export interface OfflineOutboxEvent {
  event_id: string;
  entity_type: 'timer' | 'task' | 'subject' | 'setting';
  action: string;
  entity_id?: string;
  client_ts: string;
  updated_at: string;
  payload: Record<string, any>;
  attempts: number;
  last_attempt: number;
}

export class StudyIoDatabase extends Dexie {
  tasks!: Table<OfflineTask, string>;
  subjects!: Table<OfflineSubject, string>;
  sessions!: Table<OfflineSession, string>;
  profile!: Table<OfflineProfile, string>;
  leaderboard!: Table<OfflineLeaderboard, string>;
  settings!: Table<OfflineSetting, string>;
  outbox!: Table<OfflineOutboxEvent, string>;

  constructor() {
    super('StudyIoOfflineDB');

    this.version(1).stores({
      tasks: 'id, user_id, is_completed, subject_id, updated_at',
      subjects: 'id, user_id, is_archived, updated_at',
      sessions: 'id, user_id, started_at, client_session_id',
      profile: 'id, last_updated',
      leaderboard: 'id, season_id, updated_at',
      settings: 'key, updated_at',
      outbox: 'event_id, entity_type, client_ts, attempts',
    });
  }
}

// Singleton instance for browser / WebView
export const db = typeof window !== 'undefined' ? new StudyIoDatabase() : (null as unknown as StudyIoDatabase);
