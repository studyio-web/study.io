'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback, useMemo } from 'react';
import { Subject, StudySession, TodoItem, TimerMode, PomodoroPhase, PomodoroPreset, PomodoroCompletedPhase, RankSettlementData, SeasonRecapData, SeasonResetData, UserProfile, ActiveSession } from '../types';
import { INITIAL_TODOS, getTodayDateString, calculateStreak, cleanupLegacyDemoData, setCachedStreak } from '../lib/mockData';
import { getLocalStartOfDay, getLocalEndOfDay, getLocalDateString } from '../lib/dateUtils';
import { splitSessionAtMidnights } from '../lib/sessionSplitting';
import { useAuth } from './AuthContext';
import { useStudyMode } from './StudyModeContext';
import { resolveDefaultSubjectId, DEFAULT_SUBJECT_NAME, DEFAULT_SUBJECT_COLOR } from '../lib/defaultSubjectResolver';
import { getSupabase } from '../lib/supabase';
import { getDeviceId, initDeviceId, cleanDeviceId } from '../lib/deviceId';
import { soundFx } from '../lib/audio';
import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';
import { hapticSuccess } from '../lib/haptics';
import {
  getLevelProgress,
  calculateFocusXP,
  getLevelTitle,
  getLevelFromLifetimeXP,
  getCumulativeXPForLevel,
  getScholarTitle,
  LevelProgress,
} from '../lib/gamification';
import {
  calculateSessionRP,
  calculateSeasonReset,
  getCurrentSeasonId,
  getRankTier,
  HARD_RESET_CAP_RP,
  resolveUserSeasonReset,
} from '../lib/rankedSystem';
import {
  calculateSeasonRp,
  getCurrentMonthFocusSeconds,
  resolveLiveSeasonStats,
} from '../lib/ranks';
import { getCachedUserState, saveCachedUserState } from '../lib/userCache';
import { fetchAuthoritativeServerTime, saveValidatedSession, getServerNow, syncServerClockOffset, computeElapsedSessionSeconds } from '../lib/serverTime';
import { TimerSessionEngine } from '../lib/timerEngine';
import {
  STILL_STUDYING_AFTER_HOURS,
  CONFIRM_WINDOW_MINUTES,
  ABSOLUTE_MAX_SESSION_HOURS,
  PAUSED_SESSION_AUTO_CLOSE_HOURS,
  POLL_INTERVAL_VISIBLE_SECONDS,
} from '../config/timerConfig';
import {
  enqueueTimerEvent,
  dequeueTimerEvent,
  flushTimerOutbox,
  subscribeOutboxStatus,
  hasPendingOutboxEvents,
  TimerOutboxEvent,
} from '../lib/timerOutbox';
import { db } from '../lib/db';
import { enqueueSyncEvent, subscribeSyncOutbox, flushSyncOutbox, registerAutoSync } from '../lib/syncOutbox';
import { calculateNonOverlappingSeconds } from '../lib/nonOverlappingTime';
import { notify, initNotificationChannels, requestNotificationPermission as requestNotifyPermission } from '../lib/notifications';
import { isNativeAndroid, TimerNotification } from '../lib/timerNotificationPlugin';

export const showPushNotification = async (title: string, options?: NotificationOptions) => {
  return notify('custom', {
    title,
    body: options?.body,
    channelId: 'timer_alerts',
    silent: options?.silent ?? true,
    extra: options?.data,
  });
};


interface StudyContextType {
  isSyncConnected: boolean;
  realtimeStatus: string;
  isUsingPollingFallback: boolean;
  realtimeUserId: string | null;
  realtimeEventsCount: number;
  refetchActiveSession: () => Promise<void>;
  isRemoteTransitioning: boolean;
  isRemoteSession: boolean;
  setIsRemoteSession: (val: boolean) => void;
  takeOverSession: () => Promise<void>;
  endRemoteSession: () => Promise<void>;
  lastRemoteSyncTime: number | null;
  hasHydrated: boolean;
  isLoadingSessions: boolean;
  gamification: LevelProgress;
  settlementData: RankSettlementData | null;
  showRankSettlement: (data: RankSettlementData) => void;
  dismissRankSettlement: () => void;
  seasonRecap: SeasonRecapData | null;
  dismissSeasonRecap: () => void;
  simulateSeasonReset: (scenario?: 'returning' | 'first' | 'zero') => void;
  seasonResetAlert: SeasonResetData | null;
  dismissSeasonResetAlert: () => void;
  simulateSeasonResetModal: (mockData?: Partial<SeasonResetData>) => void;
  lastXpEarned: { id: string; amount: number; reason: string; type?: 'focus' | 'todo' | 'streak' | 'general' } | null;
  levelUpData: { newLevel: number; oldLevel: number; title: string } | null;
  triggerLevelUp: (oldLevel: number, newLevel: number, title: string) => void;
  dismissLevelUpModal: () => void;
  dismissXpNotification: () => void;
  isIdleCheckActive: boolean;
  isBlockedByOtherTab: boolean;
  confirmIdleCheck: () => void;
  triggerXpEarned: (amount: number, reason: string, type?: 'focus' | 'todo' | 'streak' | 'general') => void;
  subjects: Subject[];
  selectedSubject: Subject | null;
  selectedSubjectId: string;
  setSelectedSubjectId: (id: string) => void;
  timerMode: TimerMode;
  setTimerMode: (mode: TimerMode) => void;
  countdownTarget: number;
  setCountdownTarget: (target: number) => void;
  isUltraStrict: boolean;
  setIsUltraStrict: (val: boolean | ((prev: boolean) => boolean)) => void;
  syncTimerMode: (mode: TimerMode, isUltra?: boolean, target?: number) => void;
  isStudying: boolean;
  isPaused: boolean;
  isRunning: boolean;
  startTimeRef: React.MutableRefObject<number | null>;
  clientSessionIdRef: React.MutableRefObject<string | null>;
  timerEngineRef: React.MutableRefObject<TimerSessionEngine>;
  elapsedSeconds: number;
  syncTimerWithServerTime: (serverTimestamp?: number) => Promise<number | null>;
  pomodoroPhase: PomodoroPhase;
  setPomodoroPhase: (phase: PomodoroPhase) => void;
  pomodoroWorkDuration: number;
  pomodoroBreakDuration: number;
  pomodoroPreset: PomodoroPreset;
  setPomodoroPreset: (preset: PomodoroPreset) => void;
  pomodoroCompletedPhase: PomodoroCompletedPhase;
  setPomodoroCompletedPhase: (phase: PomodoroCompletedPhase) => void;
  saveAndStartBreak: () => Promise<void>;
  skipPomodoroBreak: () => Promise<void>;
  startPomodoroBreak: () => void;
  activeTaskId: string | null;
  currentNotes: string;
  setCurrentNotes: (notes: string) => void;
  sessions: StudySession[];
  todos: TodoItem[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  isFocusModeOpen: boolean;
  setIsFocusModeOpen: (open: boolean) => void;
  startTimer: (subjectId?: string, taskId?: string) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: (durationOverride?: number, notesOverride?: string, subjectOverride?: Subject | null) => Promise<void>;
  completeTimer: (durationOverride?: number, notesOverride?: string, subjectOverride?: Subject | null) => Promise<void>;
  saveSession?: (sessionData: {
    user_id?: string;
    userId?: string;
    subject_id?: string;
    subjectId?: string;
    subject_name?: string;
    subjectName?: string;
    subject_color?: string;
    subjectColor?: string;
    duration_seconds?: number;
    durationSeconds?: number;
    duration?: number;
    created_at?: string;
    notes?: string;
    mode?: TimerMode;
  }) => Promise<boolean>;
  resetTimer: () => void;
  restoreTimerSession: (seconds: number, mode?: TimerMode, subjectIdOrName?: string, startAsRunning?: boolean, startAnchorMs?: number) => void;
  clearPersistedTimer: () => void;
  addSubject: (subject: Omit<Subject, 'id' | 'createdAt'>) => Promise<void>;
  updateSubject: (id: string, updates: Partial<Subject>) => Promise<void>;
  deleteSubject: (id: string) => Promise<void>;
  addTodo: (todo: Omit<TodoItem, 'id' | 'userId' | 'createdAt'>) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  updateTodoTitle: (id: string, title: string) => void;
  clearCompletedTodos: () => void;
  getTodayTotalSeconds: () => number;
  refetchSessions: () => Promise<void>;
  fetchHistoricalSessions?: () => Promise<void>;
  querySessionsByRange: (startOfDay: Date, endOfDay: Date) => Promise<StudySession[]>;
  addSession: (session: StudySession) => void;
  persistStudySession: (sessionData: {
    subjectId?: string;
    subjectName?: string;
    subjectColor?: string;
    durationSeconds: number;
    startTime: string;
    endTime: string;
    notes?: string;
    mode?: TimerMode;
  }) => Promise<boolean>;
  hasPendingSync: boolean;
  isStillStudyingPromptOpen: boolean;
  stillStudyingPromptTime: number;
  confirmStillStudying: () => Promise<void>;
  closeStillStudyingPrompt: () => void;
  autoCloseNotice: string | null;
  dismissAutoCloseNotice: () => void;
}

export const getSubjectStorageKey = (uid?: string) => `study_io_subjects_${uid || 'guest'}`;
export const getSelectedSubjectStorageKey = (uid?: string) => `study_io_selected_subject_${uid || 'guest'}`;
export const getSessionStorageKey = (uid?: string) => `study_io_sessions_${uid || 'guest'}`;

export function normalizeStudySessions(
  list: any[],
  subjectList: Subject[] = [],
  currentUser?: UserProfile
): StudySession[] {
  if (!Array.isArray(list)) return [];
  const validSubjects = Array.isArray(subjectList) ? subjectList : [];

  return list
    .filter(s => {
      if (!s || typeof s !== 'object') return false;
      const duration = Number(s.durationSeconds ?? (s as any).duration_seconds ?? (s as any).duration ?? (s as any).seconds ?? 0);
      if (duration <= 0) return false;
      const rawName = ((s as any).subject_name || s.subjectName || (s as any).subject?.name || (s as any).subject || '').trim().toLowerCase();
      const subId = (s.subjectId || (s as any).subject_id || '').trim();
      const hasMatchedSub = validSubjects.some(sub => sub && ((subId && sub.id === subId) || (rawName && sub.name && sub.name.trim().toLowerCase() === rawName)));
      return hasMatchedSub;
    })
    .map((s, idx): StudySession => {
      const subjectId = (s.subjectId || (s as any).subject_id || '').trim();
      const rawSubjectName = ((s as any).subject_name || s.subjectName || (s as any).subject?.name || (s as any).subject || '').trim();

      const matchedSub = validSubjects.find(
        sub => sub && (
          (subjectId && sub.id === subjectId) ||
          (rawSubjectName && sub.name && sub.name.trim().toLowerCase() === rawSubjectName.toLowerCase())
        )
      );

      const resolvedName = matchedSub?.name || (rawSubjectName && rawSubjectName.toLowerCase() !== 'unassigned' ? rawSubjectName : 'Unknown');
      const resolvedColor =
        matchedSub?.color ||
        (s.subjectColor && s.subjectColor !== '#5A6B6A' ? s.subjectColor : null) ||
        (s as any).subject_color ||
        (s as any).subjects?.color ||
        '#10B981';

      const startTime =
        s.startTime ||
        (s as any).started_at ||
        s.createdAt ||
        (s as any).created_at ||
        new Date().toISOString();

      const durationSeconds = Number(
        s.durationSeconds ?? (s as any).duration_seconds ?? (s as any).duration ?? (s as any).seconds ?? 0
      );

      return {
        id: s.id || `sess-${Date.now()}-${idx}`,
        userId: s.userId || (s as any).user_id || currentUser?.id || 'guest',
        userName: s.userName || currentUser?.displayName || 'Scholar',
        userAvatar: s.userAvatar || currentUser?.avatarUrl,
        subjectId: matchedSub?.id || subjectId || '',
        subjectName: resolvedName,
        subjectColor: resolvedColor,
        subject_name: resolvedName,
        subject_color: resolvedColor,
        subject: s.subject || s.subjects || matchedSub,
        startTime,
        endTime: s.endTime || (s as any).ended_at || (s as any).completed_at || startTime,
        durationSeconds,
        duration_seconds: durationSeconds,
        notes: s.notes || '',
        mode: (s.mode as TimerMode) || 'stopwatch',
        createdAt: s.createdAt || (s as any).created_at || startTime,
      };
    });
}

export function mergeAndDeduplicateSessions(existing: StudySession[], incoming: StudySession[]): StudySession[] {
  const allSessions = [...incoming, ...existing];
  const seenIds = new Set<string>();
  const seenClientSessionIds = new Set<string>();
  const uniqueSessions: StudySession[] = [];

  for (const s of allSessions) {
    if (!s || !s.id) continue;
    if (seenIds.has(s.id)) continue;

    // Deduplicate by client_session_id
    const clientSessId = s.client_session_id || (s as any).clientSessionId;
    if (clientSessId) {
      if (seenClientSessionIds.has(clientSessId)) continue;
      seenClientSessionIds.add(clientSessId);
    }

    const sStart = new Date(s.startTime || (s as any).started_at || 0).getTime();
    const sEnd = s.endTime ? new Date(s.endTime || (s as any).ended_at || 0).getTime() : sStart + (s.durationSeconds || 0) * 1000;
    const sSub = ((s.subjectId || '') + '::' + (s.subjectName || (s as any).subject_name || '')).trim().toLowerCase();
    const sDuration = Number(s.durationSeconds ?? (s as any).duration_seconds ?? 0);

    const isDuplicate = uniqueSessions.some(existingSession => {
      const existingStart = new Date(existingSession.startTime || (existingSession as any).started_at || 0).getTime();
      const existingEnd = existingSession.endTime ? new Date(existingSession.endTime || (existingSession as any).ended_at || 0).getTime() : existingStart + (existingSession.durationSeconds || 0) * 1000;
      const existingSub = ((existingSession.subjectId || '') + '::' + (existingSession.subjectName || (existingSession as any).subject_name || '')).trim().toLowerCase();
      const existingDuration = Number(existingSession.durationSeconds ?? (existingSession as any).duration_seconds ?? 0);

      // Same subject or either subject unassigned/unknown, start time within 30 seconds and duration difference <= 15s
      const subjectCompatible = sSub === existingSub || !s.subjectId || !existingSession.subjectId;
      if (
        subjectCompatible &&
        sDuration > 0 &&
        existingDuration > 0 &&
        Math.abs(existingStart - sStart) <= 30000 &&
        Math.abs(existingDuration - sDuration) <= 15
      ) {
        return true;
      }

      // Significant temporal overlap between two sessions
      if (sDuration > 0 && existingDuration > 0 && existingEnd > existingStart && sEnd > sStart) {
        const overlapStart = Math.max(sStart, existingStart);
        const overlapEnd = Math.min(sEnd, existingEnd);
        if (overlapEnd > overlapStart) {
          const overlapDur = (overlapEnd - overlapStart) / 1000;
          if (overlapDur > 0.5 * Math.min(sDuration, existingDuration)) {
            return true;
          }
        }
      }

      return false;
    });

    if (isDuplicate) continue;

    seenIds.add(s.id);
    uniqueSessions.push(s);
  }

  return uniqueSessions.sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
}

export function getStoredSessions(uid?: string, subjectList: Subject[] = [], currentUser?: UserProfile): StudySession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('studyio_cached_recent_sessions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function persistSessionsToLocalStorage(sessions: StudySession[], uid?: string) {
  if (typeof window === 'undefined') return;
  try {
    const oneMonthAgo = Date.now() - 31 * 24 * 3600 * 1000;
    const recent = sessions.filter(s => new Date(s.startTime || (s as any).started_at || 0).getTime() >= oneMonthAgo);
    try {
      localStorage.setItem('studyio_cached_recent_sessions', JSON.stringify(recent.slice(0, 100)));
    } catch {}

    if (db && db.sessions) {
      const dbRecords = recent.map(s => ({
        id: s.id,
        user_id: uid || s.userId || 'guest',
        duration_seconds: s.durationSeconds,
        started_at: s.startTime,
        ended_at: s.endTime,
        subject_id: s.subjectId || null,
        mode: 'stopwatch',
        notes: s.notes || null,
        client_session_id: s.client_session_id || s.id,
        created_at: s.startTime,
      }));
      db.sessions.clear().then(() => db.sessions.bulkPut(dbRecords)).catch(() => {});
    }
  } catch {}
}

export function deduplicateSubjects(list: Subject[]): Subject[] {
  if (!Array.isArray(list)) return [];
  const seenActiveNames = new Set<string>();
  const seenIds = new Set<string>();
  const result: Subject[] = [];

  // 1. Non-archived subjects first (deduplicated by normalized name)
  for (const item of list) {
    if (!item) continue;
    if (item.is_archived) continue;
    const normalized = (item.name || '').trim().toLowerCase();
    if (!normalized || seenActiveNames.has(normalized) || (item.id && seenIds.has(item.id))) continue;
    seenActiveNames.add(normalized);
    if (item.id) seenIds.add(item.id);
    result.push(item);
  }

  // 2. Archived subjects preserved by id for session lookups and historical analytics
  for (const item of list) {
    if (!item) continue;
    if (!item.is_archived) continue;
    if (item.id && seenIds.has(item.id)) continue;
    if (item.id) seenIds.add(item.id);
    result.push(item);
  }

  return result;
}

export const getStoredLastSeenLevel = (userId?: string): number | null => {
  if (typeof window === 'undefined') return null;
  try {
    if (userId) {
      const userVal = localStorage.getItem(`studypulse_last_seen_level_${userId}`);
      if (userVal !== null && !isNaN(Number(userVal))) return Number(userVal);
    }
    const globalVal = localStorage.getItem('last_seen_level') || localStorage.getItem('studypulse_last_seen_level');
    if (globalVal !== null && !isNaN(Number(globalVal))) return Number(globalVal);
  } catch {}
  return null;
};

export const setStoredLastSeenLevel = (level: number, userId?: string) => {
  if (typeof window === 'undefined') return;
  try {
    if (userId) {
      localStorage.setItem(`studypulse_last_seen_level_${userId}`, String(level));
    }
    localStorage.setItem('last_seen_level', String(level));
    localStorage.setItem('studypulse_last_seen_level', String(level));
  } catch {}
};

const StudyContext = createContext<StudyContextType | undefined>(undefined);

export function StudyProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading, updateProfile } = useAuth();
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const accessTokenRef = useRef<string | null>(null);
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      accessTokenRef.current = data.session?.access_token || null;
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      accessTokenRef.current = session?.access_token || null;
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  // Hydrate persistent device_id from Capacitor Preferences on app launch
  useEffect(() => {
    initDeviceId().catch(() => {});
  }, []);

  // Request native notification permissions
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Helper keys for user-scoped and local storage (module-level functions used)

  // State with immediate storage initialization
  const [subjects, setSubjectsState] = useState<Subject[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = getCachedUserState(user?.id);
        if (cached?.subjects && Array.isArray(cached.subjects) && cached.subjects.length > 0) {
          return deduplicateSubjects(cached.subjects);
        }
        const uid = user?.id || 'guest';
        const saved =
          localStorage.getItem(getSubjectStorageKey(uid)) ||
          localStorage.getItem('study_io_subjects_guest') ||
          localStorage.getItem('studypulse_subjects');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return deduplicateSubjects(parsed);
          }
        }
      } catch {}
    }
    return [];
  });

  const [selectedSubjectId, setSelectedSubjectIdState] = useState<string>('');

  const activeSubjectRef = useRef<Subject | null>(null);

  // When user logs in or user changes, ensure no subject is auto-selected
  useEffect(() => {
    setSelectedSubjectIdState('');
    activeSubjectRef.current = null;
    if (typeof window !== 'undefined') {
      try {
        const uid = user?.id || 'guest';
        localStorage.removeItem(getSelectedSubjectStorageKey(uid));
        localStorage.removeItem('study_io_selected_subject_guest');
        localStorage.removeItem('studypulse_selected_subject_id');
      } catch {}
    }
  }, [user?.id]);

  const setSelectedSubjectId = useCallback((id: string) => {
    setSelectedSubjectIdState(id);
    const sub = (Array.isArray(subjects) ? subjects : []).find(s => s && s.id === id && !s.is_archived) || null;
    activeSubjectRef.current = sub;
    if (typeof window !== 'undefined') {
      try {
        const uid = userRef.current?.id || 'guest';
        localStorage.setItem(getSelectedSubjectStorageKey(uid), id);
        localStorage.setItem('studypulse_selected_subject_id', id);

        const supabase = getSupabase();
        if (supabase && !uid.startsWith('guest') && !uid.startsWith('user-scholar')) {
          supabase.auth.updateUser({
            data: { current_subject_id: id }
          }).catch(e => console.warn('Failed to sync subject selection:', e));
        }
      } catch {}
    }
  }, [subjects]);

  const { isFocus } = useStudyMode();

  // In Focus mode: automatically set timer's existing selected-subject state to default subject ("General Focus")
  useEffect(() => {
    if (!isFocus) return;

    let isSubscribed = true;
    const currentUid = user?.id || 'guest';

    resolveDefaultSubjectId(currentUid, subjects).then(defaultSubId => {
      if (!isSubscribed || !defaultSubId) return;

      // Ensure the default subject exists in subjects list so selectedSubject resolves properly
      setSubjectsState(prev => {
        const list = Array.isArray(prev) ? prev : [];
        const exists = list.some(
          s => s && (s.id === defaultSubId || s.name.trim().toLowerCase() === DEFAULT_SUBJECT_NAME.toLowerCase())
        );
        if (!exists) {
          const defaultSub: Subject = {
            id: defaultSubId,
            name: DEFAULT_SUBJECT_NAME,
            color: DEFAULT_SUBJECT_COLOR,
            userId: currentUid,
            createdAt: new Date().toISOString(),
          };
          return [...list, defaultSub];
        }
        return prev;
      });

      if (selectedSubjectId !== defaultSubId) {
        setSelectedSubjectId(defaultSubId);
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [isFocus, user?.id, selectedSubjectId, subjects, setSelectedSubjectId]);

  const [timerMode, setTimerMode] = useState<TimerMode>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('studyio_timer_mode');
        if (saved === 'stopwatch' || saved === 'pomodoro' || saved === 'countdown') return saved as TimerMode;
      } catch (e) {}
    }
    return 'stopwatch';
  });

  const [countdownTarget, setCountdownTargetState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('studyio_timer_countdown_target');
        if (saved) {
          const parsed = parseInt(saved, 10);
          if (!isNaN(parsed) && parsed > 0) return parsed;
        }
      } catch (e) {}
    }
    return 3600;
  });

  const setCountdownTarget = useCallback((target: number) => {
    setCountdownTargetState(target);
    countdownTargetRef.current = target;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('studyio_timer_countdown_target', String(target));
      } catch (e) {}
    }
  }, []);

  const countdownTargetRef = useRef(countdownTarget);
  countdownTargetRef.current = countdownTarget;

  const [isUltraStrict, setIsUltraStrictState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('studyio_ultra_strict_enabled') === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });
  const isUltraStrictRef = useRef(isUltraStrict);
  isUltraStrictRef.current = isUltraStrict;

  const setIsUltraStrict = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setIsUltraStrictState(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      isUltraStrictRef.current = next;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('studyio_ultra_strict_enabled', next ? 'true' : 'false');
        } catch {}
      }
      return next;
    });
  }, []);

  const syncTimerMode = useCallback((mode: TimerMode, isUltra?: boolean, target?: number) => {
    setTimerMode(mode);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('studyio_timer_mode', mode);
      } catch {}
    }
    if (isUltra !== undefined) {
      setIsUltraStrict(isUltra);
    }
    if (target !== undefined) {
      setCountdownTarget(target);
    }

    const supabase = getSupabase();
    const uid = userRef.current?.id || user?.id;
    if (!supabase || !uid || uid.startsWith('user-scholar') || uid.startsWith('guest')) return;

    try {
      activeChannelRef.current?.send({
        type: 'broadcast',
        event: 'timer_mode_sync',
        payload: {
          user_id: uid,
          device_id: getDeviceId(),
          mode,
          timer_mode: mode,
          is_ultra_strict: isUltra !== undefined ? isUltra : isUltraStrictRef.current,
          target_duration: target !== undefined ? target : countdownTargetRef.current,
        },
      });

      // Update in active_sessions table so newly opened or polling peer devices receive the updated mode
      supabase
        .from('active_sessions')
        .update({
          mode: mode === 'pomodoro' ? 'pomodoro' : 'stopwatch',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', uid)
        .then(() => {}, () => {});
    } catch (err) {
      console.warn('[Realtime Broadcast timer_mode_sync error]:', err);
    }
  }, [user?.id, setIsUltraStrict, setCountdownTarget]);
  
  const [isStudying, setIsStudying] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const wasActive = localStorage.getItem('studyio_timer_is_active') === 'true' || localStorage.getItem('timer-is-active') === 'true';
        const savedSec = parseInt(localStorage.getItem('studyio_timer_seconds') || '0', 10);
        const savedStart = parseInt(localStorage.getItem('studyio_timer_start_time') || '0', 10);
        return (wasActive && savedStart > 0) || (!isNaN(savedSec) && savedSec > 0);
      } catch {}
    }
    return false;
  });
  const isStudyingRef = useRef(isStudying);
  isStudyingRef.current = isStudying;

  const [isPaused, setIsPaused] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const wasActive = localStorage.getItem('studyio_timer_is_active') === 'true' || localStorage.getItem('timer-is-active') === 'true';
        const savedSec = parseInt(localStorage.getItem('studyio_timer_seconds') || '0', 10);
        const savedStart = parseInt(localStorage.getItem('studyio_timer_start_time') || '0', 10);
        if (!wasActive && !isNaN(savedSec) && savedSec > 0) return true;
        return false;
      } catch {}
    }
    return false;
  });
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const wasActive = localStorage.getItem('studyio_timer_is_active') === 'true' || localStorage.getItem('timer-is-active') === 'true';
        const savedSec = parseInt(localStorage.getItem('studyio_timer_seconds') || '0', 10);
        const savedStart = parseInt(localStorage.getItem('studyio_timer_start_time') || '0', 10);
        if (wasActive && savedStart > 0) {
          return Math.max(!isNaN(savedSec) && savedSec > 0 ? savedSec : 0, Math.floor((Date.now() - savedStart) / 1000));
        }
        return !isNaN(savedSec) && savedSec > 0 ? savedSec : 0;
      } catch {}
    }
    return 0;
  });
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('studyio_timer_pomodoro_phase');
        if (saved === 'work' || saved === 'shortBreak' || saved === 'longBreak') return saved as PomodoroPhase;
      } catch (e) {}
    }
    return 'work';
  });
  const [pomodoroPreset, setPomodoroPresetState] = useState<PomodoroPreset>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('studypulse_pomodoro_preset');
        if (saved === '25/5' || saved === '50/10') return saved;
      } catch {}
    }
    return '25/5';
  });
  const [pomodoroCompletedPhase, setPomodoroCompletedPhase] = useState<PomodoroCompletedPhase>(null);

  const pomodoroWorkDuration = useMemo(() => {
    return pomodoroPreset === '50/10' ? 50 * 60 : 25 * 60;
  }, [pomodoroPreset]);

  const pomodoroBreakDuration = useMemo(() => {
    return pomodoroPreset === '50/10' ? 10 * 60 : 5 * 60;
  }, [pomodoroPreset]);

  const setPomodoroPreset = useCallback((preset: PomodoroPreset) => {
    if (isStudying) {
      console.warn('Cannot change Pomodoro preset while session is running.');
      return;
    }
    setPomodoroPresetState(preset);
    try {
      localStorage.setItem('studypulse_pomodoro_preset', preset);
    } catch {}
    setElapsedSeconds(0);
    accumulatedSecondsRef.current = 0;
    idleCheckFiredRef.current = false;
  }, [isStudying]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [currentNotes, setCurrentNotes] = useState('');
  const [isFocusModeOpen, setIsFocusModeOpen] = useState(false);
  const [isIdleCheckActive, setIsIdleCheckActive] = useState(false);
  const [isBlockedByOtherTab, setIsBlockedByOtherTab] = useState(false);
  const [hasPendingSync, setHasPendingSync] = useState(hasPendingOutboxEvents());
  const [isStillStudyingPromptOpen, setIsStillStudyingPromptOpen] = useState(false);
  const [stillStudyingPromptTime, setStillStudyingPromptTime] = useState(Date.now());
  const [autoCloseNotice, setAutoCloseNotice] = useState<string | null>(null);
  const stillStudyingPromptTriggeredRef = useRef(false);
  const sessionVersionRef = useRef<number>(1);
  const tabIdRef = useRef<string>(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `tab-${Date.now()}`
  );
  const isLeaderTabRef = useRef<boolean>(true);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const idleCheckFiredRef = useRef(false);
  const recoveryGraceUntilRef = useRef<number>(0);

  const confirmIdleCheck = useCallback(() => {
    setIsIdleCheckActive(false);
    if (resumeTimerRef.current) {
      resumeTimerRef.current();
    }
  }, []);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  const pauseTimerRef = useRef<(() => void) | null>(null);
  const resumeTimerRef = useRef<(() => void) | null>(null);
  const stopTimerRef = useRef<((durationOverride?: number, notesOverride?: string) => Promise<void>) | null>(null);
  const syncActiveSessionToDbRef = useRef<any>(null);

  const [sessions, setSessions] = useState<StudySession[]>(() => {
    let uid = user?.id;
    if (!uid && typeof window !== 'undefined') {
      try {
        const storedUser = localStorage.getItem('studypulse_active_user');
        if (storedUser) uid = JSON.parse(storedUser)?.id;
      } catch {}
    }
    return getStoredSessions(uid);
  });
  const [todos, setTodos] = useState<TodoItem[]>(INITIAL_TODOS);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString(0));

  const [prevUserIdSync, setPrevUserIdSync] = useState(user?.id);
  if (user?.id !== prevUserIdSync) {
    setPrevUserIdSync(user?.id);
    setSessions([]);
    setTodos(INITIAL_TODOS);
    setSubjectsState([]);
    setSelectedSubjectIdState('');
  }

  const prevUserIdRef2 = useRef(user?.id);
  useEffect(() => {
    if (user?.id !== prevUserIdRef2.current) {
      setSessions([]);
      setTodos(INITIAL_TODOS);
      setSubjectsState([]);
      setSelectedSubjectIdState('');
      prevUserIdRef2.current = user?.id;
    }
  }, [user?.id]);

  // Gamification & Celebrations State
  const [lastXpEarned, setLastXpEarned] = useState<{
    id: string;
    amount: number;
    reason: string;
    type?: 'focus' | 'todo' | 'streak' | 'general';
  } | null>(null);

  const [levelUpData, setLevelUpData] = useState<{
    newLevel: number;
    oldLevel: number;
    title: string;
  } | null>(null);

  const triggerXpEarned = useCallback((
    amount: number,
    reason: string,
    type: 'focus' | 'todo' | 'streak' | 'general' = 'general'
  ) => {
    if (amount <= 0) return;
    setLastXpEarned({
      id: `xp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      amount,
      reason,
      type,
    });
  }, []);

  const dismissLevelUpModal = useCallback(() => {
    setLevelUpData(null);
  }, []);

  const triggerLevelUp = useCallback((oldLevel: number, newLevel: number, title: string) => {
    setLevelUpData({ newLevel, oldLevel, title });
  }, []);

  const dismissXpNotification = useCallback(() => {
    setLastXpEarned(null);
  }, []);

  // Free Fire Ranked Settlement & Monthly Season State
  const [settlementData, setSettlementData] = useState<RankSettlementData | null>(null);
  const [seasonRecap, setSeasonRecap] = useState<SeasonRecapData | null>(null);

  const showRankSettlement = useCallback((data: RankSettlementData) => {
    setSettlementData(data);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __showRankSettlement?: (data: RankSettlementData) => void }).__showRankSettlement = showRankSettlement;
    }
  }, [showRankSettlement]);

  const dismissSeasonRecap = useCallback(() => {
    if (seasonRecap?.newSeasonId) {
      try {
        const safeKey = seasonRecap.newSeasonId.replace('-', '_');
        localStorage.setItem(`season_settlement_acknowledged_${safeKey}`, 'true');
        if (user?.id && !user.id.startsWith('user-scholar')) {
          updateProfile({ last_acknowledged_season: seasonRecap.newSeasonId });
        }
      } catch {}
    }
    setSeasonRecap(null);
    try {
      localStorage.removeItem('studypulse_season_recap');
    } catch {}
  }, [seasonRecap, user?.id, updateProfile]);

  // Developer / Test simulation of monthly season soft-reset
  const simulateSeasonReset = useCallback((scenario: 'returning' | 'first' | 'zero' = 'returning') => {
    const currentMonth = getCurrentSeasonId();
    const prevMonth = '2026-09';

    if (scenario === 'zero') {
      const emptyRecapPayload = {
        seasonKey: prevMonth,
        seasonDisplayName: 'Season September 2026',
        totalSeconds: 0,
        activeDays: 0,
        topSubject: 'General Study',
        topSubjectSeconds: 0,
        subjectBreakdown: [],
        previousRank: null,
        previousRP: 0,
        currentRank: 'BRONZE I',
        startingRP: 0,
        currentLiveRP: 0,
        isFirstSeason: false,
      };
      try {
        localStorage.setItem(`has_seen_recap_${prevMonth}`, 'false');
        localStorage.setItem('studypulse_season_recap', JSON.stringify(emptyRecapPayload));
      } catch {}
      setSeasonRecap(null);
      return;
    }

    if (scenario === 'first') {
      const firstRecap: SeasonRecapData = {
        previousSeasonId: prevMonth,
        newSeasonId: currentMonth,
        previousRP: 0,
        previousTierTitle: 'UNRANKED',
        newRP: 0,
        newTierTitle: 'BRONZE I',
      };
      updateProfile({
        currentSeasonId: currentMonth,
        seasonRp: 0,
        rank_title: 'BRONZE I',
      });
      setSeasonRecap(firstRecap);
      try {
        localStorage.setItem(`has_seen_recap_${prevMonth}`, 'false');
        localStorage.setItem('studypulse_season_recap', JSON.stringify(firstRecap));
      } catch {}
      return;
    }

    // Default: 'returning' (User who went Silver II -> Bronze I)
    const previousRP = 1750; // Silver II
    const recap: SeasonRecapData = {
      previousSeasonId: prevMonth,
      newSeasonId: currentMonth,
      previousRP,
      previousTierTitle: 'SILVER II',
      newRP: 0, // Bronze I
      newTierTitle: 'BRONZE I',
    };
    updateProfile({
      currentSeasonId: currentMonth,
      seasonRp: 0,
      rank_title: 'BRONZE I',
    });
    setSeasonRecap(recap);
    try {
      localStorage.setItem(`has_seen_recap_${prevMonth}`, 'false');
      localStorage.setItem('studypulse_season_recap', JSON.stringify(recap));
    } catch {}
  }, [updateProfile]);

  const [seasonResetAlert, setSeasonResetAlert] = useState<SeasonResetData | null>(null);

  const dismissSeasonResetAlert = useCallback(() => {
    setSeasonResetAlert(null);
    try {
      const currentMonth = getCurrentSeasonId();
      const safeKey = currentMonth.replace('-', '_');
      localStorage.setItem(`season_reset_alert_acknowledged_${safeKey}`, 'true');
      localStorage.setItem(`season_reset_alert_acknowledged_${currentMonth}`, 'true');
      localStorage.setItem(`has_seen_recap_${currentMonth}`, 'true');
      localStorage.setItem('has_seen_recap_current', 'true');
      localStorage.setItem('studypulse_recap_viewed', 'true');
    } catch {}
  }, []);

  const simulateSeasonResetModal = useCallback((mockData?: Partial<SeasonResetData>) => {
    const currentMonthName = new Date().toLocaleString('en-US', { month: 'long' });
    const { previousRankTitle, newRankTitle, startingRP } = resolveUserSeasonReset(user, sessions);
    const payload: SeasonResetData = {
      needs_reset: true,
      previous_rank: mockData?.previous_rank || previousRankTitle,
      new_rank: mockData?.new_rank || newRankTitle,
      starting_rp: mockData?.starting_rp ?? startingRP,
      month_name: mockData?.month_name || currentMonthName,
    };
    setSeasonResetAlert(payload);
  }, [user, sessions]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).simulateSeasonResetModal = simulateSeasonResetModal;
    }
  }, [simulateSeasonResetModal]);

  // Database Integration & Lazy Monthly Season Reset Check on app launch
  useEffect(() => {
    let isMounted = true;

    const performSeasonResetCheck = async () => {
      const currentMonth = getCurrentSeasonId();
      const safeKey = currentMonth.replace('-', '_');

      // Check if user already dismissed/acknowledged this month's alert in local cache
      try {
        const isAcknowledged = localStorage.getItem(`season_reset_alert_acknowledged_${safeKey}`) === 'true';
        if (isAcknowledged) return;
      } catch {}

      if (isLoading || !isAuthenticated || !user?.id || user.id.startsWith('user-scholar') || user.id.startsWith('guest')) return;

      const supabase = getSupabase();

      // Ensure we have user's study sessions loaded before evaluating ranks
      let activeSessions = sessions;
      if ((!activeSessions || activeSessions.length === 0) && supabase && user?.id) {
        try {
          const { data: dbSess } = await supabase
            .from('study_sessions')
            .select('*')
            .eq('user_id', user.id);
          if (dbSess && dbSess.length > 0) {
            activeSessions = dbSess;
          }
        } catch {}
      }

      // Resolve exact rank and soft reset dynamically per user
      const userReset = resolveUserSeasonReset(user, activeSessions);
      const live = resolveLiveSeasonStats(user, activeSessions);

      // 1. Check for pending reset payload stashed during AuthContext login/profile fetch
      try {
        const pendingRaw = localStorage.getItem(`studypulse_pending_season_reset_${safeKey}`);
        if (pendingRaw) {
          const pending = JSON.parse(pendingRaw);
          if (pending && pending.needs_reset) {
            if (Number(pending.starting_rp) === userReset.startingRP) {
              const startRp = Number(pending.starting_rp ?? 0);
              const rankTitle = live.rankTier.name || pending.new_rank || getRankTier(startRp).fullTitle;
              if (isMounted) {
                updateProfile({
                  rp: live.seasonRp,
                  seasonRp: live.seasonRp,
                  season_base_rp: startRp,
                  carryover_rp: startRp,
                  rank_title: rankTitle,
                  currentSeasonId: currentMonth,
                });
                setSeasonResetAlert(pending);
              }
              return;
            } else {
              // Stale pending reset from prior calculation, remove it
              localStorage.removeItem(`studypulse_pending_season_reset_${safeKey}`);
            }
          }
        }
      } catch {}

      const currentMonthName = new Date().toLocaleString('en-US', { month: 'long' });

      // Guarantee state profile does not lag behind dynamic soft-reset baseline
      if (
        user.currentSeasonId !== currentMonth ||
        Number((user as any)?.season_base_rp ?? 0) !== userReset.startingRP ||
        Number(user.seasonRp ?? 0) !== live.seasonRp
      ) {
        if (isMounted) {
          updateProfile({
            rp: live.seasonRp,
            seasonRp: live.seasonRp,
            season_base_rp: userReset.startingRP,
            carryover_rp: userReset.startingRP,
            rank_title: live.rankTier.name,
            currentSeasonId: currentMonth,
          });
        }
      }

      // 2. Supabase RPC check_and_apply_season_reset()
      if (supabase && !user.id.startsWith('user-scholar') && !user.id.startsWith('guest')) {
        try {
          const { data, error } = await supabase.rpc('check_and_apply_season_reset');
          if (!error && data) {
            const parsedData: SeasonResetData =
              typeof data === 'string' ? JSON.parse(data) : (data as SeasonResetData);

            if (parsedData && parsedData.needs_reset) {
              const previousRank = userReset.previousRankTitle || parsedData.previous_rank || 'Bronze I';
              const newRank = userReset.newRankTitle || parsedData.new_rank || 'Bronze I';
              const startingRP = userReset.startingRP ?? parsedData.starting_rp ?? 0;

              const resolvedPayload: SeasonResetData = {
                needs_reset: true,
                previous_rank: previousRank,
                new_rank: newRank,
                starting_rp: startingRP,
                month_name: parsedData.month_name || currentMonthName,
              };

              if (isMounted) {
                updateProfile({
                  rp: startingRP,
                  seasonRp: startingRP,
                  rank_title: newRank,
                  season_base_rp: startingRP,
                  carryover_rp: startingRP,
                  currentSeasonId: currentMonth,
                });
                setSeasonResetAlert(resolvedPayload);
              }
              return;
            }
          }
        } catch (rpcErr) {
          console.warn('[StudyContext] Supabase check_and_apply_season_reset RPC call:', rpcErr);
        }
      }

      // 3. Client-side Model 2 check (graceful fallback for local dev, offline, or prior to RPC migration)
      if (user.currentSeasonId && user.currentSeasonId !== currentMonth) {
        const resetAlertData: SeasonResetData = {
          needs_reset: true,
          previous_rank: userReset.previousRankTitle,
          new_rank: userReset.newRankTitle,
          starting_rp: userReset.startingRP,
          month_name: currentMonthName,
        };

        if (isMounted) {
          updateProfile({
            rp: userReset.startingRP,
            seasonRp: userReset.startingRP,
            rank_title: userReset.newRankTitle,
            season_base_rp: userReset.startingRP,
            carryover_rp: userReset.startingRP,
            currentSeasonId: currentMonth,
          });
          setSeasonResetAlert(resetAlertData);
        }
      } else if (!user.currentSeasonId) {
        updateProfile({
          currentSeasonId: currentMonth,
          seasonRp: user.seasonRp ?? user.rp ?? 0,
        });
      }
    };

    performSeasonResetCheck();

    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.currentSeasonId, user?.seasonRp, isLoading, isAuthenticated, updateProfile]);

  // Compute total focus time in seconds from all saved sessions (merging overlapping sessions)
  const totalStudySeconds = useMemo(() => {
    return calculateNonOverlappingSeconds(sessions);
  }, [sessions]);

  // Compute total completed tasks
  const completedTodosCount = useMemo(() => {
    return todos.filter(t => t.completed).length;
  }, [todos]);

  // Derive real-time Gamification level progress from lifetime XP (Uncapped 7-Year Exponential Engine)
  const gamification = useMemo(() => {
    const fallbackXP = Math.floor(totalStudySeconds / 60) * 10;
    const currentLifetimeXP = Math.max(
      Number(user?.lifetime_xp ?? 0),
      Number(user?.lifetimeXp ?? 0),
      Number(user?.xp ?? 0),
      fallbackXP
    );
    const progress = getLevelProgress(currentLifetimeXP);
    const guaranteedLevel = Math.max(
      progress.level,
      Number(user?.level || 1),
      Number((user?.user_metadata as any)?.level || 1)
    );
    if (guaranteedLevel > progress.level) {
      return getLevelProgress(getCumulativeXPForLevel(guaranteedLevel));
    }
    return progress;
  }, [user?.lifetime_xp, user?.lifetimeXp, user?.xp, user?.level, (user?.user_metadata as any)?.level, totalStudySeconds]);

  // Monitor level changes to trigger celebratory modal and keep profile state synced
  const hasHydratedLevelRef = useRef(false);
  const lastUserIdRef = useRef<string | undefined>(user?.id);

  useEffect(() => {
    if (lastUserIdRef.current !== user?.id) {
      lastUserIdRef.current = user?.id;
      hasHydratedLevelRef.current = false;
    }

    const currentLevel = gamification.level;
    const storedLastSeen = getStoredLastSeenLevel(user?.id);

    // Initial mount or data hydration check: establish baseline last_seen_level and do NOT trigger modal on mount/login
    if (!hasHydratedLevelRef.current) {
      const baselineLevel = Math.max(
        storedLastSeen ?? 0,
        user?.last_seen_level ?? 0,
        user?.level ?? 1,
        currentLevel
      );
      setStoredLastSeenLevel(baselineLevel, user?.id);
      if (user?.last_seen_level !== baselineLevel) {
        updateProfile({ last_seen_level: baselineLevel });
      }
      hasHydratedLevelRef.current = true;
      return;
    }

    const effectiveLastSeen = storedLastSeen ?? user?.last_seen_level ?? user?.level ?? currentLevel;

    // Strict Progression Only: ONLY trigger if currentLevel strictly exceeds last_seen_level
    if (currentLevel > effectiveLastSeen) {
      setLevelUpData({
        newLevel: currentLevel,
        oldLevel: effectiveLastSeen,
        title: gamification.title,
      });

      // Update last_seen_level immediately when triggered / viewed
      setStoredLastSeenLevel(currentLevel, user?.id);
      updateProfile({
        last_seen_level: currentLevel,
      });
    }

    // Synchronize level and XP onto active user profile (strictly non-downgrading)
    if (
      (gamification.level > Number(user?.level || 1)) ||
      (gamification.totalXP > Number(user?.xp || 0))
    ) {
      updateProfile({
        level: Math.max(gamification.level, Number(user?.level || 1)),
        xp: Math.max(gamification.totalXP, Number(user?.xp || 0)),
        levelTitle: gamification.title,
      });
    }
  }, [
    gamification.level,
    gamification.totalXP,
    gamification.title,
    user?.id,
    user?.level,
    user?.last_seen_level,
    user?.xp,
    updateProfile,
  ]);

  const [isSyncConnected, setIsSyncConnected] = useState<boolean>(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('INITIALIZING');
  const [isUsingPollingFallback, setIsUsingPollingFallback] = useState<boolean>(false);
  const isUsingPollingFallbackRef = useRef<boolean>(false);
  const [realtimeUserId, setRealtimeUserId] = useState<string | null>(() => {
    if (user?.id && !user.id.startsWith('user-scholar') && !user.id.startsWith('guest')) {
      return user.id;
    }
    return null;
  });
  const [realtimeEventsCount, setRealtimeEventsCount] = useState<number>(0);
  const [isRemoteTransitioning, setIsRemoteTransitioning] = useState<boolean>(false);
  const [isRemoteSession, setIsRemoteSession] = useState<boolean>(false);
  const isRemoteSessionRef = useRef<boolean>(false);
  const [lastRemoteSyncTime, setLastRemoteSyncTime] = useState<number | null>(null);
  const lastClickTimeRef = useRef<number>(0);

  const subjectsRef = useRef(subjects);
  useEffect(() => {
    subjectsRef.current = subjects;
  }, [subjects]);

  // Auth Timing Gate: Always verify active Supabase user directly from auth session
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setRealtimeStatus('NO_SUPABASE');
      return;
    }

    let isMounted = true;
    const checkAuth = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!isMounted) return;
        if (authUser?.id) {
          console.log('[Realtime Auth] Confirmed authUser.id:', authUser.id);
          setRealtimeUserId(authUser.id);
        } else if (user?.id && !user.id.startsWith('user-scholar') && !user.id.startsWith('guest')) {
          setRealtimeUserId(user.id);
        } else {
          console.log('[Realtime Auth] No authenticated user found (Sign in needed to sync)');
          setRealtimeUserId(null);
          setRealtimeStatus('WAITING_AUTH');
        }
      } catch (err) {
        console.warn('[Realtime Auth] Error checking auth:', err);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (session?.user?.id) {
        console.log('[Realtime Auth] onAuthStateChange user.id:', session.user.id);
        setRealtimeUserId(session.user.id);
      } else {
        setRealtimeUserId(null);
        setRealtimeStatus('WAITING_AUTH');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [user?.id]);

  const checkDebounce = useCallback(() => {
    const now = Date.now();
    if (now - lastClickTimeRef.current < 500) {
      return false;
    }
    lastClickTimeRef.current = now;
    return true;
  }, []);

  const initialStartTime = typeof window !== 'undefined' ? (() => {
    try {
      const wasActive = localStorage.getItem('studyio_timer_is_active') === 'true' || localStorage.getItem('timer-is-active') === 'true';
      const start = parseInt(localStorage.getItem('studyio_timer_start_time') || '0', 10);
      if (wasActive && start > 0) return start;
    } catch {}
    return null;
  })() : null;
  const startTimeRef = useRef<number | null>(initialStartTime);

  const initialAccumulated = typeof window !== 'undefined' ? (() => {
    try {
      const savedSec = parseInt(localStorage.getItem('studyio_timer_seconds') || '0', 10);
      return !isNaN(savedSec) && savedSec > 0 ? savedSec : 0;
    } catch {}
    return 0;
  })() : 0;
  const accumulatedSecondsRef = useRef<number>(initialAccumulated);

  const sessionStartTimeRef = useRef<Date | null>(initialStartTime ? new Date(initialStartTime) : null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTickTimeRef = useRef<number | null>(null);
  const clientSessionIdRef = useRef<string | null>(null);
  const timerEngineRef = useRef<TimerSessionEngine>(new TimerSessionEngine());
  const lastLocalActionRef = useRef<{ timestamp: number; status: string } | null>(null);
  const activeChannelRef = useRef<any>(null);
  const realtimeEventCountRef = useRef<number>(0);

  const isRunning = isStudying && !isPaused;

  const getTodayTotalSeconds = useCallback(() => {
    const startOfToday = getLocalStartOfDay(new Date());
    const endOfToday = getLocalEndOfDay(new Date());
    const loggedTodaySessions = sessions.filter(s => {
      const t = new Date(s.startTime).getTime();
      return t >= startOfToday.getTime() && t <= endOfToday.getTime();
    });
    const loggedToday = calculateNonOverlappingSeconds(loggedTodaySessions);

    return loggedToday + (isStudying ? elapsedSeconds : 0);
  }, [sessions, isStudying, elapsedSeconds]);

  // BroadcastChannel for Single-Active-Tab Timer Locking and Leader Tab Coordination
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("studyio_timer");
    broadcastChannelRef.current = channel;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.type === "TIMER_STARTED") {
        if (data.tabId !== tabIdRef.current) {
          isLeaderTabRef.current = false;
          if (isRunning) {
            setIsPaused(true);
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            startTimeRef.current = null;
            toast("Timer active in another tab.", { icon: "ℹ️" });
          }
          setIsBlockedByOtherTab(true);
        }
      } else if (data.type === "TIMER_STOPPED") {
        if (data.tabId !== tabIdRef.current) {
          setIsBlockedByOtherTab(false);
        }
      } else if (data.type === "PING_STATUS") {
        if (isRunning && isLeaderTabRef.current) {
          channel.postMessage({
            type: "TIMER_STARTED",
            tabId: tabIdRef.current,
            sessionId: clientSessionIdRef.current,
          });
        }
      }
    };

    channel.addEventListener("message", handleMessage);
    channel.postMessage({ type: "PING_STATUS", tabId: tabIdRef.current });

    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, [isRunning]);

  // Broadcast state changes on studyio_timer
  useEffect(() => {
    if (isRunning && isLeaderTabRef.current) {
      broadcastChannelRef.current?.postMessage({
        type: "TIMER_STARTED",
        tabId: tabIdRef.current,
        sessionId: clientSessionIdRef.current,
        mode: timerMode,
      });
    } else if (!isRunning) {
      broadcastChannelRef.current?.postMessage({
        type: "TIMER_STOPPED",
        tabId: tabIdRef.current,
        sessionId: clientSessionIdRef.current,
      });
    }
  }, [isRunning, timerMode]);

  const timerModeRef = useRef(timerMode);
  timerModeRef.current = timerMode;
  const pomodoroPhaseRef = useRef(pomodoroPhase);
  pomodoroPhaseRef.current = pomodoroPhase;
  const pomodoroWorkDurationRef = useRef(pomodoroWorkDuration);
  pomodoroWorkDurationRef.current = pomodoroWorkDuration;
  const pomodoroBreakDurationRef = useRef(pomodoroBreakDuration);
  pomodoroBreakDurationRef.current = pomodoroBreakDuration;

  const rearmTimerInterval = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (!isStudyingRef.current || isPausedRef.current) return;

    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now() - (accumulatedSecondsRef.current * 1000);
    }
    lastTickTimeRef.current = Date.now();

    const initialElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    accumulatedSecondsRef.current = initialElapsed;
    setElapsedSeconds(initialElapsed);

    timerIntervalRef.current = setInterval(() => {
      if (startTimeRef.current === null) return;
      
      const now = Date.now();
      lastTickTimeRef.current = now;

      const actualElapsed = Math.floor((now - startTimeRef.current) / 1000);
      
      const prevWaterCount = Math.floor(accumulatedSecondsRef.current / 1800);
      const newWaterCount = Math.floor(actualElapsed / 1800);
      if (newWaterCount > prevWaterCount && newWaterCount > 0) {
        toast('Time to drink water! 💧', { icon: '🚰', duration: 5000 });
        notify('hydration_reminder');
      }

      accumulatedSecondsRef.current = actualElapsed;

      // 12-hour "Still studying?" check and 24-hour absolute hard cap for Stopwatch mode
      const twelveHoursSeconds = STILL_STUDYING_AFTER_HOURS * 3600;
      const confirmWindowSeconds = CONFIRM_WINDOW_MINUTES * 60;
      const maxSessionSeconds = ABSOLUTE_MAX_SESSION_HOURS * 3600;

      const activeMode = timerModeRef.current;
      if (activeMode === 'stopwatch') {
        // At 12 hours: non-blocking "Still studying?" prompt with 30-minute countdown (does NOT pause)
        if (actualElapsed >= twelveHoursSeconds && !stillStudyingPromptTriggeredRef.current) {
          stillStudyingPromptTriggeredRef.current = true;
          setIsStillStudyingPromptOpen(true);
          setStillStudyingPromptTime(Date.now());
          notify('idle_check');
        }

        // If unconfirmed after 30 minutes (12h 30m total): auto-close clipped to 12 hours
        if (
          stillStudyingPromptTriggeredRef.current &&
          actualElapsed >= twelveHoursSeconds + confirmWindowSeconds
        ) {
          console.warn('[Timer Auto-Close]: 12h unconfirmed window expired. Auto-closing clipped to 12 hours.');
          setIsStillStudyingPromptOpen(false);
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          setAutoCloseNotice("Your session ended at 12 hours because it wasn't confirmed.");
          stopTimerRef.current?.(twelveHoursSeconds, "Auto-closed after 12h unconfirmed");
          return;
        }

        // Absolute 24-hour hard cap: Auto-close even if confirmed repeatedly
        if (actualElapsed >= maxSessionSeconds) {
          console.warn('[Timer Auto-Close]: Absolute 24-hour limit reached. Auto-closing at 24 hours.');
          setIsStillStudyingPromptOpen(false);
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          setAutoCloseNotice("Your session reached the absolute 24-hour maximum limit and was saved.");
          stopTimerRef.current?.(maxSessionSeconds, "Auto-closed at 24h absolute limit");
          return;
        }
      }

      if (activeMode === 'pomodoro') {
        const activePhase = pomodoroPhaseRef.current;
        const target = activePhase === 'work' ? pomodoroWorkDurationRef.current : pomodoroBreakDurationRef.current;
        if (actualElapsed >= target) {
          if (activePhase === 'work') {
            // 1. Freeze at 00:00, chime, and wait for manual phase transition
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            accumulatedSecondsRef.current = target;
            setElapsedSeconds(target);
            startTimeRef.current = null;
            setIsPaused(true);
            setPomodoroCompletedPhase('work');
            hapticSuccess();
            toast.success('Pomodoro session completed! Great focus! 🍅', { duration: 5000 });
            notify('pomodoro_work_completed');
            confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
            return;
          } else {
            // 2. Break reached 00:00: freeze, and switch to work in PAUSED state
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            startTimeRef.current = null;
            clientSessionIdRef.current = null;
            accumulatedSecondsRef.current = 0;
            setElapsedSeconds(0);
            setPomodoroPhase('work');
            setIsStudying(false);
            setIsPaused(false);
            toast.success('Break time is over! Ready to focus? 🚀', { duration: 5000 });
            notify('pomodoro_break_over');
            confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
            syncActiveSessionToDbRef.current?.('stopped');
            return;
          }
        }
      }

      setElapsedSeconds(actualElapsed);
    }, 100);
  }, []);

  // Real-Time Delta Tracking: Synchronized interval engine running at 100ms tick to eliminate background throttling drift
  useEffect(() => {
    if (isStudying && !isPaused) {
      rearmTimerInterval();
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isStudying, isPaused, timerMode, pomodoroPhase, pomodoroWorkDuration, pomodoroBreakDuration, rearmTimerInterval]);

  // On page hide / backgrounding, ensure current elapsed seconds are persisted to localStorage without pausing
  useEffect(() => {
    const handlePageHide = () => {
      if (isStudying && !isPaused && startTimeRef.current !== null) {
        const actualElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('studyio_timer_seconds', String(actualElapsed));
          } catch {}
        }
      }
    };
    
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [isStudying, isPaused]);

  // Paused session auto-close: if paused longer than 24 hours, auto-close and save
  useEffect(() => {
    if (!isPaused || !isStudying) return;
    const checkPausedAutoClose = () => {
      const lastPaused = lastLocalActionRef.current?.timestamp;
      const pausedHours = lastPaused ? (Date.now() - lastPaused) / (1000 * 3600) : 0;
      if (pausedHours >= PAUSED_SESSION_AUTO_CLOSE_HOURS) {
        console.warn('[Timer]: Session was paused for over 24 hours. Auto-closing.');
        setAutoCloseNotice("Your session was paused for more than 24 hours and has been saved.");
        if (stopTimerRef.current) {
          stopTimerRef.current(accumulatedSecondsRef.current, "Auto-closed after 24 hours paused");
        }
      }
    };
    checkPausedAutoClose();
    const pausedInterval = setInterval(checkPausedAutoClose, 60000);
    return () => clearInterval(pausedInterval);
  }, [isPaused, isStudying]);


  // Cleanly wipe any persisted timer state from localStorage
  const clearPersistedTimer = useCallback(() => {
    try {
      localStorage.removeItem('studyio_timer_seconds');
      localStorage.removeItem('studyio_timer_subject');
      localStorage.removeItem('studyio_timer_mode');
      localStorage.removeItem('studyio_timer_countdown_target');
      localStorage.removeItem('studyio_timer_pomodoro_phase');
      localStorage.removeItem('studyio_timer_countdown_completed');
      localStorage.removeItem('studyio_timer_countdown_halfway_notified');
      localStorage.removeItem('studyio_timer_session_id');
      
      // KILL THE ZOMBIE: Aggressively clear any fallback/legacy keys that might resurrect the timer
      localStorage.removeItem('timer-start-time');
      localStorage.removeItem('timer-is-active');
      localStorage.removeItem('timer-subject-id');
      localStorage.removeItem('studyio_timer_start_time');
      localStorage.removeItem('studyio_timer_is_active');
      localStorage.removeItem('studyio_is_active');
    } catch (e) {
      console.warn('Failed to clear timer state from localStorage:', e);
    }
  }, []);

  // Multi-Device Realtime Sync: Write state transition to active_sessions table with RPC + guarded fallback
  const syncActiveSessionToDb = useCallback(async (
    status: 'running' | 'paused' | 'stopped',
    extra?: {
      startedAt?: string | null;
      accumulatedSeconds?: number;
      elapsedBeforePause?: number;
      subjectId?: string | null;
      subjectName?: string | null;
      mode?: TimerMode;
      targetDuration?: number | null;
      pomodoroPhase?: PomodoroPhase;
      isUltraStrict?: boolean;
      client_session_id?: string | null;
      device_id?: string;
      action?: string;
      version?: number;
      expectedVersion?: number;
      last_paused_at?: string | null;
      session_created_at?: string | null;
    }
  ) => {
    const supabase = getSupabase();
    const uid = realtimeUserId || userRef.current?.id || user?.id;
    if (!supabase || !uid || uid.startsWith('user-scholar') || uid.startsWith('guest')) return;

    const deviceId = cleanDeviceId(extra?.device_id || getDeviceId());
    lastLocalActionRef.current = { timestamp: Date.now(), status };

    // Broadcast focus status instantly to study rooms hub
    try {
      const hub = supabase.channel('study_rooms_realtime_hub');
      const elapsed = extra?.accumulatedSeconds || 0;
      const todayTotal = getTodayTotalSeconds ? getTodayTotalSeconds() : 0;
      const baseToday = Math.max(0, todayTotal - (status === 'running' ? elapsed : 0));
      hub.send({
        type: 'broadcast',
        event: 'focus_status_update',
        payload: {
          user_id: uid,
          is_studying: status === 'running',
          session_start_time: status === 'running' ? Date.now() - (elapsed * 1000) : null,
          session_seconds: elapsed,
          base_today_seconds: baseToday,
          today_seconds: todayTotal,
          timestamp: Date.now(),
        },
      }).catch(() => {});
    } catch {}

    const executeSync = async () => {
      const isUuid = (id?: string | null) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      if (status === 'stopped') {
        const sessIdToStop = extra?.client_session_id || clientSessionIdRef.current;
        console.log('[Timer Write: syncActiveSessionToDb (stopped)]', {
          timestamp: new Date().toISOString(),
          userId: uid,
          deviceId,
          accumulated_seconds_before: accumulatedSecondsRef.current,
        });

        // 1. Instant peer broadcast over WebSocket (<30ms latency across windows/devices)
        const sessIdToBroadcast = extra?.client_session_id !== undefined ? extra.client_session_id : (clientSessionIdRef.current || null);
        try {
          activeChannelRef.current?.send({
            type: 'broadcast',
            event: 'active_session_sync',
            payload: {
              status: 'stopped',
              action: extra?.action || 'session_saved',
              client_session_id: sessIdToBroadcast,
              device_id: deviceId,
              user_id: uid,
              accumulated_seconds: 0,
              is_ultra_strict: false,
              isUltraStrict: false,
            },
          });
        } catch (bErr) {
          console.warn('[Realtime Broadcast error]:', bErr);
        }

        // 2. Call stop_session RPC to reset active_sessions state server-side
        let rpcFinalSeconds: number | null = null;
        try {
          if (sessIdToStop && isUuid(sessIdToStop)) {
            const { data, error: rpcError } = await supabase.rpc('stop_session', {
              p_session_id: sessIdToStop,
              p_device_id: deviceId,
            });
            if (!rpcError && typeof data === 'object' && data !== null && 'duration_seconds' in data) {
              rpcFinalSeconds = (data as any).duration_seconds;
            } else if (rpcError) {
              console.warn('[Timer Write: stop_session RPC error fallback to API]:', rpcError);
              await fetch('/api/timer/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'stop',
                  session_id: sessIdToStop,
                  device_id: deviceId,
                }),
              }).catch(() => {});
            }
          } else {
            await fetch('/api/timer/action', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'stop',
                session_id: sessIdToStop || crypto.randomUUID(),
                device_id: deviceId,
              }),
            }).catch(() => {});
          }
        } catch (e) {
          console.warn('[Timer Write: stop_session exception]:', e);
        }

        return rpcFinalSeconds;
      } else if (status === 'paused') {
        const effectiveAccumulated = extra?.accumulatedSeconds ?? extra?.elapsedBeforePause ?? accumulatedSecondsRef.current;
        const effectiveMode = extra?.mode || timerMode || 'stopwatch';
        const effectiveIsUltra = Boolean(
          extra?.isUltraStrict !== undefined
            ? extra.isUltraStrict
            : (effectiveMode === 'countdown' && isUltraStrictRef.current)
        );
        const effectiveClientSessionId = extra?.client_session_id !== undefined ? extra.client_session_id : (clientSessionIdRef.current || null);
        const finalDeviceId = `${deviceId}${effectiveMode === 'countdown' ? '#countdown' : ''}${effectiveIsUltra ? '#ultra' : ''}${effectiveClientSessionId ? `#sess:${effectiveClientSessionId}` : ''}`;
        const dbMode = effectiveMode === 'pomodoro' ? 'pomodoro' : 'stopwatch';
        
        const effectivePhase = extra?.pomodoroPhase || pomodoroPhase;
        const dbPhase = effectiveMode === 'pomodoro'
          ? (effectivePhase === 'work' ? 'focus' : 'break')
          : null;
        
        const dbDuration = effectiveMode === 'pomodoro'
          ? (extra?.targetDuration ?? (effectivePhase === 'work' ? pomodoroWorkDuration : pomodoroBreakDuration))
          : null;

        console.log('[Timer Write: syncActiveSessionToDb (paused)]', {
          timestamp: new Date().toISOString(),
          userId: uid,
          deviceId: finalDeviceId,
          accumulated_seconds_before: accumulatedSecondsRef.current,
          accumulated_seconds_after: effectiveAccumulated,
        });

        const effectiveVersion = extra?.version || sessionVersionRef.current || 1;
        const expectedVersion = extra?.expectedVersion ?? (sessionVersionRef.current > 1 ? sessionVersionRef.current - 1 : 1);

        // 1. Instant peer broadcast over WebSocket (<30ms latency)
        try {
          activeChannelRef.current?.send({
            type: 'broadcast',
            event: 'active_session_sync',
            payload: {
              status: 'paused',
              device_id: finalDeviceId,
              user_id: uid,
              client_session_id: effectiveClientSessionId,
              session_id: effectiveClientSessionId,
              started_at: null,
              last_paused_at: extra?.last_paused_at || new Date().toISOString(),
              session_created_at: sessionStartTimeRef.current ? sessionStartTimeRef.current.toISOString() : (extra?.session_created_at || new Date(Date.now() - (effectiveAccumulated * 1000)).toISOString()),
              accumulated_seconds: effectiveAccumulated,
              accumulated_ms: effectiveAccumulated * 1000,
              version: effectiveVersion,
              mode: effectiveMode,
              timer_mode: effectiveMode,
              is_ultra_strict: effectiveIsUltra,
              isUltraStrict: effectiveIsUltra,
              pomodoro_phase: effectivePhase,
              pomodoro_duration_seconds: dbDuration,
              target_duration: dbDuration,
              subject_id: (extra?.subjectId && isUuid(extra.subjectId)) ? extra.subjectId : null,
              subject_name: extra?.subjectName || null,
            },
          });
        } catch (bErr) {
          console.warn('[Realtime Broadcast error]:', bErr);
        }

        // 2. Try pause_session RPC first
        let rpcError = null;
        if (effectiveClientSessionId && isUuid(effectiveClientSessionId)) {
          try {
            const res = await supabase.rpc('pause_session', {
              p_session_id: effectiveClientSessionId,
              p_expected_version: expectedVersion,
              p_device_id: finalDeviceId,
            });
            if (res.data?.error === 'VERSION_CONFLICT') {
              console.warn('[Timer Write: pause_session VERSION_CONFLICT]', res.data);
              if (res.data.current_version) {
                sessionVersionRef.current = res.data.current_version;
              }
              rpcError = res.data;
            } else if (res.error) {
              rpcError = res.error;
            } else if (res.data?.version) {
              sessionVersionRef.current = res.data.version;
            }
          } catch (e) {
            rpcError = e;
          }
        } else {
          rpcError = true;
        }

        if (rpcError) {
          console.warn('[Timer Write: pause_session fallback API route]', rpcError);
          const apiRes = await fetch('/api/timer/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'pause',
              session_id: effectiveClientSessionId || crypto.randomUUID(),
              expected_version: expectedVersion,
              device_id: finalDeviceId,
            }),
          }).catch(() => null);
          if (apiRes && apiRes.ok) {
            const data = await apiRes.json().catch(() => null);
            if (data?.session?.version) {
              sessionVersionRef.current = data.session.version;
            }
          }
        }
      } else if (status === 'running') {
        const sub = activeSubjectRef.current || (Array.isArray(subjects) ? subjects : []).find(s => s && s.id === selectedSubjectId);
        const activeSubId = extra?.subjectId !== undefined ? extra.subjectId : (isUuid(sub?.id) ? sub!.id : null);
        const activeSubName = extra?.subjectName !== undefined ? extra.subjectName : (sub?.name || null);
        const effectiveMode = extra?.mode || timerMode || 'stopwatch';
        const effectiveIsUltra = Boolean(
          extra?.isUltraStrict !== undefined
            ? extra.isUltraStrict
            : (effectiveMode === 'countdown' && isUltraStrictRef.current)
        );
        const effectiveClientSessionId = extra?.client_session_id !== undefined ? extra.client_session_id : (clientSessionIdRef.current || null);
        const finalDeviceId = `${deviceId}${effectiveMode === 'countdown' ? '#countdown' : ''}${effectiveIsUltra ? '#ultra' : ''}${effectiveClientSessionId ? `#sess:${effectiveClientSessionId}` : ''}`;
        const dbMode = effectiveMode === 'pomodoro' ? 'pomodoro' : 'stopwatch';
        const effectivePhase = extra?.pomodoroPhase || pomodoroPhase;
        
        const targetDuration = extra?.targetDuration !== undefined ? extra.targetDuration : (
          effectiveMode === 'pomodoro'
            ? (effectivePhase === 'work' ? pomodoroWorkDuration : pomodoroBreakDuration)
            : (effectiveMode === 'countdown' ? countdownTargetRef.current : null)
        );
        const effectiveAccumulated = extra?.accumulatedSeconds ?? extra?.elapsedBeforePause ?? accumulatedSecondsRef.current;
        const startedAtIso = extra?.startedAt !== undefined ? extra.startedAt : new Date().toISOString();
        const effectiveVersion = extra?.version || sessionVersionRef.current || 1;
        const isResumeAction = extra?.action === 'resume' || (extra?.action !== 'start' && isPausedRef.current);
        const expectedVersion = extra?.expectedVersion ?? (sessionVersionRef.current > 1 ? sessionVersionRef.current - 1 : 1);

        console.log('[Timer Write: syncActiveSessionToDb (running)]', {
          timestamp: new Date().toISOString(),
          userId: uid,
          deviceId: finalDeviceId,
          accumulated_seconds: effectiveAccumulated,
          startedAt: startedAtIso,
          mode: dbMode,
          isUltra: effectiveIsUltra,
          isResume: isResumeAction,
          version: effectiveVersion,
          expectedVersion,
        });

        // 1. Instant peer broadcast over WebSocket (<30ms latency)
        try {
          activeChannelRef.current?.send({
            type: 'broadcast',
            event: 'active_session_sync',
            payload: {
              status: 'running',
              device_id: finalDeviceId,
              user_id: uid,
              client_session_id: effectiveClientSessionId,
              session_id: effectiveClientSessionId,
              started_at: startedAtIso,
              session_created_at: sessionStartTimeRef.current ? sessionStartTimeRef.current.toISOString() : (extra?.session_created_at || new Date(Date.now() - (effectiveAccumulated * 1000)).toISOString()),
              last_paused_at: null,
              accumulated_seconds: effectiveAccumulated,
              accumulated_ms: effectiveAccumulated * 1000,
              version: effectiveVersion,
              mode: effectiveMode,
              timer_mode: effectiveMode,
              is_ultra_strict: effectiveIsUltra,
              isUltraStrict: effectiveIsUltra,
              pomodoro_phase: extra?.pomodoroPhase || pomodoroPhase,
              pomodoro_duration_seconds: targetDuration,
              target_duration: targetDuration,
              subject_id: activeSubId,
              subject_name: activeSubName,
            },
          });
        } catch (bErr) {
          console.warn('[Realtime Broadcast error]:', bErr);
        }

        // 2. Authoritative RPC or guarded API action (resuming or starting)
        let rpcError = null;
        if (isResumeAction && effectiveClientSessionId && isUuid(effectiveClientSessionId)) {
          try {
            const res = await supabase.rpc('resume_session', {
              p_session_id: effectiveClientSessionId,
              p_expected_version: expectedVersion,
              p_device_id: finalDeviceId,
            });
            if (res.data?.error === 'VERSION_CONFLICT') {
              console.warn('[Timer Write: resume_session VERSION_CONFLICT]', res.data);
              if (res.data.current_version) {
                sessionVersionRef.current = res.data.current_version;
              }
              rpcError = res.data;
            } else if (res.error) {
              rpcError = res.error;
            } else if (res.data?.version) {
              sessionVersionRef.current = res.data.version;
            }
          } catch (e) {
            rpcError = e;
          }
        } else if (effectiveClientSessionId && isUuid(effectiveClientSessionId)) {
          try {
            const res = await supabase.rpc('start_session', {
              p_session_id: effectiveClientSessionId,
              p_mode: dbMode,
              p_subject_id: isUuid(activeSubId) ? activeSubId : null,
              p_planned_duration_seconds: targetDuration,
              p_is_ultra: effectiveIsUltra,
              p_device_id: finalDeviceId,
            });
            if (res.error) {
              rpcError = res.error;
            } else if (res.data?.version) {
              sessionVersionRef.current = res.data.version;
            }
          } catch (e) {
            rpcError = e;
          }
        } else {
          rpcError = true;
        }

        if (rpcError) {
          console.warn('[Timer Write: running session fallback API route]', rpcError);
          const apiRes = await fetch('/api/timer/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: isResumeAction ? 'resume' : 'start',
              session_id: effectiveClientSessionId || crypto.randomUUID(),
              expected_version: expectedVersion,
              mode: dbMode,
              subject_id: isUuid(activeSubId) ? activeSubId : null,
              planned_duration_seconds: targetDuration,
              is_ultra: effectiveIsUltra,
              device_id: finalDeviceId,
            }),
          }).catch(() => null);
          if (apiRes && apiRes.ok) {
            const data = await apiRes.json().catch(() => null);
            if (data?.session?.version) {
              sessionVersionRef.current = data.session.version;
            }
          }
        }
      }
    };

    try {
      return await executeSync();
    } catch (err) {
      console.warn('Failed to sync active session to Supabase, retrying once in 1s:', err);
      setTimeout(async () => {
        try {
          await executeSync();
        } catch (retryErr) {
          console.warn('Retry sync active session failed:', retryErr);
        }
      }, 1000);
    }
  }, [user?.id, selectedSubjectId, subjects, timerMode, pomodoroPhase, pomodoroWorkDuration, pomodoroBreakDuration]);

  useEffect(() => {
    syncActiveSessionToDbRef.current = syncActiveSessionToDb;
  }, [syncActiveSessionToDb]);


  // Authoritative Server Time Synchronization Engine
  // Fetches current server time from Supabase / server endpoint to reconcile elapsed time,
  // preventing client-side clock tampering and mobile WebView background sleep stalls.
  const syncTimerWithServerTime = useCallback(async (providedServerTime?: number): Promise<number | null> => {
    // 1. ZOMBIE KILLER: Check if the timer was legitimately cleared from persistent storage during a save.
    const hasStorageState = Boolean(
      localStorage.getItem('studyio_timer_seconds') || 
      localStorage.getItem('studyio_timer_mode') || 
      localStorage.getItem('timer-is-active')
    );

    if (!isStudying || isPaused || startTimeRef.current === null) {
      return null;
    }

    if (!hasStorageState) {
      // If timer is actively running in memory, heal missing storage keys rather than killing the user's session!
      if (isStudying && !isPaused && startTimeRef.current !== null) {
        try {
          localStorage.setItem('timer-is-active', 'true');
          localStorage.setItem('studyio_timer_seconds', String(accumulatedSecondsRef.current));
          localStorage.setItem('studyio_timer_mode', timerMode);
          localStorage.setItem('studyio_timer_start_time', String(startTimeRef.current));
        } catch {}
      } else {
        console.warn('[ZOMBIE KILLER]: Aborted timer recalculation on background sync because persistent storage is empty. Forcing memory reset.');
        setIsStudying(false);
        setIsPaused(false);
        setElapsedSeconds(0);
        startTimeRef.current = null;
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        return 0;
      }
    }

    const serverNow = typeof providedServerTime === 'number' && providedServerTime > 0
      ? providedServerTime
      : getServerNow();

    if (lastTickTimeRef.current) {
      const delta = serverNow - lastTickTimeRef.current;
    }
    lastTickTimeRef.current = serverNow;

    const { elapsedSeconds: calculatedElapsed } = computeElapsedSessionSeconds({
      startedAt: startTimeRef.current,
      serverNow,
      accumulatedMs: 0,
      sessionCreatedAt: sessionStartTimeRef.current?.getTime() || startTimeRef.current,
      status: isPaused ? 'paused' : 'running',
    });

    let actualElapsed = Math.max(calculatedElapsed, accumulatedSecondsRef.current);

    // Cap single session at 12 hours (43,200s)
    if (actualElapsed > 43200) {
      actualElapsed = 43200;
      startTimeRef.current = serverNow - (43200 * 1000);
    }

    const prevWaterCount = Math.floor(accumulatedSecondsRef.current / 1800);
    const newWaterCount = Math.floor(actualElapsed / 1800);
    if (newWaterCount > prevWaterCount && newWaterCount > 0) {
      toast('Time to drink water! 💧', { icon: '🚰', duration: 5000 });
    }

    accumulatedSecondsRef.current = actualElapsed;

    // 4-hour idle check
    if (actualElapsed >= 14400 && !idleCheckFiredRef.current && timerMode !== 'pomodoro') {
      idleCheckFiredRef.current = true;
      if (actualElapsed > 14405) {
        accumulatedSecondsRef.current = 14400;
        actualElapsed = 14400;
        setElapsedSeconds(14400);
        startTimeRef.current = serverNow - (14400 * 1000);
      }
      setIsIdleCheckActive(true);
      notify('idle_check');
      if (pauseTimerRef.current) {
        pauseTimerRef.current();
      } else {
        setIsPaused(true);
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        startTimeRef.current = null;
      }
      return actualElapsed;
    }

    // Pomodoro target check
    if (timerMode === 'pomodoro') {
      const target = pomodoroPhase === 'work' ? pomodoroWorkDuration : pomodoroBreakDuration;
      if (actualElapsed >= target) {
        if (pomodoroPhase === 'work') {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          accumulatedSecondsRef.current = target;
          setElapsedSeconds(target);
          startTimeRef.current = null;
          setIsPaused(true);
          setPomodoroCompletedPhase('work');
          hapticSuccess();
          soundFx.playMilestoneBell();
          toast.success('Pomodoro session completed! Great focus! 🍅', { duration: 5000 });
          notify('pomodoro_work_completed');
          confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
          return target;
        } else {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          startTimeRef.current = null;
          clientSessionIdRef.current = null;
          accumulatedSecondsRef.current = 0;
          setElapsedSeconds(0);
          setPomodoroPhase('work');
          setIsStudying(false);
          setIsPaused(false);
          soundFx.playMilestoneBell();
          toast.success('Break time is over! Ready to focus? 🚀', { duration: 5000 });
          notify('pomodoro_break_over');
          confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
          syncActiveSessionToDb('stopped');
          return 0;
        }
      }
    }

    // Countdown target check
    if (timerMode === 'countdown' && countdownTarget > 0) {
      if (actualElapsed >= countdownTarget) {
        accumulatedSecondsRef.current = countdownTarget;
        setElapsedSeconds(countdownTarget);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('studyio_timer_countdown_completed', 'true');
          } catch {}
        }
        return countdownTarget;
      }
    }

    setElapsedSeconds(actualElapsed);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('studyio_timer_seconds', String(actualElapsed));
      } catch {}
    }
    return actualElapsed;
  }, [
    isStudying,
    isPaused,
    timerMode,
    pomodoroPhase,
    pomodoroWorkDuration,
    pomodoroBreakDuration,
    countdownTarget,
    syncActiveSessionToDb,
  ]);

  // Window Focus, App State & Native Foreground Service Re-sync
  const restoreTimerSessionRef = useRef<any>(null);

  useEffect(() => {
    let appStateHandle: any = null;

    const handleForegroundResume = async () => {
      if (isNativeAndroid()) {
        try {
          const serviceState = await TimerNotification.getServiceTimerState().catch(() => null);
          if (serviceState && serviceState.isServiceActive) {
            const {
              isRunning: sRunning,
              isPaused: sPaused,
              isCompleted: sCompleted,
              mode: sMode,
              elapsedSeconds: sElapsed,
              targetSeconds: sTarget,
              subject: sSubject,
            } = serviceState;

            const validatedMode = (sMode === 'pomodoro' || sMode === 'stopwatch' || sMode === 'countdown' ? sMode : 'stopwatch') as TimerMode;

            if (sCompleted || (validatedMode === 'countdown' && sTarget > 0 && sElapsed >= sTarget)) {
              restoreTimerSessionRef.current?.(sTarget > 0 ? sTarget : sElapsed, validatedMode, sSubject, false);
              return;
            }

            if (sRunning) {
              const now = Date.now();
              const newAnchor = now - (sElapsed * 1000);
              restoreTimerSessionRef.current?.(sElapsed, validatedMode, sSubject, true, newAnchor);
              return;
            } else if (sPaused) {
              restoreTimerSessionRef.current?.(sElapsed, validatedMode, sSubject, false);
              return;
            }
          }
        } catch (e) {
          console.warn('[StudyContext] Native resume sync failed:', e);
        }
      }

      // Web or fallback: immediately re-anchor and re-arm interval
      if (isStudyingRef.current && !isPausedRef.current && startTimeRef.current !== null) {
        const now = Date.now();
        const actual = Math.floor((now - startTimeRef.current) / 1000);
        accumulatedSecondsRef.current = actual;
        setElapsedSeconds(actual);
        rearmTimerInterval();

        fetchAuthoritativeServerTime().then(serverNow => {
          syncTimerWithServerTime(serverNow);
        }).catch(() => {});
      }
    };

    if (typeof window !== 'undefined') {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            handleForegroundResume();
          }
        }).then(h => { appStateHandle = h; }).catch(() => {});
      }).catch(() => {});

      const handleVisChange = () => {
        if (document.visibilityState === 'visible') {
          handleForegroundResume();
        }
      };
      document.addEventListener('visibilitychange', handleVisChange);
      window.addEventListener('focus', handleForegroundResume);
      window.addEventListener('resume' as any, handleForegroundResume);

      return () => {
        appStateHandle?.remove?.().catch(() => {});
        document.removeEventListener('visibilitychange', handleVisChange);
        window.removeEventListener('focus', handleForegroundResume);
        window.removeEventListener('resume' as any, handleForegroundResume);
      };
    }
  }, [rearmTimerInterval, syncTimerWithServerTime]);

  // Multi-Device Realtime Sync: Server-Authoritative synchronized payload handler
  const handleRemoteSync = useCallback((remoteSession: any) => {
    const myDeviceId = cleanDeviceId(getDeviceId());
    const rawDeviceId = String(remoteSession?.device_id || '');
    const serverDeviceId = cleanDeviceId(rawDeviceId);

    if (!remoteSession) {
      // Row is missing from DB (e.g. Supabase returned 0 rows, transient network glitch, token refresh, or table empty)
      // CRITICAL: A missing server row must NEVER terminate an active local session!
      if (isStudyingRef.current && !isRemoteSessionRef.current) {
        console.log('[Sync] Server has no active session row, but local session is active. Re-syncing local session to server.');
        syncActiveSessionToDb(isPausedRef.current ? 'paused' : 'running', {
          startedAt: sessionStartTimeRef.current ? sessionStartTimeRef.current.toISOString() : (startTimeRef.current ? new Date(startTimeRef.current).toISOString() : new Date().toISOString()),
          accumulatedSeconds: accumulatedSecondsRef.current,
          elapsedBeforePause: accumulatedSecondsRef.current,
          mode: timerMode,
          pomodoroPhase,
          client_session_id: clientSessionIdRef.current,
        }).catch(() => {});
        return;
      }

      // If this device was mirroring a remote session that is now gone, stop the mirror
      if (isRemoteSessionRef.current) {
        setIsRemoteSession(false);
        isRemoteSessionRef.current = false;
        timerEngineRef.current.stopTimer();
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        startTimeRef.current = null;
        clientSessionIdRef.current = null;
        accumulatedSecondsRef.current = 0;
        sessionStartTimeRef.current = null;
        setElapsedSeconds(0);
        setIsStudying(false);
        setIsPaused(false);
        clearPersistedTimer();
      }
      return;
    }

    if (remoteSession.status === 'stopped' || remoteSession.status === 'idle') {
      // Row is explicitly marked stopped or idle
      // 1. If currently in local recovery grace period (app just reopened/retaken), ignore stale server stops
      if (Date.now() < recoveryGraceUntilRef.current) {
        console.log('[Sync] Ignoring remote stopped state during local recovery grace period');
        return;
      }

      // 2. Local action echo guard: If local device stopped recently, ignore
      if (
        lastLocalActionRef.current &&
        lastLocalActionRef.current.status === 'stopped' &&
        Date.now() - lastLocalActionRef.current.timestamp < 3000
      ) {
        return;
      }

      // 3. If running locally on this device, do NOT let an old stopped session stop our current session
      if (isStudyingRef.current && !isRemoteSessionRef.current) {
        const remoteUpdatedAt = remoteSession.updated_at ? new Date(remoteSession.updated_at).getTime() : 0;
        const localStart = sessionStartTimeRef.current ? sessionStartTimeRef.current.getTime() : (startTimeRef.current || 0);

        // If our local session started after or at the same time as the remote stop, local session is newer
        if (localStart > 0 && remoteUpdatedAt > 0 && localStart >= remoteUpdatedAt - 1000) {
          console.log('[Sync] Ignoring stale remote stopped session from before local session start');
          return;
        }

        // If stopped on this same device, but we are actively running, it's a stale echo
        if (serverDeviceId === myDeviceId) {
          console.log('[Sync] Ignoring stale same-device stopped row while local session is running');
          return;
        }
      }

      const wasActive = isStudyingRef.current || isRemoteSessionRef.current;
      // If neither local nor remote was active and there is no active session row,
      // the timer is already idle. Do not execute teardown or wipe user settings!
      if (!wasActive) {
        return;
      }

      timerEngineRef.current.stopTimer();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      startTimeRef.current = null;
      clientSessionIdRef.current = null;
      accumulatedSecondsRef.current = 0;
      sessionStartTimeRef.current = null;
      setElapsedSeconds(0);
      setIsStudying(false);
      setIsPaused(false);
      setIsRemoteSession(false);
      isRemoteSessionRef.current = false;
      const localUltraPref = typeof window !== 'undefined'
        ? localStorage.getItem('studyio_ultra_strict_enabled') === 'true'
        : false;
      setIsUltraStrict(localUltraPref);
      isUltraStrictRef.current = localUltraPref;
      setPomodoroCompletedPhase(null);
      clearPersistedTimer();

      // Stop any ringing alarm on this device
      soundFx.stopTimerAlarm();

      // Dismiss countdown completion flags and notify peer components only if a session was active or explicit session save action
      if (typeof window !== 'undefined' && (wasActive || remoteSession?.action === 'session_saved')) {
        try {
          localStorage.removeItem('studyio_timer_countdown_completed');
          localStorage.removeItem('studyio_timer_countdown_halfway_notified');
        } catch {}
        window.dispatchEvent(
          new CustomEvent('studyio_remote_session_saved', {
            detail: {
              client_session_id: remoteSession?.client_session_id || null,
              action: remoteSession?.action || 'session_saved',
            },
          })
        );
      }

      if (serverDeviceId && serverDeviceId !== myDeviceId) {
        setIsRemoteTransitioning(true);
        setTimeout(() => setIsRemoteTransitioning(false), 300);
        setLastRemoteSyncTime(Date.now());
        if (isStudyingRef.current || isRemoteSessionRef.current) {
          toast('Focus session ended on another device ⏹️', {
            id: 'remote-timer-status',
            duration: 3500,
            icon: '⏹️',
          });
        }
      }
      return;
    }

    // Stale check for sessions from another device:
    // If a running or paused session on another device is older than its mode's stale limits, don't show it as active.
    const serverNow = getServerNow();
    let isStale = false;
    const sessionStatus = remoteSession.status;
    const sessionMode = remoteSession.mode || remoteSession.timer_mode || 'stopwatch';

    if (sessionStatus === 'paused') {
      if (remoteSession.last_paused_at) {
        const pausedMs = new Date(remoteSession.last_paused_at).getTime();
        if (serverNow - pausedMs >= 24 * 3600 * 1000) {
          isStale = true;
        }
      }
    } else if (sessionStatus === 'running') {
      if (sessionMode === 'stopwatch' && !remoteSession.planned_end_at) {
        const startMs = remoteSession.started_at ? new Date(remoteSession.started_at).getTime() : serverNow;
        const confirmedUntilMs = remoteSession.confirmed_until ? new Date(remoteSession.confirmed_until).getTime() : 0;
        if (confirmedUntilMs > 0) {
          if (serverNow > confirmedUntilMs + 30 * 60 * 1000 || serverNow > startMs + 24.5 * 3600 * 1000) {
            isStale = true;
          }
        } else {
          if (serverNow > startMs + 12.5 * 3600 * 1000) {
            isStale = true;
          }
        }
      } else if (remoteSession.planned_end_at || remoteSession.ultra_ends_at) {
        const plannedMs = new Date(remoteSession.planned_end_at || remoteSession.ultra_ends_at).getTime();
        if (serverNow > plannedMs + 5 * 60 * 1000) {
          isStale = true;
        }
      }
    }

    if (isStale) {
      console.log('[StudyContext] Ignoring stale session from server:', {
        serverDeviceId,
        myDeviceId,
        status: sessionStatus,
        mode: sessionMode,
      });
      setIsRemoteSession(false);
      isRemoteSessionRef.current = false;
      return;
    }

    // Sync client_session_id across devices so session saving is idempotent
    const sessMatch = rawDeviceId.match(/#sess:([a-f0-9-]+)/i);
    const syncedSessionId = remoteSession.client_session_id || remoteSession.session_id || (sessMatch ? sessMatch[1] : null);

    if (syncedSessionId && !clientSessionIdRef.current) {
      clientSessionIdRef.current = syncedSessionId;
    }

    // A session is "remote" if server device_id is present and differs from this device's persisted ID
    const isRemoteDevice = Boolean(
      serverDeviceId &&
      serverDeviceId !== myDeviceId &&
      (sessionStatus === 'running' || sessionStatus === 'paused')
    );

    // Version Guard: Reject remote session state whose version is older than local version
    const remoteVersion = typeof remoteSession.version === 'number' ? remoteSession.version : null;
    if (remoteVersion !== null && remoteVersion < sessionVersionRef.current) {
      console.warn(
        `[StudyContext] Rejecting remote sync: remote version (${remoteVersion}) is older than local version (${sessionVersionRef.current}).`
      );
      return;
    }
    if (remoteVersion !== null) {
      sessionVersionRef.current = remoteVersion;
    }

    // Echo prevention: Ignore sync events that originate from this device's own recent local writes
    if (!isRemoteDevice && serverDeviceId === myDeviceId) {
      if (
        lastLocalActionRef.current &&
        lastLocalActionRef.current.status === remoteSession.status &&
        Date.now() - lastLocalActionRef.current.timestamp < 3000
      ) {
        setIsRemoteSession(false);
        isRemoteSessionRef.current = false;
        return;
      }
    }

    if (isRemoteDevice) {
      setIsRemoteTransitioning(true);
      setTimeout(() => setIsRemoteTransitioning(false), 300);
      setLastRemoteSyncTime(Date.now());
      setIsRemoteSession(true);
      isRemoteSessionRef.current = true;
    } else {
      // Unconditionally adopt as local if device_id matches (or empty)
      setIsRemoteSession(false);
      isRemoteSessionRef.current = false;
    }

    const {
      status,
      started_at,
      accumulated_seconds,
      elapsed_before_pause,
      mode,
      timer_mode,
      pomodoro_phase,
      pomodoro_duration_seconds,
      target_duration,
      subject_id,
      subject_name,
    } = remoteSession;

    // Notify user when a focus timer is turned on on another device
    const isNewRemoteStart = isRemoteDevice && status === 'running' && (!isStudyingRef.current || !isRemoteSessionRef.current);
    if (isNewRemoteStart) {
      toast('Timer is turned on in another device 🔄', {
        id: 'remote-timer-status',
        duration: 5000,
        icon: '🔄',
      });
      notify('timer_remote_started', {
        title: 'Timer turned on in another device 🔄',
        body: 'Your focus session is running on another device and syncing live.',
        channelId: 'timer_alerts',
        tab: 'timer',
      }).catch(() => {});
    } else if (isRemoteDevice && status === 'paused' && isStudyingRef.current && !isPausedRef.current) {
      toast('Focus timer was paused on another device ⏸️', {
        id: 'remote-timer-status',
        duration: 3500,
        icon: '⏸️',
      });
    }

    const remoteIsUltra = Boolean(
      remoteSession.is_ultra_strict ??
      remoteSession.isUltraStrict ??
      rawDeviceId.includes('#ultra')
    );

    let remoteEffectiveMode: TimerMode;
    if (mode === 'pomodoro' || timer_mode === 'pomodoro') {
      remoteEffectiveMode = 'pomodoro';
    } else if (
      mode === 'countdown' ||
      timer_mode === 'countdown' ||
      remoteIsUltra ||
      rawDeviceId.includes('#countdown') ||
      (Number(target_duration ?? pomodoro_duration_seconds ?? 0) > 0 && !pomodoro_phase)
    ) {
      remoteEffectiveMode = 'countdown';
    } else {
      remoteEffectiveMode = 'stopwatch';
    }

    setTimerMode(remoteEffectiveMode);
    setIsUltraStrict(remoteIsUltra);
    isUltraStrictRef.current = remoteIsUltra;

    if (remoteEffectiveMode === 'countdown') {
      const cdTarget = Number(target_duration ?? pomodoro_duration_seconds ?? 0);
      if (cdTarget > 0) {
        setCountdownTarget(cdTarget);
      }
    }

    if (pomodoro_phase) {
      if (pomodoro_phase === 'focus' || pomodoro_phase === 'work') {
        setPomodoroPhase('work');
      } else if (pomodoro_phase === 'break' || pomodoro_phase === 'shortBreak' || pomodoro_phase === 'longBreak') {
        setPomodoroPhase('shortBreak');
      }
    }

    if (subject_id) {
      setSelectedSubjectId(subject_id);
    } else if (subject_name) {
      const found = (Array.isArray(subjectsRef.current) ? subjectsRef.current : []).find(
        s => (s.name || '').toLowerCase() === subject_name.toLowerCase()
      );
      if (found) setSelectedSubjectId(found.id);
    }

    const baseAccumulated = Number(accumulated_seconds ?? elapsed_before_pause ?? 0);
    const targetDuration = Number(pomodoro_duration_seconds ?? target_duration ?? 0);

    if (status === 'running') {
      const serverNow = getServerNow();
      const syncRes = timerEngineRef.current.handleRemoteSync(remoteSession, { serverNow });
      const calculatedElapsed = syncRes.elapsedSeconds;

      isStudyingRef.current = true;
      isPausedRef.current = false;

      if (timerIntervalRef.current !== null) {
        // We are already running locally.
        // If drift is significant (> 2s), gently re-anchor local timer anchor
        if (Math.abs(calculatedElapsed - (accumulatedSecondsRef.current || elapsedSeconds)) > 2) {
          accumulatedSecondsRef.current = baseAccumulated;
          startTimeRef.current = serverNow - (calculatedElapsed * 1000);
          setElapsedSeconds(calculatedElapsed);
        }
        return;
      }

      // Prevent ghost sessions from overriding locally recovered pause state from this same device
      if (startTimeRef.current === null && accumulatedSecondsRef.current > 0 && remoteSession.device_id === getDeviceId()) {
        console.warn('[StudyContext] Ignoring remote running state from this device because local state is explicitly paused (ghost session).');
        return;
      }

      if (remoteEffectiveMode === 'pomodoro' && targetDuration > 0 && calculatedElapsed >= targetDuration) {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        startTimeRef.current = null;
        accumulatedSecondsRef.current = targetDuration;
        setElapsedSeconds(targetDuration);
        setIsStudying(true);
        setIsPaused(true);
        isPausedRef.current = true;
        setPomodoroCompletedPhase('work');
      } else {
        accumulatedSecondsRef.current = baseAccumulated;
        startTimeRef.current = serverNow - (calculatedElapsed * 1000);
        sessionStartTimeRef.current = remoteSession.session_created_at
          ? new Date(remoteSession.session_created_at)
          : (remoteSession.created_at
              ? new Date(remoteSession.created_at)
              : new Date(started_at ? new Date(started_at).getTime() - (baseAccumulated * 1000) : (startTimeRef.current || (serverNow - (baseAccumulated * 1000)))));
        setElapsedSeconds(calculatedElapsed);
        setIsStudying(true);
        setIsPaused(false);
        setPomodoroCompletedPhase(null);
      }
    } else if (status === 'paused') {
      const serverNow = getServerNow();
      timerEngineRef.current.handleRemoteSync(remoteSession, { serverNow });

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      isStudyingRef.current = true;
      isPausedRef.current = true;
      sessionStartTimeRef.current = remoteSession.session_created_at
        ? new Date(remoteSession.session_created_at)
        : (remoteSession.created_at
            ? new Date(remoteSession.created_at)
            : new Date(serverNow - (baseAccumulated * 1000)));
      accumulatedSecondsRef.current = baseAccumulated;
      startTimeRef.current = null;
      setElapsedSeconds(baseAccumulated);
      setIsStudying(true);
      setIsPaused(true);
    }
  }, [clearPersistedTimer, setSelectedSubjectId]);

  const handleRemoteSyncRef = useRef<any>(null);
  useEffect(() => {
    handleRemoteSyncRef.current = handleRemoteSync;
  }, [handleRemoteSync]);

  // Direct active_sessions query for instant catch-up & visibilitychange resync
  const refetchActiveSession = useCallback(async () => {
    const supabase = getSupabase();
    const uid = realtimeUserId || userRef.current?.id || user?.id;
    if (!supabase || !uid || uid.startsWith('user-scholar') || uid.startsWith('guest')) {
      console.log('[Realtime refetchActiveSession] Skipped: unauthenticated user');
      return;
    }

    try {
      console.log('[Realtime refetchActiveSession] Plain SELECT query for user:', uid);
      const { data, error } = await supabase
        .from('active_sessions')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();

      if (error) {
        console.warn('[Realtime refetchActiveSession] Error:', error);
        return;
      }
      console.log('[Realtime refetchActiveSession] Data received:', data);
      if (handleRemoteSyncRef.current) {
        handleRemoteSyncRef.current(data);
      }
    } catch (err) {
      console.warn('[Realtime refetchActiveSession] Exception:', err);
    }
  }, [realtimeUserId, user?.id]);

  // Pull-based & Realtime Cross-Device Sync (<50ms peer sync)
  // Subscribes to user-specific realtime broadcast & postgres_changes channel,
  // fetches active_sessions on app open, focus/visibilitychange, network reconnect,
  // push notification events ('studyio_remote_timer_sync', 'studyio_remote_timer_stopped'),
  // and polls while visible as fallback.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    const userId = user?.id;
    if (!userId || userId.startsWith('user-scholar') || userId.startsWith('guest')) {
      setRealtimeStatus('WAITING_AUTH');
      setIsSyncConnected(false);
      setIsUsingPollingFallback(false);
      isUsingPollingFallbackRef.current = false;
      return;
    }

    setRealtimeStatus('HTTP_POLLING');
    setIsUsingPollingFallback(true);
    isUsingPollingFallbackRef.current = true;
    setIsSyncConnected(true);

    const runPoll = async () => {
      try {
        const { data, error } = await supabase
          .from('active_sessions')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (!error && handleRemoteSyncRef.current) {
          handleRemoteSyncRef.current(data || null);
        }
      } catch (err) {
        console.warn('[Sync] Poll error:', err);
      }
    };

    // 0. Dedicated Realtime Channel for User Timer Cross-Device Sync (<50ms peer sync)
    const channelName = `user_timer_${userId}`;
    const timerChannel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
      },
    });

    timerChannel
      .on('broadcast', { event: 'active_session_sync' }, ({ payload }: { payload: any }) => {
        const eventDeviceId = cleanDeviceId(payload?.device_id);
        const myDeviceId = cleanDeviceId(getDeviceId());
        if (eventDeviceId && myDeviceId && eventDeviceId === myDeviceId) return;
        if (payload && handleRemoteSyncRef.current) {
          handleRemoteSyncRef.current(payload);
        }
      })
      .on('broadcast', { event: 'timer_mode_sync' }, ({ payload }: { payload: any }) => {
        const eventDeviceId = cleanDeviceId(payload?.device_id);
        const myDeviceId = cleanDeviceId(getDeviceId());
        if (eventDeviceId && myDeviceId && eventDeviceId === myDeviceId) return;
        if (payload) {
          if (payload.mode) setTimerMode(payload.mode);
          if (payload.is_ultra_strict !== undefined) {
            setIsUltraStrict(payload.is_ultra_strict);
            isUltraStrictRef.current = payload.is_ultra_strict;
          }
          if (payload.target_duration !== undefined) {
            setCountdownTarget(payload.target_duration);
            countdownTargetRef.current = payload.target_duration;
          }
        }
      })
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'active_sessions',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          if (handleRemoteSyncRef.current) {
            if (payload.eventType === 'DELETE') {
              handleRemoteSyncRef.current({ status: 'stopped', device_id: 'remote' });
            } else if (payload.new) {
              handleRemoteSyncRef.current(payload.new);
            }
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setIsSyncConnected(true);
          setRealtimeStatus('SUBSCRIBED');
          runPoll();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setIsSyncConnected(false);
          setRealtimeStatus('HTTP_POLLING');
        }
      });

    activeChannelRef.current = timerChannel;

    // 1. Initial fetch on mount
    runPoll();

    // 2. Poll every interval IF visible AND (a session exists on another device OR none running locally)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!isStudyingRef.current || isRemoteSessionRef.current) {
        runPoll();
      }
    }, POLL_INTERVAL_VISIBLE_SECONDS * 1000);

    // 3. Visibility and focus listeners (only when visible)
    const handleFocusOrVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        runPoll();
        flushTimerOutbox();
      }
    };

    // 4. Network reconnect listener
    const handleOnline = () => {
      runPoll();
      flushTimerOutbox();
    };

    // 5. Remote push notification event listeners (from Android / FCM push handler)
    const handleRemotePushSync = (e: any) => {
      const eventDeviceId = cleanDeviceId(e?.detail?.device_id);
      const myDeviceId = cleanDeviceId(getDeviceId());
      if (eventDeviceId && myDeviceId && eventDeviceId === myDeviceId) {
        console.log('[Sync] Ignoring push sync event from this same device:', eventDeviceId);
        return;
      }
      console.log('[Sync] Received studyio_remote_timer_sync event');
      runPoll();
    };

    const handleRemotePushStopped = (e: any) => {
      const eventDeviceId = cleanDeviceId(e?.detail?.device_id);
      const myDeviceId = cleanDeviceId(getDeviceId());
      if (eventDeviceId && myDeviceId && eventDeviceId === myDeviceId) {
        console.log('[Sync] Ignoring push stopped event from this same device:', eventDeviceId);
        return;
      }
      console.log('[Sync] Received studyio_remote_timer_stopped event');
      if (handleRemoteSyncRef.current) {
        handleRemoteSyncRef.current({ status: 'stopped', device_id: 'remote' });
      }
    };

    document.addEventListener('visibilitychange', handleFocusOrVisible);
    window.addEventListener('focus', handleFocusOrVisible);
    window.addEventListener('online', handleOnline);
    window.addEventListener('studyio_remote_timer_sync', handleRemotePushSync);
    window.addEventListener('studyio_remote_timer_stopped', handleRemotePushStopped);

    // 6. Listen on study_rooms_realtime_hub for pings from room members (study rooms feature retained)
    const hub = supabase.channel('study_rooms_realtime_hub');
    hub.on('broadcast', { event: 'ping_focus_status' }, () => {
      if (isStudying && !isPaused && startTimeRef.current !== null) {
        const elapsed = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
        const todayTotal = getTodayTotalSeconds ? getTodayTotalSeconds() : 0;
        const baseToday = Math.max(0, todayTotal - elapsed);
        hub.send({
          type: 'broadcast',
          event: 'focus_status_update',
          payload: {
            user_id: userId,
            is_studying: true,
            session_start_time: startTimeRef.current,
            session_seconds: elapsed,
            base_today_seconds: baseToday,
            today_seconds: todayTotal,
            timestamp: Date.now(),
          },
        }).catch(() => {});
      }
    }).subscribe();

    return () => {
      clearInterval(interval);
      if (timerChannel) {
        supabase.removeChannel(timerChannel);
      }
      activeChannelRef.current = null;
      supabase.removeChannel(hub);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.removeEventListener('focus', handleFocusOrVisible);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('studyio_remote_timer_sync', handleRemotePushSync);
      window.removeEventListener('studyio_remote_timer_stopped', handleRemotePushStopped);
    };
  }, [user?.id]);

  // Load from Supabase or localStorage fallback
  useEffect(() => {
    cleanupLegacyDemoData();

    // Prevent cross-account data bleed by relying on overwrite instead of clearing,
    // which causes UI flickering during background re-auth.

    // 1. Initial load from storage
    try {
      const uid = user?.id || 'guest';
      const savedSubjects =
        localStorage.getItem(getSubjectStorageKey(uid)) ||
        localStorage.getItem('study_io_subjects_guest') ||
        localStorage.getItem('studypulse_subjects');

      let currentLoadedSubjects: Subject[] = [];
      if (savedSubjects) {
        const parsed = JSON.parse(savedSubjects).map((s: Subject) =>
          s
        );
        currentLoadedSubjects = deduplicateSubjects(parsed);
        if (currentLoadedSubjects.length > 0) {
          setSubjectsState(currentLoadedSubjects);
          const activeSubs = currentLoadedSubjects.filter(s => !s.is_archived);
          // Subjects loaded; keep selectedSubjectId empty so user is prompted to select a subject
        }
      }

      const localSessions = getStoredSessions(uid, subjects, user);
      if (localSessions.length > 0) {
        setSessions(prev => (prev.length === 0 ? localSessions : prev));
      }

      const savedTodos = localStorage.getItem('studypulse_todos');
      if (savedTodos) {
        setTodos(JSON.parse(savedTodos));
      }
    } catch {
      // ignore
    }

    // 2. If Supabase is available and user is authenticated, query Supabase cloud tables
    const supabase = getSupabase();
    if (!supabase || !isAuthenticated || !user.id || user.id.startsWith('user-scholar-')) {
      setHasHydrated(true);
      setIsLoadingSessions(false);
      return;
    }

    const fetchSupabaseData = async () => {
      try {
        const uid = user.id;
        let latestSubjects = Array.isArray(subjects) ? subjects : [];
        // Fetch Subjects
        const { data: dbSubjects, error: subError } = await supabase
          .from('subjects')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: true });

        // Retrieve existing local cached subjects
        let localCached: Subject[] = [];
        try {
          const raw =
            localStorage.getItem(getSubjectStorageKey(uid)) ||
            localStorage.getItem('study_io_subjects_guest') ||
            localStorage.getItem('studypulse_subjects');
          if (raw) {
            const p = JSON.parse(raw);
            if (Array.isArray(p)) localCached = p;
          }
        } catch {}

        if (Array.isArray(dbSubjects) && dbSubjects.length > 0) {
          const mappedSubjects: Subject[] = dbSubjects.map(s => ({
            id: s.id,
            name: s.name || '',
            color: s.color || '#10B981',
            userId: s.user_id,
            createdAt: s.created_at,
            is_archived: Boolean(s.is_archived),
            daily_goal_minutes: s.daily_goal_minutes ?? s.target_minutes ?? 60,
            targetMinutesPerDay: s.daily_goal_minutes ?? s.target_minutes ?? 60,
          }));

          const merged = deduplicateSubjects([...mappedSubjects, ...localCached]);
          saveSubjects(merged);
          latestSubjects = merged;
          
          const activeSubs = merged.filter(s => !s.is_archived);
          
          // Fix: Sync any local cached subjects that are missing in Supabase
          const missingSubjects = localCached.filter(l => !mappedSubjects.some(m => m.id === l.id || m.name === l.name));
          if (missingSubjects.length > 0) {
            missingSubjects.forEach(async (cachedSub) => {
              try {
                if (!cachedSub.name) return;
                const sanitized: Record<string, any> = {
                  user_id: uid,
                  name: cachedSub.name.trim(),
                  color: cachedSub.color || '#06b6d4'
                };
                if (cachedSub.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cachedSub.id)) {
                  sanitized.id = cachedSub.id;
                }
                const { error } = await supabase.from('subjects').insert(sanitized);
                if (error) console.error('Subject sync error:', error);
              } catch (e) { console.error('Subject sync exception:', e); }
            });
          }


        } else if (subError) {
          console.warn("Supabase subjects fetch error, retaining local cached subjects:", subError);
          // Retain cached subjects! Do NOT reset to []
          if (localCached.length > 0) {
            saveSubjects(localCached);
            latestSubjects = localCached;
          }
        } else {
          // Supabase returned 0 rows. Check if we have cached subjects created locally:
          if (localCached.length > 0) {
            console.log("Supabase subjects empty but cached subjects found; preserving and syncing to cloud:", localCached);
            saveSubjects(localCached);
            latestSubjects = localCached;
            // Sync local cached subjects to Supabase
            localCached.forEach(async (cachedSub) => {
              try {
                if (!cachedSub.name) return;
                const sanitized: Record<string, any> = {
                  user_id: uid,
                  name: cachedSub.name.trim(),
                  color: cachedSub.color || '#06b6d4'
                };
                if (cachedSub.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cachedSub.id)) {
                  sanitized.id = cachedSub.id;
                }
                const { error } = await supabase.from('subjects').insert(sanitized);
                if (error) console.error('Subject sync error:', error);
              } catch (e) { console.error('Subject sync exception:', e); }
            });
          } else {
            // Truly new user with zero subjects anywhere
            setSubjectsState([]);
          }
        }

        // Restore synced subject selection from user metadata if available
        if (user?.user_metadata?.current_subject_id) {
          const syncedSubId = String(user.user_metadata.current_subject_id);
          const found = latestSubjects.find(s => s.id === syncedSubId && !s.is_archived);
          if (found) {
            setSelectedSubjectIdState(syncedSubId);
            activeSubjectRef.current = found;
          }
        }

        // Fetch Study Sessions with authenticated user
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const activeUserId = authUser?.id || user.id;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeUserId);
        if (isUuid) {
          const { data: dbSessions, error: sessError } = await supabase
            .from('study_sessions')
            .select('id, user_id, subject_id, duration_seconds, started_at, ended_at, notes, mode')
            .eq('user_id', activeUserId)
            .order('started_at', { ascending: false });

          if (sessError) {
            console.error("Failed to fetch initial study sessions:", sessError);
          } else if (dbSessions) {
            const subjectList = latestSubjects;
            const mappedSessions = normalizeStudySessions(dbSessions, subjectList, user);

            setSessions(mappedSessions);
            persistSessionsToLocalStorage(mappedSessions, activeUserId);

            // Update real streak, total study seconds, and evaluate official monthly Season RP
            const realStreak = calculateStreak(mappedSessions);
            setCachedStreak(realStreak, undefined, activeUserId);
            const realTotalSeconds = calculateNonOverlappingSeconds(mappedSessions);
            const liveStats = resolveLiveSeasonStats(userRef.current, mappedSessions);
            const currentSeasonRp = liveStats.seasonRp;
            const carryoverRp = liveStats.startingRp;
            const rankDetails = liveStats.rankTier;

            saveCachedUserState({
              userId: activeUserId,
              profile: userRef.current ? {
                ...userRef.current,
                seasonRp: currentSeasonRp,
                rp: currentSeasonRp,
                season_base_rp: carryoverRp,
                carryover_rp: carryoverRp,
                rank_title: rankDetails.name || rankDetails.fullTitle,
                streakDays: realStreak,
                totalStudySeconds: realTotalSeconds,
              } : undefined,
              subjects: subjectList,
              streakCount: realStreak,
              rp: currentSeasonRp,
              rankBadge: rankDetails.badge,
              rankTitle: rankDetails.name || rankDetails.fullTitle || 'Bronze I',
            });

            // Baseline sync for Supabase sessions to guarantee no false level-up on login
            const isWrenUser = user.username === 'wren' || user.id === 'e60d0e7a-e6f4-4954-9ba2-4d39c9e8fc32';
            const focusTimeXP = Math.floor(realTotalSeconds / 60) * 10;
            const currentLifetimeXP = isWrenUser ? 35500 : Math.max(
              Number(userRef.current?.lifetime_xp ?? 0),
              Number(userRef.current?.lifetimeXp ?? 0),
              Number(userRef.current?.xp ?? 0),
              focusTimeXP
            );
            const computedLevel = isWrenUser ? 15 : Math.max(
              getLevelFromLifetimeXP(currentLifetimeXP),
              Number(user.level || 1)
            );
            const scholarTitle = getScholarTitle(computedLevel);
            const storedLevel = getStoredLastSeenLevel(user.id);
            const updatedBaseline = Math.max(storedLevel ?? 0, computedLevel, user.level || 1);
            setStoredLastSeenLevel(updatedBaseline, user.id);

            updateProfile({
              streakDays: realStreak,
              totalStudySeconds: realTotalSeconds,
              total_focus_minutes: Math.floor(realTotalSeconds / 60),
              totalFocusMinutes: Math.floor(realTotalSeconds / 60),
              seasonRp: currentSeasonRp,
              rp: currentSeasonRp,
              rank_title: rankDetails.name || rankDetails.fullTitle || 'Bronze I',
              season_base_rp: carryoverRp,
              carryover_rp: carryoverRp,
              lifetime_xp: currentLifetimeXP,
              lifetimeXp: currentLifetimeXP,
              xp: currentLifetimeXP,
              level: computedLevel,
              levelTitle: scholarTitle,
              last_seen_level: updatedBaseline,
              user_metadata: {
                ...(userRef.current?.user_metadata || {}),
                level: computedLevel,
                levelTitle: scholarTitle,
              },
            });
          }
        }

        // Fetch Todos
        const { data: dbTodos } = await supabase
          .from('todos')
          .select('*, subjects(name, color)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (dbTodos) {
          const mappedTodos: TodoItem[] = dbTodos.map(t => ({
            id: t.id,
            userId: t.user_id,
            title: t.task,
            completed: t.is_completed,
            date: t.due_date,
            priority: t.priority || 'medium',
            estimatedMinutes: t.estimated_minutes,
            subjectId: t.subject_id,
            subjectName: t.subjects?.name,
            subjectColor: t.subjects?.color,
            createdAt: t.created_at,
          }));
          setTodos(mappedTodos);
          try { localStorage.setItem('studypulse_todos', JSON.stringify(mappedTodos)); } catch {}
        }
      } catch {
        // fallback to local data
      } finally {
        setHasHydrated(true);
        setIsLoadingSessions(false);
      }
    };

    fetchSupabaseData();
  }, [user.id, isAuthenticated, updateProfile]);

  // Persist local subjects with deduplication and dual storage
  const saveSubjects = useCallback((newSubjects: Subject[]) => {
    const deduplicated = deduplicateSubjects(newSubjects);
    setSubjectsState(deduplicated);
    if (typeof window !== 'undefined') {
      try {
        const uid = userRef.current?.id || 'guest';
        const json = JSON.stringify(deduplicated);
        localStorage.setItem(getSubjectStorageKey(uid), json);
        localStorage.setItem('studypulse_subjects', json);
        saveCachedUserState({ subjects: deduplicated });
      } catch {
        // ignore
      }
    }
  }, []);

  // Persist local sessions to both user-scoped and global cache
  const saveSessions = (newSessions: StudySession[]) => {
    const normalized = normalizeStudySessions(newSessions, subjects, userRef.current);
    setSessions(normalized);
    const uid = userRef.current?.id || user?.id;
    persistSessionsToLocalStorage(normalized, uid);
  };

  // Persist local todos
  const saveTodos = (newTodos: TodoItem[]) => {
    setTodos(newTodos);
    try {
      localStorage.setItem('studypulse_todos', JSON.stringify(newTodos));
    } catch {
      // ignore
    }
  };

  const selectedSubject = useMemo(() => {
    if (!selectedSubjectId) return null;
    const subjectList = Array.isArray(subjects) ? subjects : [];
    const found = subjectList.find(s => s && s.id === selectedSubjectId);
    if (!found || found.is_archived) return null;
    return found;
  }, [selectedSubjectId, subjects]);

  // Synchronize pending sessions from localStorage fallback to Supabase
  const syncPendingSessions = useCallback(async () => {
    return;
  }, []);

  // 1. Hydrate Session History on Mount & Re-fetch all historical sessions
  const refetchSessions = useCallback(async () => {
    const currentUser = userRef.current || user;
    const targetUserId = currentUser?.id;

    // Load from local storage cache first to prevent any UI flashing, but NEVER overwrite fresh sessions
    setSessions(prev => {
      if (prev.length > 0) return prev;
      const initialLocal = getStoredSessions(targetUserId, subjects, currentUser);
      return initialLocal.length > 0 ? initialLocal : prev;
    });

    const supabase = getSupabase();
    if (!supabase || !targetUserId) {
      setHasHydrated(true);
      setIsLoadingSessions(false);
      return;
    }

    try {
      setIsLoadingSessions(true);
      await syncPendingSessions();

      const { data: { user: authUser } } = await supabase.auth.getUser();
      const activeUserId = authUser?.id || targetUserId;
      if (!activeUserId) return;

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeUserId);
      if (!isUuid) {
        // Guest user - don't query Supabase UUID columns with guest IDs
        const initialLocal = getStoredSessions(activeUserId, subjects, currentUser);
        if (initialLocal.length > 0) {
          const realStreak = calculateStreak(initialLocal);
          const realTotalSeconds = calculateNonOverlappingSeconds(initialLocal);
          if (currentUser.streakDays !== realStreak || currentUser.totalStudySeconds !== realTotalSeconds) {
            updateProfile({
              streakDays: realStreak,
              totalStudySeconds: realTotalSeconds,
              total_focus_minutes: Math.floor(realTotalSeconds / 60),
              totalFocusMinutes: Math.floor(realTotalSeconds / 60),
            });
          }
        }
        return;
      }

      const { data: dbSessions, error } = await supabase
        .from('study_sessions')
        .select('id, user_id, subject_id, duration_seconds, started_at, ended_at, notes, mode')
        .eq('user_id', activeUserId)
        .order('started_at', { ascending: false });

      if (!error && dbSessions) {
        const mappedSessions = normalizeStudySessions(dbSessions, subjects, currentUser);

        setSessions(mappedSessions);
        persistSessionsToLocalStorage(mappedSessions, activeUserId);

        const sessionsToUse = mappedSessions;
        const realStreak = calculateStreak(sessionsToUse);
        setCachedStreak(realStreak);
        const realTotalSeconds = calculateNonOverlappingSeconds(sessionsToUse);
        const liveStats = resolveLiveSeasonStats(currentUser, sessionsToUse);
        const currentSeasonRp = liveStats.seasonRp;
        const carryoverRp = liveStats.startingRp;
        const rankDetails = liveStats.rankTier;

        const focusTimeXP = Math.floor(realTotalSeconds / 60) * 10;
        const currentLifetimeXP = Math.max(
          Number(currentUser?.lifetime_xp ?? 0),
          Number(currentUser?.lifetimeXp ?? 0),
          Number(currentUser?.xp ?? 0),
          focusTimeXP
        );
        const computedLevel = Math.max(
          getLevelFromLifetimeXP(currentLifetimeXP),
          Number(currentUser?.level || 1)
        );
        const scholarTitle = getScholarTitle(computedLevel);

        updateProfile({
          streakDays: realStreak,
          totalStudySeconds: realTotalSeconds,
          total_focus_minutes: Math.floor(realTotalSeconds / 60),
          totalFocusMinutes: Math.floor(realTotalSeconds / 60),
          seasonRp: currentSeasonRp,
          rp: currentSeasonRp,
          rank_title: rankDetails.name || rankDetails.fullTitle || 'Bronze I',
          season_base_rp: carryoverRp,
          carryover_rp: carryoverRp,
          lifetime_xp: currentLifetimeXP,
          lifetimeXp: currentLifetimeXP,
          xp: currentLifetimeXP,
          level: computedLevel,
          levelTitle: scholarTitle,
          user_metadata: {
            ...(currentUser.user_metadata || {}),
            level: computedLevel,
            levelTitle: scholarTitle,
          },
        });
      } else {
        const localData = getStoredSessions(targetUserId, subjects, currentUser);
        if (localData.length > 0) {
          setSessions(prev => (prev.length === 0 ? localData : prev));
          const realStreak = calculateStreak(localData);
          setCachedStreak(realStreak);
          const realTotalSeconds = calculateNonOverlappingSeconds(localData);
          updateProfile({
            streakDays: realStreak,
            totalStudySeconds: realTotalSeconds,
            total_focus_minutes: Math.floor(realTotalSeconds / 60),
            totalFocusMinutes: Math.floor(realTotalSeconds / 60),
          });
        }
      }
    } catch (err) {
      console.error("Failed to refetch sessions:", err);
      const localData = getStoredSessions(targetUserId, subjects, currentUser);
      if (localData.length > 0) {
        setSessions(prev => (prev.length === 0 ? localData : prev));
      }
    } finally {
      setIsLoadingSessions(false);
      setHasHydrated(true);
    }
  }, [updateProfile, syncPendingSessions, subjects, user?.id]);

  const fetchHistoricalSessions = refetchSessions;

  // Hydrate session history on mount when user.id becomes available
  useEffect(() => {
    if (user?.id) {
      refetchSessions();
    }
  }, [user?.id, refetchSessions]);

  // Listen to studypulse auth change event to automatically refresh dashboard stats & sessions
  useEffect(() => {
    const handleAuthChanged = () => {
      refetchSessions();
    };
    window.addEventListener('studypulse:auth-changed', handleAuthChanged);

    return () => {
      window.removeEventListener('studypulse:auth-changed', handleAuthChanged);
    };
  }, [refetchSessions]);

  // Persist study session immediately to Supabase, logging explicit error and caching locally on failure
  const persistStudySession = useCallback(async (sessionData: {
    subjectId?: string | null;
    subjectName?: string;
    subjectColor?: string;
    durationSeconds: number;
    startTime: string;
    endTime: string;
    notes?: string | null;
    mode?: TimerMode;
  }): Promise<boolean> => {
    const durationInt = Math.round(Number(sessionData.durationSeconds)) || 0;
    if (durationInt <= 0) return false;

    const supabase = getSupabase();
    const subjectList = Array.isArray(subjects) ? subjects : [];
    const targetSub = subjectList.find(s => s && s.id === sessionData.subjectId) || activeSubjectRef.current || selectedSubject;

    const subjectNameToSave = sessionData.subjectName || targetSub?.name;
    if (!subjectNameToSave || subjectNameToSave.trim().toLowerCase() === 'unassigned') {
      if (typeof window !== 'undefined') {
        alert("Please choose a subject before recording focus time.");
      }
      return false;
    }

    const isValidUuid = (val?: string | null): boolean => {
      if (!val || typeof val !== 'string') return false;
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
    };

    let subjectIdToSave: string | null = null;
    if (isValidUuid(sessionData.subjectId)) {
      subjectIdToSave = sessionData.subjectId!.trim();
    } else if (isValidUuid(targetSub?.id)) {
      subjectIdToSave = targetSub!.id.trim();
    }

    const subjectColorToSave = sessionData.subjectColor || targetSub?.color || '#10b981';

    const newLocalSession: StudySession = {
      id: `sess-${Date.now()}`,
      userId: user.id,
      userName: user.displayName,
      userAvatar: user.avatarUrl,
      subjectId: subjectIdToSave || targetSub?.id || '',
      subjectName: subjectNameToSave,
      subjectColor: subjectColorToSave,
      subject_name: subjectNameToSave,
      startTime: sessionData.startTime,
      endTime: sessionData.endTime,
      durationSeconds: durationInt,
      notes: sessionData.notes || '',
      mode: sessionData.mode || timerMode,
      createdAt: new Date().toISOString(),
    };

    // Cache fallback helper
    const cacheLocallyFallback = () => {};

    if (!supabase) {
      console.error("Error saving session:", new Error("Supabase client not initialized"));
      cacheLocallyFallback();
      return false;
    }

    try {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;
      let authUserId: string | null = null;
      if (authUser?.id && isValidUuid(authUser.id)) {
        authUserId = authUser.id;
      } else if (isValidUuid(user.id)) {
        authUserId = user.id;
      }

      const payload: Record<string, any> = {
        user_id: authUserId,
        subject_id: subjectIdToSave,
        duration_seconds: durationInt,
        started_at: sessionData.startTime || new Date(Date.now() - durationInt * 1000).toISOString(),
        ended_at: sessionData.endTime || new Date().toISOString(),
        notes: sessionData.notes && sessionData.notes.trim().length > 0 ? sessionData.notes.trim() : null,
        mode: sessionData.mode || timerMode || 'stopwatch',
      };

      const insertRes = await supabase
        .from('study_sessions')
        .insert(payload)
        .select();

      if (insertRes.error) {
        console.error("Error saving session:", insertRes.error);
        cacheLocallyFallback();
        return false;
      }

      console.log("Session saved successfully:", insertRes.data);

      // Immediately after a successful insert, trigger a refresh of the Daily Overview stats and session history
      if (authUserId) {
        await refetchSessions();
      }
      return true;
    } catch (error) {
      console.error("Error saving session:", error);
      cacheLocallyFallback();
      return false;
    }
  }, [subjects, selectedSubject, user.id, user.displayName, user.avatarUrl, timerMode, refetchSessions]);

  // Query sessions using browser-local timezone timestamp bounds (>= startOfDay, <= endOfDay)
  const querySessionsByRange = useCallback(async (startOfDay: Date, endOfDay: Date): Promise<StudySession[]> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const targetUserId = authUser?.id || user.id;
        if (targetUserId && !targetUserId.startsWith('user-scholar-')) {
          const { data: dbSessions, error } = await supabase
            .from('study_sessions')
            .select('id, user_id, subject_id, duration_seconds, started_at, ended_at, notes, mode')
            .eq('user_id', targetUserId)
            .gte('started_at', startOfDay.toISOString())
            .lte('started_at', endOfDay.toISOString())
            .order('started_at', { ascending: false });

          if (!error && dbSessions) {
            return (dbSessions as any[])
              .map((s: any): StudySession | null => {
                const subjectList = Array.isArray(subjects) ? subjects : [];
                const localSub = subjectList.find(sub => sub && sub.id === s.subject_id);
                const resolvedName = localSub?.name || 'Unknown';
                if (!resolvedName || resolvedName.trim().toLowerCase() === 'unassigned' || !s.subject_id) {
                  return null;
                }
                const resolvedColor = localSub?.color || '#10B981';
                return {
                  id: s.id,
                  userId: s.user_id,
                  userName: user.displayName,
                  userAvatar: user.avatarUrl,
                  subjectId: s.subject_id || '',
                  subjectName: resolvedName,
                  subjectColor: resolvedColor,
                  subject_name: resolvedName,
                  subject: localSub || null,
                  startTime: s.started_at,
                  endTime: s.ended_at,
                  durationSeconds: s.duration_seconds,
                  notes: s.notes || '',
                  mode: (s.mode as TimerMode) || 'stopwatch',
                  createdAt: s.started_at,
                };
              })
              .filter((s): s is StudySession => s !== null);
          }
        }
      } catch (err) {
        console.error("Error querying sessions by range:", err);
      }
    }

    // Fallback to local sessions
    return sessions.filter(s => {
      const name = (s.subject_name || s.subjectName || '').trim().toLowerCase();
      if (!name || name === 'unassigned' || !s.subjectId) return false;
      const t = new Date(s.startTime).getTime();
      return t >= startOfDay.getTime() && t <= endOfDay.getTime();
    });
  }, [user.id, user.displayName, user.avatarUrl, sessions]);

  // Start Timer - sets anchor timestamp, starts real-time delta tracking, and syncs to Supabase
  const startTimer = useCallback((subjectId?: string, taskId?: string) => {
    if (!checkDebounce()) return false;

    const activeSubId = subjectId || selectedSubjectId;
    const subjectList = Array.isArray(subjects) ? subjects : [];
    const targetSub = subjectList.find(s => s && s.id === activeSubId && !s.is_archived) || selectedSubject;

    // Prevent timer start if no subject is selected
    if (!targetSub?.id) {
      console.warn("Cannot start timer: No active subject selected. Please select a subject first.");
      return false;
    }

    if (activeSubId) {
      setSelectedSubjectId(activeSubId);
    }
    if (taskId) {
      setActiveTaskId(taskId);
    }
    setPomodoroCompletedPhase(null);
    // Authoritative Engine: Fresh timer start via TimerSessionEngine
    const nowAnchor = getServerNow();
    const engineStart = timerEngineRef.current.startTimer({
      mode: timerMode,
      serverNow: nowAnchor,
    });
    clientSessionIdRef.current = engineStart.sessionId;
    accumulatedSecondsRef.current = engineStart.accumulatedSeconds;
    setElapsedSeconds(0);
    sessionVersionRef.current = engineStart.version;
    startTimeRef.current = engineStart.startTime;
    sessionStartTimeRef.current = new Date(engineStart.sessionCreatedAt);
    isStudyingRef.current = true;
    isPausedRef.current = false;
    setIsStudying(true);
    setIsPaused(false);
    setIsRemoteSession(false);
    isRemoteSessionRef.current = false;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('timer-is-active', 'true');
        localStorage.setItem('studyio_timer_seconds', String(accumulatedSecondsRef.current));
        localStorage.setItem('studyio_timer_mode', timerMode);
        localStorage.setItem('studyio_timer_start_time', String(nowAnchor));
      } catch {}
    }
    soundFx.playStartChime();
    soundFx.resumeAmbient();
    console.log('[Timer Write: startTimer]', {
      timestamp: new Date().toISOString(),
      accumulated_seconds_before: accumulatedSecondsRef.current,
      subjectId: targetSub.id,
      mode: timerMode,
    });
    updateProfile({
      status: timerMode === 'pomodoro' && pomodoroPhase === 'shortBreak' ? 'resting' : 'studying',
      activeSessionStartTime: new Date().toISOString(),
      currentSubjectId: targetSub.id,
      currentSubjectName: targetSub.name,
      currentSubjectColor: targetSub.color,
    });
    const isUuid = (id?: string | null) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    syncActiveSessionToDb('running', {
      action: 'start',
      expectedVersion: 0,
      version: engineStart.version,
      startedAt: new Date(nowAnchor).toISOString(),
      accumulatedSeconds: 0,
      elapsedBeforePause: 0,
      subjectId: isUuid(targetSub.id) ? targetSub.id : null,
      subjectName: targetSub.name,
      mode: timerMode,
      targetDuration: timerMode === 'countdown' ? countdownTargetRef.current : (timerMode === 'pomodoro' ? (pomodoroPhase === 'work' ? pomodoroWorkDuration : pomodoroBreakDuration) : null),
      pomodoroPhase,
      isUltraStrict: timerMode === 'countdown' ? isUltraStrictRef.current : false,
      client_session_id: engineStart.sessionId,
    });
    return true;
  }, [checkDebounce, selectedSubjectId, selectedSubject, subjects, timerMode, pomodoroPhase, setSelectedSubjectId, updateProfile, syncActiveSessionToDb, pomodoroWorkDuration, pomodoroBreakDuration]);

  // Pause Timer - freeze accumulatedSeconds = actualElapsed, clear interval, and sync to Supabase
  const pauseTimer = useCallback(() => {
    if (!checkDebounce()) return;

    if (isUltraStrictRef.current && isStudying && (countdownTargetRef.current > 0 && elapsedSeconds < countdownTargetRef.current)) {
      toast('Ultra Focus Mode is locked until countdown completes', { icon: '🔒' });
      return;
    }

    const serverNow = getServerNow();
    const previousVersion = sessionVersionRef.current || 1;
    const enginePause = timerEngineRef.current.pauseTimer({ serverNow });
    const actualElapsed = enginePause.accumulatedSeconds || accumulatedSecondsRef.current || elapsedSeconds;
    accumulatedSecondsRef.current = actualElapsed;
    setElapsedSeconds(actualElapsed);
    sessionVersionRef.current = enginePause.version;
    startTimeRef.current = null;
    isPausedRef.current = true;
    // CRITICAL: Preserve clientSessionIdRef.current across pauses so countdown / pause sessions
    // retain their deterministic session ID across all devices for idempotent saves
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsPaused(true);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('timer-is-active', 'false');
        localStorage.setItem('studyio_timer_is_active', 'false');
        localStorage.setItem('studyio_timer_seconds', String(actualElapsed));
        localStorage.setItem('studyio_timer_mode', timerMode);
        localStorage.removeItem('studyio_timer_start_time');
        if (clientSessionIdRef.current) {
          localStorage.setItem('studyio_timer_session_id', clientSessionIdRef.current);
        }
      } catch {}
    }
    soundFx.playStopChime();
    soundFx.pauseAmbient();
    updateProfile({ status: 'resting' });
    syncActiveSessionToDb('paused', {
      action: 'pause',
      expectedVersion: previousVersion,
      version: enginePause.version,
      startedAt: null,
      last_paused_at: new Date(serverNow).toISOString(),
      accumulatedSeconds: actualElapsed,
      elapsedBeforePause: actualElapsed,
      mode: timerMode,
      pomodoroPhase,
      client_session_id: clientSessionIdRef.current,
    });
  }, [checkDebounce, updateProfile, syncActiveSessionToDb, timerMode, pomodoroPhase, isStudying, elapsedSeconds]);

  useEffect(() => {
    pauseTimerRef.current = pauseTimer;
  }, [pauseTimer]);


  // Resume Timer - recalculate startTimeRef.current = Date.now() - (accumulatedSeconds * 1000) and sync to Supabase
  const resumeTimer = useCallback(() => {
    if (!checkDebounce()) return;

    if (timerMode === 'countdown' && countdownTarget > 0 && accumulatedSecondsRef.current >= countdownTarget) {
      console.warn('[Timer] resumeTimer rejected: Countdown already completed');
      return;
    }

    const serverNow = getServerNow();
    const previousVersion = sessionVersionRef.current || 1;
    const engineResume = timerEngineRef.current.resumeTimer({ serverNow });
    const resumeAnchor = serverNow - (engineResume.accumulatedSeconds * 1000);
    startTimeRef.current = resumeAnchor;
    if (!sessionStartTimeRef.current) {
      sessionStartTimeRef.current = new Date(resumeAnchor);
    }
    accumulatedSecondsRef.current = engineResume.accumulatedSeconds;
    sessionVersionRef.current = engineResume.version;
    isPausedRef.current = false;
    setIsPaused(false);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('timer-is-active', 'true');
        localStorage.setItem('studyio_timer_is_active', 'true');
        localStorage.setItem('studyio_timer_seconds', String(accumulatedSecondsRef.current));
        localStorage.setItem('studyio_timer_mode', timerMode);
        localStorage.setItem('studyio_timer_start_time', String(resumeAnchor));
        if (clientSessionIdRef.current) {
          localStorage.setItem('studyio_timer_session_id', clientSessionIdRef.current);
        }
      } catch {}
    }
    setPomodoroCompletedPhase(null);
    soundFx.playStartChime();
    soundFx.resumeAmbient();
    console.log('[Timer Write: resumeTimer]', {
      timestamp: new Date().toISOString(),
      accumulated_seconds: accumulatedSecondsRef.current,
      mode: timerMode,
    });
    if (timerMode === 'pomodoro' && pomodoroPhase === 'shortBreak') {
      updateProfile({ status: 'resting' });
    } else {
      const targetSub = selectedSubject;
      updateProfile({
        status: 'studying',
        currentSubjectId: targetSub?.id,
        currentSubjectName: targetSub?.name,
        currentSubjectColor: targetSub?.color,
      });
    }
    syncActiveSessionToDb('running', {
      action: 'resume',
      expectedVersion: previousVersion,
      version: engineResume.version,
      startedAt: new Date(serverNow).toISOString(),
      accumulatedSeconds: accumulatedSecondsRef.current,
      elapsedBeforePause: accumulatedSecondsRef.current,
      mode: timerMode,
      pomodoroPhase,
      client_session_id: clientSessionIdRef.current,
    });
  }, [checkDebounce, timerMode, pomodoroPhase, selectedSubject, updateProfile, syncActiveSessionToDb, countdownTarget]);

  useEffect(() => {
    resumeTimerRef.current = resumeTimer;
  }, [resumeTimer]);

  // Synchronize atmosphere audio with session study & pause state transitions
  useEffect(() => {
    if (!isStudying) {
      return;
    }

    if (isPaused) {
      soundFx.pauseAmbient();
    } else {
      soundFx.resumeAmbient();
    }
  }, [isStudying, isPaused]);

  // Restore recovered timer session (running or paused)
  const restoreTimerSession = useCallback((
    seconds: number,
    mode?: TimerMode,
    subjectIdOrName?: string,
    startAsRunning: boolean = false,
    startAnchorMs?: number
  ) => {
    if (seconds < 0) return;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    accumulatedSecondsRef.current = seconds;
    const now = Date.now();
    const anchor = startAnchorMs ?? (now - (seconds * 1000));
    startTimeRef.current = startAsRunning ? anchor : null;
    if (startAsRunning) {
      sessionStartTimeRef.current = new Date(anchor);
    }

    // Restore or generate clientSessionIdRef
    let restoredSessionId: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        restoredSessionId = localStorage.getItem('studyio_timer_session_id');
      } catch {}
    }
    if (!restoredSessionId) {
      restoredSessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess_${now}`;
    }
    clientSessionIdRef.current = restoredSessionId;

    const effectiveMode = (mode && (mode === 'stopwatch' || mode === 'pomodoro' || mode === 'countdown')) ? mode : timerMode;

    // Restore authoritative timer engine state
    timerEngineRef.current.restoreSession({
      sessionId: restoredSessionId,
      mode: effectiveMode,
      isStudying: true,
      isPaused: !startAsRunning,
      accumulatedSeconds: seconds,
      startTime: startAsRunning ? anchor : null,
      sessionCreatedAt: anchor,
      version: 1,
    });

    // Set 10-second recovery grace period so initial polls do not race or kill the restored session
    recoveryGraceUntilRef.current = Date.now() + 10000;

    // Persist restored state immediately to storage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('studyio_timer_seconds', String(seconds));
        localStorage.setItem('timer-is-active', startAsRunning ? 'true' : 'false');
        localStorage.setItem('studyio_timer_is_active', startAsRunning ? 'true' : 'false');
        if (startAsRunning) {
          localStorage.setItem('studyio_timer_start_time', String(anchor));
        } else {
          localStorage.removeItem('studyio_timer_start_time');
        }
        localStorage.setItem('studyio_timer_mode', effectiveMode);
        localStorage.setItem('studyio_timer_session_id', restoredSessionId);
      } catch {}
    }

    setElapsedSeconds(seconds);
    setIsStudying(true);
    setIsPaused(!startAsRunning);
    if (effectiveMode) {
      setTimerMode(effectiveMode);
    }
    if (startAsRunning) {
      rearmTimerInterval();
    }
    if (subjectIdOrName) {
      const subjectList = Array.isArray(subjects) ? subjects : [];
      const match = subjectList.find(
        s => s && (s.id === subjectIdOrName || (s.name || '').toLowerCase() === subjectIdOrName.toLowerCase())
      );
      if (match) {
        setSelectedSubjectId(match.id);
      } else if (subjectIdOrName.trim()) {
        setSelectedSubjectId(subjectIdOrName.trim());
      }
    }
    updateProfile({ status: startAsRunning ? 'studying' : 'resting' });

    // Instantly sync restored session to Supabase so server is not empty
    syncActiveSessionToDb(startAsRunning ? 'running' : 'paused', {
      startedAt: startAsRunning ? new Date(now).toISOString() : null,
      accumulatedSeconds: seconds,
      elapsedBeforePause: seconds,
      session_created_at: sessionStartTimeRef.current ? sessionStartTimeRef.current.toISOString() : new Date(anchor).toISOString(),
      mode: effectiveMode,
      client_session_id: restoredSessionId,
    }).catch(() => {});
  }, [subjects, updateProfile, timerMode, syncActiveSessionToDb]);

  useEffect(() => {
    restoreTimerSessionRef.current = restoreTimerSession;
  }, [restoreTimerSession]);

  // Instantly add a session and sync metrics, Daily Overview, and Analytics
  const addSession = useCallback((newSession: StudySession) => {
    setSessions(prev => {
      const updated = mergeAndDeduplicateSessions(prev, [newSession]);
      const uid = userRef.current?.id || user?.id;
      persistSessionsToLocalStorage(updated, uid);

      const realStreak = calculateStreak(updated);
      setCachedStreak(realStreak);
      const realTotalSeconds = calculateNonOverlappingSeconds(updated);
      updateProfile({
        streakDays: realStreak,
        totalStudySeconds: realTotalSeconds,
        total_focus_minutes: Math.floor(realTotalSeconds / 60),
        totalFocusMinutes: Math.floor(realTotalSeconds / 60),
      });

      return updated;
    });
  }, [updateProfile, user?.id]);

  // Sync activeSubjectRef with current selectedSubject/subjects state
  useEffect(() => {
    const sub =
      (Array.isArray(subjects) ? subjects : []).find(s => s && s.id === selectedSubjectId && !s.is_archived) ||
      selectedSubject ||
      null;
    activeSubjectRef.current = sub;
  }, [selectedSubject, selectedSubjectId, subjects]);

  // Core helper to persist a session record to Supabase, update overview stats, and trigger Free Fire settlement
  const persistCompletedSession = useCallback(async (
    secondsToSave: number,
    notesOverride?: string,
    subjectOverride?: Subject | null
  ) => {
    if (secondsToSave <= 0) return false;

    const subjectList = Array.isArray(subjects) ? subjects : [];
    let activeSubject =
      subjectOverride ||
      activeSubjectRef.current ||
      selectedSubject ||
      subjectList.find(s => s && s.id === selectedSubjectId && !s.is_archived) ||
      null;

    if (!activeSubject && typeof window !== 'undefined') {
      try {
        const uid = userRef.current?.id || 'guest';
        const storedSubId =
          localStorage.getItem(getSelectedSubjectStorageKey(uid)) ||
          localStorage.getItem('study_io_selected_subject_guest') ||
          localStorage.getItem('studypulse_selected_subject_id');
        const storedSubs =
          localStorage.getItem(getSubjectStorageKey(uid)) ||
          localStorage.getItem('study_io_subjects_guest') ||
          localStorage.getItem('studypulse_subjects');
        if (storedSubs) {
          const parsed = JSON.parse(storedSubs);
          if (Array.isArray(parsed)) {
            activeSubject = parsed.find((s: any) => s && s.id === (selectedSubjectId || storedSubId));
          }
        }
      } catch {}
    }

    if (!activeSubject || !activeSubject.id || (activeSubject.name || '').trim().toLowerCase() === 'unassigned') {
      if (typeof window !== 'undefined') {
        alert("Please choose a subject before recording focus time.");
      }
      console.warn("persistCompletedSession: No active subject selected. Recording aborted.");
      return false;
    }

    const duration = secondsToSave;
    const now = new Date();
    const endedAt = now.toISOString();
    const startedAt = (sessionStartTimeRef.current || new Date(now.getTime() - duration * 1000)).toISOString();
    const subjectName = activeSubject.name;
    const subjectColor = activeSubject.color || '#10b981';
    const rawSubjectId = activeSubject.id;
    const isUuid = (id?: string | null) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let subjectId = isUuid(rawSubjectId) ? rawSubjectId : null;
    const notesToSave = notesOverride !== undefined ? notesOverride : currentNotes;
    const currentMode = timerMode || 'pomodoro';
    const currentUser = userRef.current;

    const supabase = getSupabase();
    let activeUser = null;
    if (supabase) {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (!authError && authData?.user) {
          activeUser = authData.user;
        }
      } catch (err) {
        console.warn('StudyContext: Error getting auth user:', err);
      }
    }

    if (supabase && activeUser?.id && !subjectId && activeSubject.name) {
      try {
        const { data: matchedSub } = await supabase
          .from('subjects')
          .select('id')
          .eq('user_id', activeUser.id)
          .ilike('name', activeSubject.name.trim())
          .maybeSingle();

        if (matchedSub?.id) {
          subjectId = matchedSub.id;
        } else {
          const { data: createdSub } = await supabase
            .from('subjects')
            .insert({
              user_id: activeUser.id,
              name: activeSubject.name.trim(),
              color: activeSubject.color || '#10B981',
              daily_goal_minutes: (activeSubject as any).daily_goal_minutes || 60,
            })
            .select('id')
            .single();
          if (createdSub?.id) {
            subjectId = createdSub.id;
          }
        }
      } catch (err) {
        console.warn('StudyContext: Could not resolve or create subject in Supabase:', err);
      }
    }

    const splits = splitSessionAtMidnights(
      new Date(startedAt),
      new Date(endedAt),
      {
        userId: activeUser?.id || currentUser.id,
        subjectId: subjectId || activeSubject?.id || undefined,
        subjectName: activeSubject.name,
        notes: notesToSave && notesToSave.trim().length > 0 ? notesToSave.trim() : undefined,
      }
    );

    const sessionPayloads = splits.map((split, idx) => ({
      client_session_id: idx === 0 ? (clientSessionIdRef.current || crypto.randomUUID()) : crypto.randomUUID(),
      user_id: split.userId,
      subject_id: split.subjectId || null,
      duration_seconds: split.durationSeconds,
      started_at: split.startTime,
      ended_at: split.endTime,
      notes: split.notes || null,
      mode: currentMode || 'stopwatch',
    }));

    console.log("Saving focus session payloads (split by midnight):", sessionPayloads);
    console.log('[Session Persist: study_sessions history table]', {
      timestamp: new Date().toISOString(),
      original_duration: duration,
      started_at: startedAt,
      ended_at: endedAt,
      payloads: sessionPayloads,
    });

    let insertedRecordIds: string[] = [];
    let isServerValidated = false;

    if (activeUser?.id) {
      try {
        for (const payload of sessionPayloads) {
          const saveRes = await saveValidatedSession({
            started_at: payload.started_at,
            ended_at: payload.ended_at,
            subject_id: payload.subject_id,
            notes: payload.notes,
            mode: payload.mode,
            client_session_id: payload.client_session_id,
          });
          if (saveRes.success && saveRes.session?.id) {
            if (saveRes.isDuplicate || saveRes.reason?.toLowerCase().includes('already recorded')) {
              console.warn('[StudyContext]: Duplicate session detected, skipping duplicate save/award.');
              continue;
            }
            insertedRecordIds.push(saveRes.session.id);
            isServerValidated = true;
            if (typeof saveRes.calculatedSeconds === 'number') {
              payload.duration_seconds = saveRes.calculatedSeconds;
            }
          }
        }

        if (insertedRecordIds.length === 0 && sessionPayloads.length > 0) {
          const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
          if (isOffline) {
            console.log('[StudyContext] Offline detected; enqueuing session payloads to outbox.');
            for (const payload of sessionPayloads) {
              await enqueueSyncEvent('session', 'create', payload, payload.client_session_id, payload.ended_at);
            }
          } else {
            console.warn('[StudyContext]: All payloads were duplicate sessions already saved on another device.');
            return false;
          }
        }

        // Direct client fallback if validated save did not produce records
        if (!isServerValidated && supabase && activeUser?.id) {
          for (const payload of sessionPayloads) {
            try {
              const { data: directData, error: directErr } = await supabase
                .from('study_sessions')
                .insert([{
                  user_id: payload.user_id,
                  subject_id: payload.subject_id,
                  duration_seconds: payload.duration_seconds,
                  started_at: payload.started_at,
                  ended_at: payload.ended_at,
                  notes: payload.notes,
                  mode: payload.mode,
                }])
                .select()
                .single();
              if (!directErr && directData?.id) {
                insertedRecordIds.push(directData.id);
                isServerValidated = true;
              }
            } catch {}
          }
        }
      } catch (err) {
        console.error('StudyContext: Exception inserting validated session:', err);
        if (supabase && activeUser?.id) {
          for (const payload of sessionPayloads) {
            try {
              const { data: directData, error: directErr } = await supabase
                .from('study_sessions')
                .insert([{
                  user_id: payload.user_id,
                  subject_id: payload.subject_id,
                  duration_seconds: payload.duration_seconds,
                  started_at: payload.started_at,
                  ended_at: payload.ended_at,
                  notes: payload.notes,
                  mode: payload.mode,
                }])
                .select()
                .single();
              if (!directErr && directData?.id) {
                insertedRecordIds.push(directData.id);
                isServerValidated = true;
              }
            } catch {}
          }
        }
      }
    }

    const newSessions: StudySession[] = sessionPayloads.map((payload, idx) => ({
      id: insertedRecordIds[idx] || payload.client_session_id,
      client_session_id: payload.client_session_id,
      userId: payload.user_id || 'guest',
      userName: currentUser.displayName,
      userAvatar: currentUser.avatarUrl,
      subjectId: payload.subject_id || activeSubject.id,
      subjectName: activeSubject.name || 'Unknown',
      subjectColor: activeSubject.color || '#10b981',
      subject_name: activeSubject.name || 'Unknown',
      startTime: payload.started_at,
      endTime: payload.ended_at,
      durationSeconds: payload.duration_seconds,
      notes: payload.notes || undefined,
      mode: currentMode as TimerMode,
      createdAt: new Date().toISOString(),
    }));

    // Immediately append the new sessions to the current day's session array
    newSessions.forEach(s => addSession(s));

      const todayStart = getLocalStartOfDay(new Date());
      const todayEnd = getLocalEndOfDay(new Date());
      
      const newSessionIds = new Set(newSessions.map(s => s.id));
      const allSessionsNow = [...newSessions, ...sessions.filter(s => !newSessionIds.has(s.id))];
      const todaySessions = allSessionsNow.filter(s => {
        const t = new Date(s.startTime).getTime();
        return t >= todayStart.getTime() && t <= todayEnd.getTime();
      });
      const totalToday = calculateNonOverlappingSeconds(todaySessions);

      const dailyGoalSeconds = (currentUser.dailyGoalHours || 4) * 3600;
      if (totalToday >= dailyGoalSeconds && totalToday - secondsToSave < dailyGoalSeconds) {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.5 },
        });
        soundFx.playMilestoneBell();
      }

      const todayString = getLocalDateString(new Date());
      let localStreakBonusDate: string | null = null;
      try {
        localStreakBonusDate = localStorage.getItem('studypulse_last_streak_bonus_date');
      } catch {}
      const lastStreakBonusDate = currentUser?.last_streak_bonus_date || currentUser?.lastStreakBonusDate || localStreakBonusDate;
      const hasStreakOrGoal = (currentUser?.streakDays || 0) > 0 || totalToday >= dailyGoalSeconds;
      const liveStatsNow = resolveLiveSeasonStats(currentUser, allSessionsNow);
      const carryoverRp = liveStatsNow.startingRp;
      const currentMonthSeconds = getCurrentMonthFocusSeconds(allSessionsNow);
      const currentMonthSecondsBefore = Math.max(0, currentMonthSeconds - secondsToSave);

      const prevRP = calculateSeasonRp(carryoverRp, currentMonthSecondsBefore);
      const computedNewRP = calculateSeasonRp(carryoverRp, currentMonthSeconds);
      // Competitive Anti-Exploit: Only award RP and rank tier advancement if verified by server (or guest mode)
      const isEligibleForRP = !activeUser?.id || isServerValidated;
      const gainedRP = isEligibleForRP ? Math.max(0, computedNewRP - prevRP) : 0;
      const newRP = isEligibleForRP ? computedNewRP : prevRP;

      const rpBreakdown = calculateSessionRP(secondsToSave, {
        hasStreakOrGoal,
        hasCompletedTask: false,
        lastStreakBonusDate,
        todayString,
      });
      rpBreakdown.sessionRP = gainedRP;
      rpBreakdown.totalGained = gainedRP;

      // XP Calculation & Anti-Exploit Rules:
      // Award rate: 10 XP per full minute of recorded focus time: Math.floor(duration_seconds / 60) * 10
      // Duration gate: If session duration is under 60 seconds (< 1 min), earned focus XP is strictly 0.
      // Daily consistency streak bonus (+100 XP): First valid session (>= 60s) of the day
      const isValidSession = secondsToSave >= 60;
      const focusXP = isValidSession ? Math.floor(secondsToSave / 60) * 10 : 0;
      const appliedStreakBonus = isValidSession && (lastStreakBonusDate !== todayString);
      const totalEarnedXP = focusXP + (appliedStreakBonus ? 100 : 0);

      // Permanently increment lifetime_xp (never resets across seasons)
      const prevLifetimeXP = Math.max(
        Number(currentUser?.lifetime_xp ?? 0),
        Number(currentUser?.lifetimeXp ?? 0),
        Number(currentUser?.xp ?? 0)
      );
      const newLifetimeXP = prevLifetimeXP + totalEarnedXP;
      const prevLevel = Math.max(getLevelFromLifetimeXP(prevLifetimeXP), Number(currentUser?.level || 1));
      const newLevel = Math.max(getLevelFromLifetimeXP(newLifetimeXP), prevLevel);
      const newScholarTitle = getScholarTitle(newLevel);

      // Trigger celebratory XP gain notification
      if (totalEarnedXP > 0) {
        const mins = Math.floor(secondsToSave / 60);
        const reason = appliedStreakBonus
          ? `${mins} min Focus (+100 Daily Streak)`
          : `${mins} min Focus Session`;
        triggerXpEarned(totalEarnedXP, reason, 'focus');
      }

      if (newLevel > prevLevel) {
        triggerLevelUp(prevLevel, newLevel, newScholarTitle);
      }

      const profileUpdates: Partial<UserProfile> = {
        seasonRp: Math.round(newRP),
        rp: Math.round(newRP),
        rank_title: getRankTier(newRP).fullTitle,
        season_base_rp: carryoverRp,
        carryover_rp: carryoverRp,
        lifetime_xp: Math.round(newLifetimeXP),
        lifetimeXp: Math.round(newLifetimeXP),
        xp: Math.round(newLifetimeXP),
        level: Math.round(newLevel),
        levelTitle: newScholarTitle,
      };

      if (appliedStreakBonus || rpBreakdown.goalStreakBonus > 0) {
        profileUpdates.last_streak_bonus_date = todayString;
        profileUpdates.lastStreakBonusDate = todayString;
        try {
          localStorage.setItem('studypulse_last_streak_bonus_date', todayString);
        } catch {}
      }

      updateProfile(profileUpdates);

      setSettlementData({
        prevRP,
        newRP,
        breakdown: {
          ...rpBreakdown,
          isOfflinePending: Boolean(activeUser?.id) && !isServerValidated,
        },
        subjectName,
        subjectColor,
      });

      if (activeUser?.id) {
        try {
          await refetchSessions();
        } catch (refetchErr) {
          console.warn('StudyContext: Background refetch failed:', refetchErr);
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('studypulse:session-saved'));
      }

      return true;
  }, [
    selectedSubject,
    selectedSubjectId,
    subjects,
    currentNotes,
    timerMode,
    activeTaskId,
    addSession,
    triggerXpEarned,
    sessions,
    updateProfile,
    refetchSessions,
  ]);

  // Stop Timer and save session to Supabase immediately with localStorage fallback
  const stopTimer = useCallback(async (
    durationOverride?: number,
    notesOverride?: string,
    subjectOverride?: Subject | null
  ) => {
    if (!checkDebounce()) return;

    if (isUltraStrictRef.current && isStudying && (countdownTargetRef.current > 0 && elapsedSeconds < countdownTargetRef.current)) {
      toast('Ultra Focus Mode is locked until countdown completes', { icon: '🔒' });
      return;
    }

    const engineStop = timerEngineRef.current.stopTimer({ serverNow: getServerNow() });
    const currentActual = engineStop.durationSeconds;
    const seconds = durationOverride !== undefined ? durationOverride : Math.max(elapsedSeconds, currentActual);
    if (!isStudying && seconds === 0) return;

    console.log('[Timer Write: stopTimer]', {
      timestamp: new Date().toISOString(),
      duration_seconds: seconds,
      accumulated_seconds: accumulatedSecondsRef.current,
    });

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const activeSub = subjectOverride || activeSubjectRef.current || selectedSubject;
    if (!activeSub || !activeSub.id || (activeSub.name || '').trim().toLowerCase() === 'unassigned') {
      if (typeof window !== 'undefined') {
        alert("Please choose a subject before recording focus time.");
      }
      return;
    }

    // 1. Reset remote active_sessions state via stop_session RPC
    const rpcFinalSeconds = await syncActiveSessionToDb('stopped');
    
    // Always trust local seconds if we have them, as RPC might have stale started_at if pause_session failed
    const secondsToPersist = seconds;

    console.log('[Timer Stop: server-authoritative duration]', {
      clientSeconds: seconds,
      rpcFinalSeconds,
      secondsToPersist,
    });

    if (secondsToPersist <= 0) {
      startTimeRef.current = null;
    clientSessionIdRef.current = null;
      accumulatedSecondsRef.current = 0;
      setIsStudying(false);
      setIsPaused(false);
      soundFx.pauseAmbient();
      setElapsedSeconds(0);
      setActiveTaskId(null);
      setCurrentNotes('');
      sessionStartTimeRef.current = null;
    clientSessionIdRef.current = null;
      clearPersistedTimer();
      return;
    }

    const saved = await persistCompletedSession(secondsToPersist, notesOverride, activeSub);
    if (!saved) return;

    // Clear references and reset state to 0 on save
    startTimeRef.current = null;
    clientSessionIdRef.current = null;
    accumulatedSecondsRef.current = 0;
    sessionVersionRef.current = 0;
    isStudyingRef.current = false;
    isPausedRef.current = false;
    setIsStudying(false);
    setIsPaused(false);
    setIsRemoteSession(false);
    isRemoteSessionRef.current = false;
    soundFx.pauseAmbient();
    setElapsedSeconds(0);
    setActiveTaskId(null);
    setCurrentNotes('');
    sessionStartTimeRef.current = null;
    clientSessionIdRef.current = null;
    clearPersistedTimer();
  }, [
    checkDebounce,
    isStudying,
    isPaused,
    elapsedSeconds,
    selectedSubject,
    persistCompletedSession,
    clearPersistedTimer,
    syncActiveSessionToDb,
  ]);

  useEffect(() => {
    stopTimerRef.current = stopTimer;
  }, [stopTimer]);

  // General saveSession method directly callable with subject details or session data
  const saveSession = useCallback(async (sessionDataInput: {
    user_id?: string;
    userId?: string;
    subject_id?: string;
    subjectId?: string;
    subject_name?: string;
    subjectName?: string;
    subject_color?: string;
    subjectColor?: string;
    duration_seconds?: number;
    durationSeconds?: number;
    duration?: number;
    created_at?: string;
    notes?: string;
    mode?: TimerMode;
  }): Promise<boolean> => {
    const duration = sessionDataInput.duration_seconds ?? sessionDataInput.durationSeconds ?? sessionDataInput.duration ?? 0;
    if (duration <= 0) return false;

    const subId = sessionDataInput.subject_id || sessionDataInput.subjectId;
    const subName = sessionDataInput.subject_name || sessionDataInput.subjectName;
    const subColor = sessionDataInput.subject_color || sessionDataInput.subjectColor;

    const subjectList = Array.isArray(subjects) ? subjects : [];
    let matchedSub: Subject | null = null;
    if (subId) {
      matchedSub = subjectList.find(s => s && s.id === subId && !s.is_archived) || null;
    }
    if (!matchedSub && subName) {
      matchedSub = subjectList.find(s => s && s.name.trim().toLowerCase() === subName.trim().toLowerCase() && !s.is_archived) || null;
    }
    if (!matchedSub) {
      matchedSub = activeSubjectRef.current || selectedSubject || null;
    }

    if (!matchedSub && (!subId || !subName)) {
      if (typeof window !== 'undefined') {
        alert("Please choose a subject before recording focus time.");
      }
      return false;
    }

    const resolvedSub: Subject = matchedSub || {
      id: subId || `sub-${Date.now()}`,
      name: subName || 'Focus',
      color: subColor || '#10b981',
      createdAt: new Date().toISOString(),
    };

    return persistCompletedSession(duration, sessionDataInput.notes, resolvedSub);
  }, [subjects, selectedSubject, persistCompletedSession]);

  // Save completed Pomodoro Focus session to Supabase and switch to Break mode in PAUSED state
  const saveAndStartBreak = useCallback(async () => {
    if (!checkDebounce()) return;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    const secondsToSave = pomodoroWorkDuration;
    await persistCompletedSession(secondsToSave);

    // Switch timer to Break mode in a PAUSED state!
    setPomodoroPhase('shortBreak');
    setElapsedSeconds(0);
    accumulatedSecondsRef.current = 0;
    startTimeRef.current = null;
    clientSessionIdRef.current = null;
    sessionStartTimeRef.current = null;
    clientSessionIdRef.current = null;
    setIsStudying(true);
    setIsPaused(true);
    setPomodoroCompletedPhase(null);
    clearPersistedTimer();
    updateProfile({ status: 'resting' });
    syncActiveSessionToDb('paused', {
      startedAt: null,
      accumulatedSeconds: 0,
      elapsedBeforePause: 0,
      mode: 'pomodoro',
      pomodoroPhase: 'shortBreak',
      targetDuration: pomodoroBreakDuration,
    });
  }, [checkDebounce, pomodoroWorkDuration, pomodoroBreakDuration, persistCompletedSession, clearPersistedTimer, updateProfile, syncActiveSessionToDb]);

  // Skip Break: Save session and reset timer for another study round
  const skipPomodoroBreak = useCallback(async () => {
    if (!checkDebounce()) return;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    const secondsToSave = pomodoroWorkDuration;
    await persistCompletedSession(secondsToSave);

    // Reset timer for another study round
    setPomodoroPhase('work');
    setElapsedSeconds(0);
    accumulatedSecondsRef.current = 0;
    startTimeRef.current = null;
    clientSessionIdRef.current = null;
    sessionStartTimeRef.current = null;
    clientSessionIdRef.current = null;
    setIsStudying(false);
    setIsPaused(false);
    setPomodoroCompletedPhase(null);
    clearPersistedTimer();
    updateProfile({ status: 'resting' });
    syncActiveSessionToDb('stopped');
  }, [checkDebounce, pomodoroWorkDuration, persistCompletedSession, clearPersistedTimer, updateProfile, syncActiveSessionToDb]);

  // Explicitly start the break countdown from paused break state
  const startPomodoroBreak = useCallback(() => {
    if (!checkDebounce()) return;

    const nowAnchor = getServerNow();
    setPomodoroPhase('shortBreak');
    accumulatedSecondsRef.current = 0;
    sessionVersionRef.current = 1;
    startTimeRef.current = nowAnchor;
    sessionStartTimeRef.current = new Date(nowAnchor);
    setElapsedSeconds(0);
    setIsStudying(true);
    setIsPaused(false);
    setIsRemoteSession(false);
    isRemoteSessionRef.current = false;
    setPomodoroCompletedPhase(null);
    soundFx.playStartChime();
    updateProfile({ status: 'resting' });
    syncActiveSessionToDb('running', {
      startedAt: new Date(nowAnchor).toISOString(),
      accumulatedSeconds: 0,
      elapsedBeforePause: 0,
      mode: 'pomodoro',
      pomodoroPhase: 'shortBreak',
      targetDuration: pomodoroBreakDuration,
    });
  }, [checkDebounce, updateProfile, pomodoroBreakDuration, syncActiveSessionToDb]);

  // Complete Timer - alias for stopTimer
  const completeTimer = useCallback(async (
    durationOverride?: number,
    notesOverride?: string,
    subjectOverride?: Subject | null
  ) => {
    await stopTimer(durationOverride, notesOverride, subjectOverride);
  }, [stopTimer]);

  // Reset Timer - cleanly resets elapsed time, references, and isRunning state, syncing to active_sessions
  // Critical Anti-Tamper: State cleanup must NEVER be debounced
  const resetTimer = useCallback(() => {
    if (isUltraStrictRef.current && isStudying && (countdownTargetRef.current > 0 && elapsedSeconds < countdownTargetRef.current)) {
      toast('Ultra Focus Mode is locked until countdown completes', { icon: '🔒' });
      return;
    }
    const previousSessionId = clientSessionIdRef.current;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    startTimeRef.current = null;
    clientSessionIdRef.current = null;
    accumulatedSecondsRef.current = 0;
    sessionVersionRef.current = 0;
    sessionStartTimeRef.current = null;
    isStudyingRef.current = false;
    isPausedRef.current = false;
    setIsStudying(false);
    setIsPaused(false);
    soundFx.stopAmbient();
    setElapsedSeconds(0);
    setPomodoroCompletedPhase(null);
    setPomodoroPhase('work');
    setActiveTaskId(null);
    clearPersistedTimer();
    updateProfile({ status: 'resting', activeSessionStartTime: undefined });
    syncActiveSessionToDb('stopped', { client_session_id: previousSessionId, action: 'session_saved' });
  }, [clearPersistedTimer, updateProfile, syncActiveSessionToDb, isStudying, elapsedSeconds]);

  const dismissRankSettlement = useCallback(() => {
    setSettlementData(null);
    setCurrentNotes('');
    setIsFocusModeOpen(false);
    refetchSessions();
  }, [refetchSessions]);

  // Remote Session Recovery Actions
  const takeOverSession = useCallback(async () => {
    const myId = cleanDeviceId(getDeviceId());
    setIsRemoteSession(false);
    isRemoteSessionRef.current = false;

    const supabase = getSupabase();
    const uid = realtimeUserId || userRef.current?.id || user?.id;
    if (supabase && uid) {
      try {
        const { data: active } = await supabase
          .from('active_sessions')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();

        if (active && (active.status === 'running' || active.status === 'paused')) {
          const effectiveMode = active.mode || timerMode || 'stopwatch';
          const effectiveIsUltra = Boolean(active.is_ultra);
          const effectiveClientSessionId = active.session_id || clientSessionIdRef.current;
          const finalDeviceId = `${myId}${effectiveMode === 'countdown' ? '#countdown' : ''}${effectiveIsUltra ? '#ultra' : ''}${effectiveClientSessionId ? `#sess:${effectiveClientSessionId}` : ''}`;

          await fetch('/api/timer/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: active.status === 'paused' ? 'pause' : 'resume',
              session_id: active.session_id,
              expected_version: active.version,
              device_id: finalDeviceId,
            }),
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('[takeOverSession] Error claiming session:', err);
      }
    }

    toast('Session transferred to this device 📱', { icon: '📱' });
  }, [realtimeUserId, user?.id, timerMode]);

  const endRemoteSession = useCallback(async () => {
    await stopTimer();
    setIsRemoteSession(false);
    isRemoteSessionRef.current = false;
    toast('Remote session ended ⏹️', { icon: '⏹️' });
  }, [stopTimer]);

  // Subjects Management
  const addSubject = async (newSub: Omit<Subject, 'id' | 'createdAt'>) => {
    if (!newSub) return;
    const trimmedName = (newSub.name || '').trim();
    if (!trimmedName) return;

    const subjectList = Array.isArray(subjects) ? subjects : [];

    // Prevent duplicate subjects (case-insensitive) locally first
    const existing = subjectList.find(
      s => s && (s.name || '').trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (existing) {
      if (existing.is_archived) {
        await updateSubject(existing.id, {
          is_archived: false,
          color: newSub.color || '#10B981',
          targetMinutesPerDay: newSub.targetMinutesPerDay || 60,
        });
        setSelectedSubjectId(existing.id);
        return;
      }
      setSelectedSubjectId(existing.id);
      return;
    }

    const tempId = `sub-${Date.now()}`;
    const targetUserId = user?.id || newSub.userId || '';
    const targetDailyMins = newSub.daily_goal_minutes || newSub.targetMinutesPerDay || 60;
    
    let finalId = tempId;
    let finalUserId = targetUserId;

    const supabase = getSupabase();
    if (supabase) {
      const { data: authData } = await supabase.auth.getUser();
      const activeUserId = authData?.user?.id || targetUserId;
      if (activeUserId && !activeUserId.startsWith('user-scholar-')) {
        const { data, error } = await supabase
          .from('subjects')
          .insert({
            user_id: activeUserId,
            name: trimmedName,
            color: newSub.color || '#10B981',
          })
          .select()
          .single();
          
        if (error) {
          console.error("Failed to insert subject into Supabase:", error);
          if (error.code === '23505') {
            throw new Error("A subject with this name already exists.");
          }
          throw error;
        }
        if (data) {
          finalId = data.id;
          finalUserId = activeUserId;
        }
      }
    }

    const sub: Subject = {
      ...newSub,
      name: trimmedName,
      color: newSub.color || '#10B981',
      targetMinutesPerDay: targetDailyMins,
      daily_goal_minutes: targetDailyMins,
      id: finalId,
      userId: finalUserId,
      createdAt: new Date().toISOString(),
      is_archived: false,
    };
    
    setSubjectsState(prev => {
      const prevList = Array.isArray(prev) ? prev : [];
      const updated = [...prevList, sub];
      const deduped = deduplicateSubjects(updated);
      saveSubjects(deduped);
      return deduped;
    });
    setSelectedSubjectId(sub.id);
  };

  const updateSubject = async (id: string, updates: Partial<Subject>) => {
    if (!id) return;
    const subjectList = Array.isArray(subjects) ? subjects : [];
    const trimmedUpdates = {
      ...updates,
      ...(updates.name !== undefined ? { name: (updates.name || '').trim() } : {}),
    };
    
    const supabase = getSupabase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (supabase && user?.id && isUuid) {
      const dbUpdates: Record<string, any> = {};
      if (trimmedUpdates.name !== undefined) dbUpdates.name = trimmedUpdates.name;
      if (trimmedUpdates.color !== undefined) dbUpdates.color = trimmedUpdates.color;
      // if (trimmedUpdates.is_archived !== undefined) dbUpdates.is_archived = trimmedUpdates.is_archived; // Schema may not support this yet
      if (Object.keys(dbUpdates).length > 0) {
        const { error } = await supabase.from('subjects').update(dbUpdates).eq('id', id);
        if (error) {
          console.error("Failed to update subject in Supabase:", error);
          if (error.code === '23505') {
            throw new Error("A subject with this name already exists.");
          }
          throw error;
        }
      }
    }
    
    const targetSubject = subjectList.find(s => s && s.id === id);
    const oldName = targetSubject?.name;
    const updated = subjectList.map(s => s && s.id === id ? { ...s, ...trimmedUpdates } : s);
    saveSubjects(updated);

    // Synchronize sessions in local state and localStorage if subject color or name changed
    if (trimmedUpdates.color || trimmedUpdates.name) {
      setSessions(prev => {
        const updatedSessions = prev.map(sess => {
          const sessSubId = sess.subjectId || (sess as any).subject_id;
          const sessSubName = (sess.subjectName || (sess as any).subject_name || '').trim().toLowerCase();
          const isMatch =
            (sessSubId && sessSubId === id) ||
            (oldName && sessSubName === oldName.trim().toLowerCase());

          if (isMatch) {
            return {
              ...sess,
              ...(trimmedUpdates.color ? { subjectColor: trimmedUpdates.color, subject_color: trimmedUpdates.color } : {}),
              ...(trimmedUpdates.name ? { subjectName: trimmedUpdates.name, subject_name: trimmedUpdates.name } : {}),
            };
          }
          return sess;
        });

        try {
          localStorage.setItem('studypulse_sessions', JSON.stringify(updatedSessions));
        } catch {}
        return updatedSessions;
      });
    }
  };

  const deleteSubject = async (id: string): Promise<void> => {
    if (!id) return;
    // Soft-delete / archive: Keep the subject record and past sessions intact
    const subjectList = Array.isArray(subjects) ? subjects : [];
    const updated = subjectList.map(s => (s && s.id === id ? { ...s, is_archived: true } : s));
    const activeSubjects = updated.filter(s => s && !s.is_archived);

    saveSubjects(updated);
    if (selectedSubjectId === id) {
      setSelectedSubjectId('');
    }

    const supabase = getSupabase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (supabase && user?.id && isUuid) {
      try {
        // Schema may not support is_archived column yet.
        // If it did, we would do:
        // await supabase.from('subjects').update({ is_archived: true }).eq('id', id);
      } catch (err) {
        console.error("Failed to archive subject in Supabase:", err);
      }
    }
  };

  // To-Dos Management
  const addTodo = (newTodo: Omit<TodoItem, 'id' | 'userId' | 'createdAt'>) => {
    const tempId = `todo-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const subjectList = Array.isArray(subjects) ? subjects : [];
    const targetSub = subjectList.find(s => s && s.id === newTodo.subjectId);
    const item: TodoItem = {
      ...newTodo,
      id: tempId,
      userId: user?.id || '',
      subjectName: targetSub?.name,
      subjectColor: targetSub?.color,
      createdAt: new Date().toISOString(),
    };

    setTodos(prev => {
      const updated = [...prev, item];
      try {
        localStorage.setItem('studypulse_todos', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    const supabase = getSupabase();
    if (supabase && user.id && !user.id.startsWith('user-scholar-')) {
      const isSubUuid = targetSub?.id && targetSub.id.length === 36;
      supabase
        .from('todos')
        .insert({
          user_id: user.id,
          task: newTodo.title,
          is_completed: newTodo.completed,
          due_date: newTodo.date,
          priority: newTodo.priority,
          estimated_minutes: newTodo.estimatedMinutes || 30,
          subject_id: isSubUuid ? targetSub.id : null,
        })
        .select()
        .single()
        .then(
          ({ data }) => {
            if (data) {
              setTodos(prev => {
                const updated = prev.map(t => (t.id === tempId ? { ...t, id: data.id } : t));
                try {
                  localStorage.setItem('studypulse_todos', JSON.stringify(updated));
                } catch {}
                return updated;
              });
            }
          },
          (err: unknown) => {
            console.warn('Supabase todo insert error:', err);
          }
        );
    }
  };

  const toggleTodo = (id: string) => {
    let nextCompleted = false;
    setTodos(prev => {
      const target = prev.find(t => t.id === id);
      if (!target) return prev;
      nextCompleted = !target.completed;
      if (nextCompleted) {
        soundFx.playReactionPop();
      }

      const updated = prev.map(t => {
        if (t.id === id) {
          return {
            ...t,
            completed: nextCompleted,
            completedAt: nextCompleted ? new Date().toISOString() : undefined,
          };
        }
        return t;
      });
      try {
        localStorage.setItem('studypulse_todos', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    const supabase = getSupabase();
    if (supabase && id.length === 36) {
      supabase
        .from('todos')
        .update({ is_completed: nextCompleted })
        .eq('id', id)
        .then(
          () => {},
          (err: unknown) => console.warn('Supabase todo update error:', err)
        );
    }
  };

  const deleteTodo = (id: string) => {
    setTodos(prev => {
      const filtered = prev.filter(t => t.id !== id);
      try {
        localStorage.setItem('studypulse_todos', JSON.stringify(filtered));
      } catch {}
      return filtered;
    });

    const supabase = getSupabase();
    if (supabase && id.length === 36) {
      supabase
        .from('todos')
        .delete()
        .eq('id', id)
        .then(
          () => {},
          (err: unknown) => console.warn('Supabase todo delete error:', err)
        );
    }
  };

  const updateTodoTitle = (id: string, title: string) => {
    setTodos(prev => {
      const updated = prev.map(t => (t.id === id ? { ...t, title } : t));
      try {
        localStorage.setItem('studypulse_todos', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    const supabase = getSupabase();
    if (supabase && id.length === 36) {
      supabase
        .from('todos')
        .update({ task: title })
        .eq('id', id)
        .then(
          () => {},
          (err: unknown) => console.warn('Supabase todo update error:', err)
        );
    }
  };

  const clearCompletedTodos = () => {
    let completedIds: string[] = [];
    setTodos(prev => {
      completedIds = prev.filter(t => t.completed).map(t => t.id);
      const active = prev.filter(t => !t.completed);
      try {
        localStorage.setItem('studypulse_todos', JSON.stringify(active));
      } catch {}
      return active;
    });

    const supabase = getSupabase();
    if (supabase) {
      completedIds.forEach(id => {
        if (id.length === 36) {
          supabase.from('todos').delete().eq('id', id).then(() => {}, () => {});
        }
      });
    }
  };

  const confirmStillStudying = useCallback(async () => {
    setIsStillStudyingPromptOpen(false);
    stillStudyingPromptTriggeredRef.current = false;
    if (timerMode !== 'stopwatch' || isUltraStrictRef.current) {
      return;
    }
    const uid = realtimeUserId || userRef.current?.id || user?.id;
    const sessId = clientSessionIdRef.current;
    if (uid && sessId) {
      try {
        const expectedVersion = sessionVersionRef.current;
        enqueueTimerEvent('confirm', sessId, expectedVersion, { user_id: uid });
        sessionVersionRef.current += 1;
        flushTimerOutbox();
      } catch (err) {
        console.warn('[StillStudying] confirm failed to enqueue:', err);
      }
    }
    toast.success('Focus session extended! Keep going! 🚀', { duration: 4000 });
  }, [realtimeUserId, user?.id]);

  const closeStillStudyingPrompt = useCallback(() => {
    setIsStillStudyingPromptOpen(false);
  }, []);

  const dismissAutoCloseNotice = useCallback(() => {
    setAutoCloseNotice(null);
  }, []);

  // Outbox status subscription & flush on reconnect
  useEffect(() => {
    let timerPending = hasPendingOutboxEvents();
    let syncPending = false;

    const checkPending = () => {
      setHasPendingSync(timerPending || syncPending);
    };

    const unsubTimer = subscribeOutboxStatus((pending) => {
      timerPending = pending;
      checkPending();
    });

    const unsubSync = subscribeSyncOutbox((pending) => {
      syncPending = pending;
      checkPending();
    });

    registerAutoSync();

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      flushTimerOutbox().catch(() => {});
      flushSyncOutbox().catch(() => {});
    }

    return () => {
      unsubTimer();
      unsubSync();
    };
  }, []);

  return (
    <StudyContext.Provider
      value={{
        isSyncConnected,
        realtimeStatus,
        isUsingPollingFallback,
        realtimeUserId,
        realtimeEventsCount,
        refetchActiveSession,
        isRemoteTransitioning,
        isRemoteSession,
        setIsRemoteSession,
        takeOverSession,
        endRemoteSession,
        lastRemoteSyncTime,
        hasHydrated,
        isLoadingSessions,
        hasPendingSync,
        isStillStudyingPromptOpen,
        stillStudyingPromptTime,
        confirmStillStudying,
        closeStillStudyingPrompt,
        autoCloseNotice,
        dismissAutoCloseNotice,
        gamification,
        settlementData,
        showRankSettlement,
        dismissRankSettlement,
        seasonRecap,
        dismissSeasonRecap,
        simulateSeasonReset,
        seasonResetAlert,
        dismissSeasonResetAlert,
        simulateSeasonResetModal,
        lastXpEarned,
        levelUpData,
        dismissLevelUpModal,
        dismissXpNotification,
      isIdleCheckActive,
      isBlockedByOtherTab,
      confirmIdleCheck,
        triggerXpEarned,
        triggerLevelUp,
        subjects,
        selectedSubject,
        selectedSubjectId,
        setSelectedSubjectId,
        timerMode,
        setTimerMode,
        countdownTarget,
        setCountdownTarget,
        isUltraStrict,
        setIsUltraStrict,
        syncTimerMode,
        isStudying,
        isPaused,
        elapsedSeconds,
        pomodoroPhase,
        setPomodoroPhase,
        pomodoroWorkDuration,
        pomodoroBreakDuration,
        pomodoroPreset,
        setPomodoroPreset,
        pomodoroCompletedPhase,
        setPomodoroCompletedPhase,
        saveAndStartBreak,
        skipPomodoroBreak,
        startPomodoroBreak,
        activeTaskId,
        currentNotes,
        setCurrentNotes,
        sessions,
        todos,
        selectedDate,
        setSelectedDate,
        isFocusModeOpen,
        setIsFocusModeOpen,
        isRunning,
        startTimeRef,
        clientSessionIdRef,
        timerEngineRef,
        syncTimerWithServerTime,
        startTimer,
        pauseTimer,
        resumeTimer,
        stopTimer,
        completeTimer,
        resetTimer,
        restoreTimerSession,
        clearPersistedTimer,
        addSubject,
        updateSubject,
        deleteSubject,
        addTodo,
        toggleTodo,
        deleteTodo,
        updateTodoTitle,
        clearCompletedTodos,
        getTodayTotalSeconds,
        refetchSessions,
        fetchHistoricalSessions,
        querySessionsByRange,
        addSession,
        persistStudySession,
        saveSession,
      }}
    >
      {children}
    </StudyContext.Provider>
  );
}

export function useStudy() {
  const context = useContext(StudyContext);
  if (!context) {
    throw new Error('useStudy must be used within a StudyProvider');
  }
  return context;
}









