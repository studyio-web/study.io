'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStudy, showPushNotification } from '../../context/StudyContext';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { usePremium } from '../../context/PremiumContext';
import { useFocusGoals } from '../../context/FocusGoalContext';
import { SubjectManagerModal, SubjectManager } from './SubjectManagerModal';
import { ErrorBoundary } from '../common/ErrorBoundary';
import {
  formatSeconds,
  formatHoursAndMins,
  getLocalStartOfDay,
  getLocalEndOfDay,
  getYesterdayRange,
} from '../../lib/utils';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Maximize2,
  FolderPlus,
  Flame,
  Clock,
  Sparkles,
  ChevronDown,
  MessageCircle,
  Check,
  X,
  Coffee,
  Zap,
  SkipForward,
  Music,
  Volume2,
  CloudRain,
  Radio,
  Headphones,
  Wind,
  ChevronUp,
  Loader2,
  Settings,
  WifiOff,
  Shield,
  Lock,
  Bell,
  BellOff,
  BellRing,
} from 'lucide-react';
import { loadTimerAlarmEnabled, saveTimerAlarmEnabled } from '../../lib/timerAlarm';
import { TimerAlarmModal } from './TimerAlarmModal';
import { App } from '@capacitor/app';
import {
  StrictMode,
  isStrictModeSupported,
  loadStrictModeEnabled,
  saveStrictModeEnabled,
  loadUltraStrictEnabled,
  saveUltraStrictEnabled,
  loadAllowedApps,
  saveAllowedApps,
} from '../../lib/strictModePlugin';
import {
  StrictModeAllowedAppsModal,
  StrictModePermissionModal,
  StrictModeConfigModal,
  StrictCountdownWarningModal,
} from './StrictModeModal';
import {
  AccessibilityBlocker,
  loadBlockShortsReelsEnabled,
  saveBlockShortsReelsEnabled,
} from '../../lib/accessibility-blocker';
import { soundFx, AmbientSoundType } from '../../lib/audio';
import { useAtmosphere } from '../focus/useAtmosphere';
import confetti from 'canvas-confetti';
import { CountdownEditor } from './CountdownEditor';
import { enterFullscreenSafely, exitFullscreenSafely } from './FocusModeModal';
import { TimerNotification, isNativeAndroid } from '../../lib/timerNotificationPlugin';
import { notify } from '../../lib/notifications';
import { getSupabase } from '../../lib/supabase';
import { fetchAuthoritativeServerTime, saveValidatedSession } from '../../lib/serverTime';
import { getDailyQuote } from '../../lib/quotes';
import { motion, useReducedMotion } from 'framer-motion';
import { TimerDial } from './TimerDial';
import { StudySession, Subject, TimerMode, UserProfile, PomodoroCompletedPhase } from '../../types';
import { calculateFocusXP, getLevelFromLifetimeXP, getScholarTitle } from '../../lib/gamification';
import { calculateSessionRP, HARD_RESET_CAP_RP } from '../../lib/rankedSystem';
import { getCurrentMonthFocusSeconds, calculateSeasonRp, getRankTier, resolveLiveSeasonStats } from '../../lib/ranks';
import { getLocalDateString, isSessionToday, isSessionYesterday } from '../../lib/dateUtils';
import { Skeleton } from '../common/Skeleton';
import { useRankTheme } from '../../hooks/useRankTheme';
import { useStudyMode } from '../../context/StudyModeContext';
import { triggerHaptic, registerBackButtonHandler } from '../../lib/native-feel';
import { hapticMedium, hapticSuccess } from '@/lib/haptics';

const EMPTY_STATE_QUOTES = [
  'Every long streak starts with one session.',
  'Future you will thank you for starting now.',
  "Small steps. Press Start whenever you're ready.",
];

export function StudyTimer() {
  const dailyQuote = getDailyQuote();
  const { user, isLoading, updateProfile } = useAuth();
  const { isFocus, loading: studyModeLoading } = useStudyMode();
  const { theme, userRank } = useRankTheme();
  const { isPremium } = usePremium();
  const { goals, refreshGoals, checkGoalReached } = useFocusGoals();
  const {
    subjects = [],
    selectedSubject,
    selectedSubjectId,
    setSelectedSubjectId,
    timerMode,
    setTimerMode,
    countdownTarget,
    setCountdownTarget,
    isStudying,
    isPaused,
    isRunning,
    isBlockedByOtherTab,
    startTimeRef,
    clientSessionIdRef,
    syncTimerWithServerTime,
    elapsedSeconds,
    pomodoroPhase,
    pomodoroWorkDuration,
    pomodoroBreakDuration,
    pomodoroPreset,
    setPomodoroPreset,
    pomodoroCompletedPhase,
    setPomodoroPhase,
    setPomodoroCompletedPhase,
    saveAndStartBreak,
    skipPomodoroBreak,
    startPomodoroBreak,
    setIsFocusModeOpen,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    resetTimer,
    restoreTimerSession,
    clearPersistedTimer,
    sessions,
    refetchSessions,
    addSession,
    currentNotes,
    triggerXpEarned,
    triggerLevelUp,
    showRankSettlement,
    activeTaskId,
    hasHydrated,
    isLoadingSessions,
    isRemoteTransitioning,
    isRemoteSession,
    isUltraStrict,
    setIsUltraStrict,
    syncTimerMode,
  } = useStudy();

  const subjectList = Array.isArray(subjects) ? subjects : [];
  const activeSubjects = useMemo(() => subjectList.filter(sub => sub && !sub.is_archived), [subjectList]);

  const [isManageSubjectsOpen, setIsManageSubjectsOpen] = useState(false);
  const isSubjectModalOpen = isManageSubjectsOpen;
  const setIsSubjectModalOpen = setIsManageSubjectsOpen;
  const {
    ambientSound,
    ambientVolume,
    isLoading: isAmbientLoading,
    loadingSound: ambientLoadingSound,
    selectAtmosphere,
    setVolume: setAmbientVolume,
    activeOption: activeAtmosphereOption,
    options: atmosphereOptions,
  } = useAtmosphere();
  const [isAmbientMenuOpen, setIsAmbientMenuOpen] = useState(false);
  const [customCountdownInput, setCustomCountdownInput] = useState("");
  const [isEditingCountdown, setIsEditingCountdown] = useState(false);

  const handleAmbientChange = (type: AmbientSoundType | 'none') => {
    selectAtmosphere(type);
  };

  const handleVolumeChange = (vol: number) => {
    setAmbientVolume(vol);
  };

  // Strict Mode State & Background Enforcement (Strictly Native Android Only)
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStrictMode, setIsStrictMode] = useState(false);
  const [isBlockShortsReels, setIsBlockShortsReels] = useState(false);
  const [allowedApps, setAllowedApps] = useState<string[]>([]);
  const [isAllowedAppsModalOpen, setIsAllowedAppsModalOpen] = useState(false);
  const [isStrictConfigOpen, setIsStrictConfigOpen] = useState(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [isStrictWarningModalOpen, setIsStrictWarningModalOpen] = useState(false);
  const pendingStartSubjectIdRef = useRef<string | null>(null);
  const [hasUsagePerm, setHasUsagePerm] = useState(false);
  const [hasOverlayPerm, setHasOverlayPerm] = useState(false);
  const [hasAccessibilityPerm, setHasAccessibilityPerm] = useState(false);

  // Optional Timer Alarm state for Countdown, Ultra Strict & Pomodoro modes
  const [isAlarmEnabled, setIsAlarmEnabled] = useState<boolean>(() => loadTimerAlarmEnabled());
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  const [alarmModalData, setAlarmModalData] = useState<{
    mode: 'countdown' | 'pomodoro';
    phase?: 'work' | 'break';
    isUltraStrict?: boolean;
    subjectName?: string;
  } | null>(null);

  useEffect(() => {
    const handleAlarmChanged = (e: Event) => {
      const custom = e as CustomEvent<{ enabled: boolean }>;
      if (typeof custom.detail?.enabled === 'boolean') {
        setIsAlarmEnabled(custom.detail.enabled);
      }
    };
    window.addEventListener('studyio_timer_alarm_changed', handleAlarmChanged);
    return () => window.removeEventListener('studyio_timer_alarm_changed', handleAlarmChanged);
  }, []);

  const isStudyingRef = useRef(isStudying);
  isStudyingRef.current = isStudying;
  const isRemoteSessionRef = useRef(isRemoteSession);
  isRemoteSessionRef.current = isRemoteSession;
  const isStrictModeRef = useRef(isStrictMode);
  isStrictModeRef.current = isStrictMode;
  const isUltraStrictRef = useRef(isUltraStrict);
  isUltraStrictRef.current = isUltraStrict;
  const isBlockShortsReelsRef = useRef(isBlockShortsReels);
  isBlockShortsReelsRef.current = isBlockShortsReels;
  const allowedAppsRef = useRef(allowedApps);
  allowedAppsRef.current = allowedApps;

  useEffect(() => {
    const supported = isStrictModeSupported();
    setIsAndroid(supported);
    if (supported) {
      setIsStrictMode(loadStrictModeEnabled());
      const ultra = loadUltraStrictEnabled();
      setIsUltraStrict(ultra);
      if (ultra) {
        setTimerMode('countdown');
      }
      setAllowedApps(loadAllowedApps());
      setIsBlockShortsReels(loadBlockShortsReelsEnabled());
    }
  }, []);

  // Sync state to native SharedPreferences and live Foreground Service
  // When a session is running remotely from desktop (isRemoteSession), Strict Mode is safely bypassed on the phone!
  useEffect(() => {
    if (isAndroid) {
      StrictMode.hasUsagePermission().then(({ granted }) => setHasUsagePerm(granted)).catch(() => { });
      StrictMode.hasOverlayPermission().then(({ granted }) => setHasOverlayPerm(granted)).catch(() => { });
      AccessibilityBlocker.isServiceEnabled().then((enabled) => setHasAccessibilityPerm(enabled)).catch(() => { });
      StrictMode.syncStrictConfig({
        enabled: isStrictMode && !isRemoteSession,
        allowedPackages: allowedApps,
        isUltraStrict: isUltraStrict && !isRemoteSession,
      }).catch(() => { });
    }
  }, [isAndroid, isStrictMode, allowedApps, isUltraStrict, isRemoteSession]);

  // Hardware Android Back Button: dismiss any open timer modal before leaving tab or exiting app
  useEffect(() => {
    const hasAnyTimerModal = Boolean(
      isAllowedAppsModalOpen ||
      isPermissionModalOpen ||
      isStrictWarningModalOpen ||
      isStrictConfigOpen ||
      isEditingCountdown ||
      isManageSubjectsOpen
    );
    if (!hasAnyTimerModal) return;

    return registerBackButtonHandler(() => {
      if (isAllowedAppsModalOpen) {
        setIsAllowedAppsModalOpen(false);
        return true;
      }
      if (isPermissionModalOpen) {
        setIsPermissionModalOpen(false);
        return true;
      }
      if (isStrictWarningModalOpen) {
        setIsStrictWarningModalOpen(false);
        return true;
      }
      if (isStrictConfigOpen) {
        setIsStrictConfigOpen(false);
        return true;
      }
      if (isEditingCountdown) {
        setIsEditingCountdown(false);
        return true;
      }
      if (isManageSubjectsOpen) {
        setIsManageSubjectsOpen(false);
        return true;
      }
      return false;
    });
  }, [
    isAllowedAppsModalOpen,
    isPermissionModalOpen,
    isStrictWarningModalOpen,
    isStrictConfigOpen,
    isEditingCountdown,
    isManageSubjectsOpen,
  ]);

  const handleToggleStrictMode = async () => {
    if (isStudying) {
      toast('Strict Mode cannot be changed during active focus sessions', { icon: '🔒' });
      return;
    }
    if (isStrictMode) {
      setIsStrictMode(false);
      saveStrictModeEnabled(false);
      setIsUltraStrict(false);
      saveUltraStrictEnabled(false);
      triggerHaptic('light');
    } else {
      triggerHaptic('medium');
      try {
        const { granted } = await StrictMode.hasUsagePermission();
        if (!granted) {
          setIsPermissionModalOpen(true);
        } else {
          setIsStrictMode(true);
          saveStrictModeEnabled(true);
          const currentAllowed = loadAllowedApps();
          if (currentAllowed.length === 0) {
            setIsAllowedAppsModalOpen(true);
          }
        }
      } catch (e) {
        setIsPermissionModalOpen(true);
      }
    }
  };

  const handleToggleUltraStrict = async () => {
    if (isStudying) {
      toast('Ultra Strict Mode cannot be changed during active focus sessions', { icon: '🔒' });
      return;
    }
    const nextUltra = !isUltraStrict;
    setIsUltraStrict(nextUltra);
    saveUltraStrictEnabled(nextUltra);
    if (nextUltra) {
      setIsStrictMode(true);
      saveStrictModeEnabled(true);
      setTimerMode('countdown');
      syncTimerMode('countdown', true, countdownTarget);
      try {
        const { granted } = await StrictMode.hasUsagePermission();
        if (!granted) {
          setIsPermissionModalOpen(true);
        }
      } catch {}
      toast.success('Ultra Strict enabled: Countdown mode only', { icon: '⚡' });
    } else {
      syncTimerMode(timerMode, false);
      toast('Ultra Strict disabled');
    }
    triggerHaptic('medium');
  };

  // Enforce Countdown mode whenever Ultra Strict is enabled and timer is idle
  useEffect(() => {
    if (isUltraStrict && timerMode !== 'countdown' && !isStudying) {
      setTimerMode('countdown');
    }
  }, [isUltraStrict, timerMode, isStudying, setTimerMode]);

  const handleRequestPermission = async () => {
    try {
      await StrictMode.requestUsagePermission();
      setIsPermissionModalOpen(false);
    } catch (e) {
      console.warn('[StrictMode] request permission failed:', e);
    }
  };

  const handleRequestOverlayPermission = async () => {
    try {
      await StrictMode.requestOverlayPermission();
    } catch (e) {
      console.warn('[StrictMode] request overlay permission failed:', e);
    }
  };

  const handleToggleBlockShortsReels = async () => {
    if (isStudying) {
      toast('Reels & Shorts Blocker cannot be changed during active focus sessions', { icon: '🔒' });
      return;
    }
    const nextVal = !isBlockShortsReels;
    setIsBlockShortsReels(nextVal);
    saveBlockShortsReelsEnabled(nextVal);
    triggerHaptic('medium');

    if (nextVal) {
      try {
        const enabled = await AccessibilityBlocker.isServiceEnabled();
        setHasAccessibilityPerm(enabled);
        if (!enabled) {
          toast('Please enable Study.io Accessibility Service in Android Settings', { icon: '⚙️' });
          await AccessibilityBlocker.openSettings();
        } else {
          toast.success('Reels & Shorts Blocker enabled', { icon: '🛡️' });
        }
      } catch {
        toast('Accessibility Service check failed', { icon: '⚠️' });
      }
    } else {
      toast('Reels & Shorts Blocker disabled');
    }
  };

  const handleRequestAccessibilityPermission = async () => {
    try {
      await AccessibilityBlocker.openSettings();
    } catch (e) {
      console.warn('[AccessibilityBlocker] openSettings failed:', e);
    }
  };

  // Re-verify permission on window focus if permission modal was waiting
  useEffect(() => {
    if (!isAndroid) return;
    const handleFocus = async () => {
      try {
        const { granted: usageGranted } = await StrictMode.hasUsagePermission();
        setHasUsagePerm(usageGranted);
        const { granted: overlayGranted } = await StrictMode.hasOverlayPermission();
        setHasOverlayPerm(overlayGranted);
        const accessibilityEnabled = await AccessibilityBlocker.isServiceEnabled();
        setHasAccessibilityPerm(accessibilityEnabled);

        if (!isStrictModeRef.current && usageGranted && isPermissionModalOpen) {
          setIsPermissionModalOpen(false);
          setIsStrictMode(true);
          saveStrictModeEnabled(true);
          if (allowedAppsRef.current.length === 0) {
            setIsAllowedAppsModalOpen(true);
          }
        }
      } catch { }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isAndroid, isPermissionModalOpen]);

  // Enable / disable Accessibility Reels & Shorts Blocker based on active study session
  // Bypassed when the session was started remotely from PC/desktop
  useEffect(() => {
    if (!isAndroid) return;
    if (isStudying && isBlockShortsReels && !isRemoteSession) {
      AccessibilityBlocker.enable().catch(() => {});
    } else {
      AccessibilityBlocker.disable().catch(() => {});
    }
  }, [isStudying, isBlockShortsReels, isAndroid, isRemoteSession]);

  // Background app monitoring via Capacitor App listener
  useEffect(() => {
    if (!isAndroid) return;

    let appListenerHandle: { remove: () => Promise<void> } | null = null;

    const checkForegroundViolation = async () => {
      if (!isStudyingRef.current || !isStrictModeRef.current || isRemoteSessionRef.current) return;
      try {
        const fg = await StrictMode.getForegroundApp();
        if (
          fg.packageName &&
          !fg.isSystemOrLauncher &&
          fg.packageName !== 'com.studyio.app'
        ) {
          const allowed = allowedAppsRef.current;
          const isBlocked = !allowed.includes(fg.packageName);
          if (isBlocked) {
            // Blocked app violation detected while in background!
            triggerHaptic('heavy');
            // Trigger native full-screen BlockedAppActivity immediately!
            StrictMode.blockAppDirect({
              packageName: fg.packageName,
              name: fg.name || fg.packageName,
              isUltraStrict: isUltraStrictRef.current,
            }).catch(() => { });
          }
        }
      } catch (err) {
        console.warn('[StrictMode] App check error:', err);
      }
    };

    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive && isStudyingRef.current && isStrictModeRef.current && !isRemoteSessionRef.current) {
        // App went to background: check after 400ms & 800ms
        setTimeout(checkForegroundViolation, 400);
        setTimeout(checkForegroundViolation, 800);
      }
      // When returning to Study.io (isActive === true), do NOT show any alert modal
    }).then((handle) => {
      appListenerHandle = handle;
    }).catch(() => { });

    return () => {
      appListenerHandle?.remove().catch(() => { });
    };
  }, [isAndroid]);

  const [showDropdown, setShowDropdown] = useState(false);

  // Client-Side Background Sync (Anti-Tamper & Sleep Reconcile):
  // When mobile WebView or browser tab awakens from sleep/background, fetch authoritative
  // server time from Supabase/API and immediately reconcile the timer instead of relying on paused setInterval.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilitySync = async () => {
      if (document.visibilityState === 'visible' && isStudying && !isPaused) {
        console.log('[TIMER Background Sync]: App returned to foreground, fetching server time from Supabase/API...');
        try {
          const serverTime = await fetchAuthoritativeServerTime();
          if (syncTimerWithServerTime) {
            await syncTimerWithServerTime(serverTime);
          }
        } catch (syncErr) {
          console.warn('[TIMER Background Sync]: Error syncing server time:', syncErr);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilitySync);
    window.addEventListener('focus', handleVisibilitySync);
    window.addEventListener('resume' as any, handleVisibilitySync);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilitySync);
      window.removeEventListener('focus', handleVisibilitySync);
      window.removeEventListener('resume' as any, handleVisibilitySync);
    };
  }, [isStudying, isPaused, syncTimerWithServerTime]);
  const [overviewView, setOverviewView] = useState<'today' | 'yesterday'>('today');
  const [isSaving, setIsSaving] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined') {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Internet connected. Session can be stopped & saved.', {
        id: 'online-toast',
        duration: 3000,
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.error('Network disconnected. Internet connection required to stop & save.', {
        id: 'offline-toast',
        duration: 4000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);
  const [subjectWarning, setSubjectWarning] = useState(false);
  const [isCountdownCompleted, setIsCountdownCompleted] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('studyio_timer_countdown_completed') === 'true';
      } catch { }
    }
    return false;
  });
  const [isCountdownHalfwayNotified, setIsCountdownHalfwayNotified] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        if (localStorage.getItem('studyio_timer_countdown_halfway_notified') === 'true') {
          return true;
        }
        const savedSeconds = parseInt(localStorage.getItem('studyio_timer_seconds') || '0', 10);
        const savedTarget = parseInt(localStorage.getItem('studyio_timer_countdown_target') || '0', 10);
        if (savedTarget > 0 && savedSeconds >= Math.floor(savedTarget / 2)) {
          return true;
        }
      } catch { }
    }
    return false;
  });

  // Release Ultra Strict phone lockdown as soon as countdown completes
  useEffect(() => {
    if (isCountdownCompleted && isAndroid && isUltraStrict) {
      StrictMode.syncStrictConfig({
        enabled: isStrictMode,
        allowedPackages: allowedApps,
        isUltraStrict: false,
      }).catch(() => { });
    }
  }, [isCountdownCompleted, isAndroid, isUltraStrict, isStrictMode, allowedApps]);

  // Cross-device synchronization: when session is saved on another device, dismiss countdown complete & alarms
  useEffect(() => {
    const handleRemoteSessionSaved = () => {
      setIsCountdownCompleted(false);
      setIsCountdownHalfwayNotified(false);
      try {
        localStorage.removeItem('studyio_timer_countdown_completed');
        localStorage.removeItem('studyio_timer_countdown_halfway_notified');
      } catch { }
      soundFx.stopTimerAlarm();
      setIsAlarmRinging(false);
      setAlarmModalData(null);
      refetchSessions();
      toast('Session saved on another device ✅', {
        id: 'remote-session-saved',
        duration: 4000,
        icon: '✅',
      });
    };

    window.addEventListener('studyio_remote_session_saved', handleRemoteSessionSaved);
    return () => {
      window.removeEventListener('studyio_remote_session_saved', handleRemoteSessionSaved);
    };
  }, [refetchSessions]);

  // Safe handler to open Subject Manager / Add Subject
  const handleOpenSubjectManager = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowDropdown(false);
    setIsManageSubjectsOpen(true);
  }, []);

  // Lock the motivation quote in useState on initial load so it NEVER changes while timer is running
  const [lockedEmptyQuote] = useState(() => {
    return EMPTY_STATE_QUOTES[Math.floor(Math.random() * EMPTY_STATE_QUOTES.length)];
  });

  // Auto-dismiss subject warning after 5 seconds
  useEffect(() => {
    if (!subjectWarning) return;
    const timer = setTimeout(() => {
      setSubjectWarning(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [subjectWarning]);

  // Maintain a fresh ref to the currently active subject to prevent stale closures in timer callbacks
  const activeSubjectRef = useRef<Subject | null>(selectedSubject);
  useEffect(() => {
    const sub =
      (Array.isArray(subjects) ? subjects : []).find(s => s && s.id === selectedSubjectId && !s.is_archived) ||
      selectedSubject ||
      null;
    activeSubjectRef.current = sub;
  }, [selectedSubject, selectedSubjectId, subjects]);

  // Streamlined control handlers cleanly controlling synchronized StudyContext timer engine
  const handleStartSession = useCallback(() => {
    setIsCountdownCompleted(false);
    setIsCountdownHalfwayNotified(false);
    try {
      localStorage.removeItem('studyio_timer_countdown_completed');
      localStorage.removeItem('studyio_timer_countdown_halfway_notified');
    } catch { }
    const activeSub =
      activeSubjectRef.current ||
      selectedSubject ||
      activeSubjects.find(s => s && s.id === selectedSubjectId) ||
      null;

    if (!activeSub?.id || (activeSub.name || '').trim().toLowerCase() === 'unassigned') {
      alert("Please choose a subject before recording focus time.");
      setSubjectWarning(true);
      if (activeSubjects.length === 0) {
        handleOpenSubjectManager();
      } else {
        setShowDropdown(true);
      }
      return;
    }
    setSubjectWarning(false);
    setShowRecoveryBanner(false);

    // Warning confirmation prompt before starting Countdown with Strict Mode / Ultra Strict Mode
    if (isAndroid && (isStrictMode || isUltraStrict) && timerMode === 'countdown') {
      pendingStartSubjectIdRef.current = activeSub.id;
      hapticMedium();
      setIsStrictWarningModalOpen(true);
      return;
    }

    hapticMedium();
    if (isAndroid) {
      StrictMode.syncStrictConfig({
        enabled: isStrictMode,
        allowedPackages: allowedApps,
        isUltraStrict: isUltraStrict,
      }).catch(() => { });
    }
    startTimer(activeSub.id);
  }, [activeSubjects, selectedSubject, selectedSubjectId, startTimer, handleOpenSubjectManager, isAndroid, isStrictMode, allowedApps, isUltraStrict, timerMode]);

  const handleConfirmStrictCountdown = useCallback(async () => {
    const subId = pendingStartSubjectIdRef.current || selectedSubject?.id;
    setIsStrictWarningModalOpen(false);
    if (!subId) return;

    if (isAndroid) {
      try {
        const { granted } = await StrictMode.hasUsagePermission();
        if (!granted) {
          setIsPermissionModalOpen(true);
          return;
        }
      } catch { }

      StrictMode.syncStrictConfig({
        enabled: isStrictMode,
        allowedPackages: allowedApps,
        isUltraStrict: isUltraStrict,
      }).catch(() => { });
    }
    hapticMedium();
    startTimer(subId);
  }, [selectedSubject?.id, isAndroid, isStrictMode, allowedApps, isUltraStrict, startTimer]);

  const handleCancelStrictCountdown = useCallback(() => {
    setIsStrictWarningModalOpen(false);
    pendingStartSubjectIdRef.current = null;
  }, []);

  const handlePause = useCallback(() => {
    hapticMedium();
    pauseTimer();
  }, [pauseTimer]);

  const handleResume = useCallback(() => {
    setShowRecoveryBanner(false);
    hapticMedium();
    resumeTimer();
  }, [resumeTimer]);

  const handleReset = useCallback(() => {
    hapticMedium();
    setIsCountdownCompleted(false);
    setIsCountdownHalfwayNotified(false);
    try {
      localStorage.removeItem('studyio_timer_countdown_completed');
      localStorage.removeItem('studyio_timer_countdown_halfway_notified');
    } catch { }
    resetTimer();
    clearPersistedTimer();
    setShowRecoveryBanner(false);
  }, [resetTimer, clearPersistedTimer]);

  const handleStopAndSave = useCallback(async (durationOverride?: number | React.MouseEvent) => {
    toast.dismiss();
    if (isSaving) return;

    // Strict offline gate: User cannot stop and save when network is disconnected
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('Network connection required to save session. Please reconnect.', {
        id: 'offline-stop-blocked',
        duration: 4000,
      });
      return;
    }

    triggerHaptic('medium');

    // Anti-Exploit: Immediately purge timer seconds cache to prevent ghost resurrects
    try {
      localStorage.removeItem('studyio_timer_seconds');
      localStorage.removeItem('timer-start-time');
      localStorage.removeItem('studyio_timer_start_time');
      localStorage.removeItem('studyio_timer_countdown_completed');
      localStorage.removeItem('studyio_timer_countdown_halfway_notified');
    } catch { }

    // 1. Prevent race conditions: Capture exact real-time duration BEFORE mutating any state or resetting timer display
    const rawSeconds = isRunning && startTimeRef?.current
      ? Math.max(elapsedSeconds, Math.floor((Date.now() - startTimeRef.current) / 1000))
      : elapsedSeconds;

    const seconds = typeof durationOverride === 'number'
      ? durationOverride
      : (isCountdownCompleted && countdownTarget > 0 ? countdownTarget : rawSeconds);

    // Direct, fresh capture of active subject via ref and state/storage
    let activeSubject =
      activeSubjectRef.current ||
      selectedSubject ||
      activeSubjects.find(s => s && s.id === selectedSubjectId) ||
      subjectList.find(s => s && s.id === selectedSubjectId) ||
      null;


    if (!activeSubject || !activeSubject.id || (activeSubject.name || '').trim().toLowerCase() === 'unassigned') {
      alert("Please choose a subject before recording focus time.");
      setSubjectWarning(true);
      setShowDropdown(true);
      return;
    }

    const selectedSub = activeSubject;
    const isUuid = (id?: string | null) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let subjectId = isUuid(selectedSub.id) ? selectedSub.id : null;
    const currentMode = timerMode || 'stopwatch';
    const notesToSave = currentNotes?.trim() || null;
    const now = new Date();
    const endedAt = now.toISOString();
    const startedAt = new Date(now.getTime() - seconds * 1000).toISOString();

    // Handle non-positive durations (allow any duration > 0 including short test sessions)
    if (seconds <= 0) {
      resetTimer();
      clearPersistedTimer();
      setShowRecoveryBanner(false);
      return;
    }

    setIsSaving(true);

    try {
      const supabase = getSupabase();

      // 2. Ensure active user is present via supabase.auth.getUser() or useAuth context
      let activeUser: any = user || null;
      if (supabase) {
        try {
          const authRes = await supabase.auth.getUser();
          if (!authRes.error && authRes.data?.user) {
            activeUser = authRes.data.user;
          }
        } catch (err) {
          console.warn('Error fetching active user via supabase.auth.getUser():', err);
        }
      }
      const currentUserId = activeUser?.id || user?.id;

      // If logged in but subjectId is not a UUID (e.g. local subject), resolve UUID from Supabase subjects table
      if (supabase && currentUserId && !subjectId && selectedSub.name) {
        try {
          const { data: matchedSub } = await supabase
            .from('subjects')
            .select('id')
            .eq('user_id', currentUserId)
            .ilike('name', selectedSub.name.trim())
            .maybeSingle();

          if (matchedSub?.id) {
            subjectId = matchedSub.id;
          } else {
            const { data: createdSub } = await supabase
              .from('subjects')
              .insert({
                user_id: currentUserId,
                name: selectedSub.name.trim(),
                color: selectedSub.color || '#10B981',
                daily_goal_minutes: selectedSub.daily_goal_minutes || 60,
              })
              .select('id')
              .single();
            if (createdSub?.id) {
              subjectId = createdSub.id;
            }
          }
        } catch (err) {
          console.warn('Could not resolve or create subject in Supabase:', err);
        }
      }

      const sessionPayload = {
        user_id: currentUserId,
        subject_id: subjectId || selectedSub?.id || null,
        duration_seconds: seconds,
        started_at: startedAt,
        ended_at: endedAt,
        notes: notesToSave && notesToSave.trim().length > 0 ? notesToSave.trim() : null,
        mode: currentMode || 'stopwatch',
      };

      console.log("Saving focus session payload:", sessionPayload);
      console.log('[Timer Write: StudyTimer handleStopAndSave]', {
        timestamp: new Date().toISOString(),
        final_duration_saved: seconds,
        sessionPayload,
      });

      const currentClientSessionId = clientSessionIdRef?.current;
      // Pre-flight check: if this session was already saved into sessions list locally
      if (currentClientSessionId && sessions.some(s => s.client_session_id === currentClientSessionId)) {
        console.warn('[handleStopAndSave] Session already recorded in local sessions state:', currentClientSessionId);
        toast('Session was already saved on another device ✅', { id: 'session-already-saved', duration: 4000 });
        resetTimer();
        clearPersistedTimer();
        if (clientSessionIdRef) clientSessionIdRef.current = null;
        setIsCountdownCompleted(false);
        setIsCountdownHalfwayNotified(false);
        try {
          localStorage.removeItem('studyio_timer_countdown_completed');
          localStorage.removeItem('studyio_timer_countdown_halfway_notified');
        } catch { }
        soundFx.stopTimerAlarm();
        setIsAlarmRinging(false);
        setAlarmModalData(null);
        await refetchSessions();
        return;
      }

      // 3. Save via server-side validation to enforce server-calculated duration and 12h/24h caps
      let insertedRecordId: string | null = null;
      let isServerValidated = false;
      let finalDurationSeconds = Math.min(seconds, 43200); // Strict 12-hour single session cap
      let finalStartedAt = startedAt;
      let finalEndedAt = endedAt;

      if (currentUserId) {
        try {
          const plannedDuration =
            currentMode === 'countdown'
              ? countdownTarget
              : (currentMode === 'pomodoro' ? pomodoroWorkDuration : null);

          const saveResult = await saveValidatedSession({
            started_at: startedAt,
            ended_at: endedAt,
            subject_id: subjectId,
            notes: notesToSave,
            mode: currentMode,
            planned_duration_seconds: plannedDuration,
            client_session_id: currentClientSessionId || undefined,
          });

          if (saveResult.success) {
            // Anti-Exploit: Check for idempotent duplicate save across multiple devices or retry
            if (saveResult.isDuplicate || saveResult.reason?.toLowerCase().includes('already recorded')) {
              console.warn('[handleStopAndSave] Duplicate session detected by server idempotency:', saveResult);
              toast('Session was already saved on another device ✅', { id: 'session-already-saved', duration: 4000 });
              resetTimer();
              clearPersistedTimer();
              if (clientSessionIdRef) clientSessionIdRef.current = null;
              setIsCountdownCompleted(false);
              setIsCountdownHalfwayNotified(false);
              try {
                localStorage.removeItem('studyio_timer_countdown_completed');
                localStorage.removeItem('studyio_timer_countdown_halfway_notified');
              } catch { }
              setShowRecoveryBanner(false);
              soundFx.stopTimerAlarm();
              setIsAlarmRinging(false);
              setAlarmModalData(null);
              await refetchSessions();
              return;
            }

            isServerValidated = true;
            insertedRecordId = saveResult.session?.id || null;
            if (typeof saveResult.calculatedSeconds === 'number') {
              finalDurationSeconds = saveResult.calculatedSeconds;
            }
            if (saveResult.session?.started_at) {
              finalStartedAt = saveResult.session.started_at;
            }
            if (saveResult.session?.ended_at) {
              finalEndedAt = saveResult.session.ended_at;
            }
            console.log('Session validated and persisted via server:', saveResult);
          } else {
            console.warn('Server session validation returned error, attempting direct client fallback:', saveResult.error);
            if (supabase) {
              const { data: directData, error: directError } = await supabase
                .from('study_sessions')
                .insert([{
                  user_id: currentUserId,
                  subject_id: subjectId,
                  duration_seconds: finalDurationSeconds,
                  started_at: finalStartedAt,
                  ended_at: finalEndedAt,
                  notes: notesToSave,
                  mode: currentMode,
                  client_session_id: currentClientSessionId || undefined,
                }])
                .select()
                .single();

              if (!directError && directData) {
                isServerValidated = true;
                insertedRecordId = directData.id;
                console.log('Session saved via StudyTimer direct Supabase fallback:', directData);
              } else if (directError) {
                console.error('StudyTimer direct Supabase insert error:', directError);
                if (directError.code === '23505' || directError.message?.toLowerCase().includes('duplicate key')) {
                  toast('Session was already saved on another device ✅', { id: 'session-already-saved', duration: 4000 });
                  resetTimer();
                  clearPersistedTimer();
                  if (clientSessionIdRef) clientSessionIdRef.current = null;
                  setIsCountdownCompleted(false);
                  setIsCountdownHalfwayNotified(false);
                  try {
                    localStorage.removeItem('studyio_timer_countdown_completed');
                    localStorage.removeItem('studyio_timer_countdown_halfway_notified');
                  } catch { }
                  setShowRecoveryBanner(false);
                  soundFx.stopTimerAlarm();
                  setIsAlarmRinging(false);
                  setAlarmModalData(null);
                  await refetchSessions();
                  return;
                }
              }
            }
          }
        } catch (err) {
          console.error('Exception during Supabase study_sessions validated save:', err);
          if (supabase && currentUserId) {
            try {
              const { data: directData, error: directError } = await supabase
                .from('study_sessions')
                .insert([{
                  user_id: currentUserId,
                  subject_id: subjectId,
                  duration_seconds: finalDurationSeconds,
                  started_at: finalStartedAt,
                  ended_at: finalEndedAt,
                  notes: notesToSave,
                  mode: currentMode,
                  client_session_id: currentClientSessionId || undefined,
                }])
                .select()
                .single();

              if (!directError && directData) {
                isServerValidated = true;
                insertedRecordId = directData.id;
              }
            } catch { }
          }
        }
      }

      // 4. Immediately append the new session to local state so Project Time Distribution and stats update in real time
      const newSession: StudySession = {
        id: insertedRecordId || `sess-${Date.now()}`,
        client_session_id: currentClientSessionId || undefined,
        userId: sessionPayload.user_id || 'guest',
        userName: user?.displayName || 'Scholar',
        userAvatar: user?.avatarUrl,
        subjectId: sessionPayload.subject_id || selectedSub.id,
        subjectName: selectedSub.name || 'General Study',
        subjectColor: selectedSub.color || '#10b981',
        subject_name: selectedSub.name || 'General Study',
        startTime: finalStartedAt,
        endTime: finalEndedAt,
        durationSeconds: finalDurationSeconds,
        notes: notesToSave || '',
        mode: currentMode,
        createdAt: new Date().toISOString(),
      };

      // 4. Immediately backup to localStorage cache and append to local state
      if (typeof window !== 'undefined') {
        try {
          const uid = sessionPayload.user_id || activeUser?.id || user?.id;
          if (uid) {
            const rawStored = localStorage.getItem(`study_io_sessions_${uid}`) || localStorage.getItem('studypulse_sessions');
            const parsedStored: StudySession[] = rawStored ? JSON.parse(rawStored) : [];
            const updated = [newSession, ...parsedStored.filter(s => s.id !== newSession.id)];
            localStorage.setItem(`study_io_sessions_${uid}`, JSON.stringify(updated));
            localStorage.setItem('studypulse_sessions', JSON.stringify(updated));
          }
        } catch { }
      }

      // Immediately update local Daily Overview and Analytics stats state
      addSession(newSession);

      const todayStart = getLocalStartOfDay(new Date());
      const todayEnd = getLocalEndOfDay(new Date());
      const allSessionsWithNew = [newSession, ...sessions.filter(s => s.id !== newSession.id)];
      const totalToday = allSessionsWithNew
        .filter(s => {
          const t = new Date(s.startTime).getTime();
          return t >= todayStart.getTime() && t <= todayEnd.getTime();
        })
        .reduce((sum, s) => sum + s.durationSeconds, 0);

      const dailyGoalSeconds = (user?.dailyGoalHours || 2) * 3600;
      if (totalToday >= dailyGoalSeconds && totalToday - finalDurationSeconds < dailyGoalSeconds) {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.5 },
        });
      }

      // Free Fire RP Calculation & Post-Match Rank Settlement Trigger
      const todayString = getLocalDateString(new Date());
      let localStreakBonusDate: string | null = null;
      try {
        localStreakBonusDate = localStorage.getItem('studypulse_last_streak_bonus_date');
      } catch { }
      const lastStreakBonusDate = user?.last_streak_bonus_date || user?.lastStreakBonusDate || localStreakBonusDate;
      const hasStreakOrGoal = (user?.streakDays || 0) > 0 || totalToday >= dailyGoalSeconds;
      const hasCompletedTask = Boolean(activeTaskId);
      const rpBreakdown = calculateSessionRP(finalDurationSeconds, {
        hasStreakOrGoal,
        hasCompletedTask,
        lastStreakBonusDate,
        todayString,
      });

      const { seasonRp: liveRp, startingRp: effectiveBaseRp } = resolveLiveSeasonStats(user, sessions);
      const prevRP = liveRp;
      // Competitive Anti-Exploit: Only award RP and rank tier advancement if verified by server (or guest mode)
      const isEligibleForRP = !activeUser?.id || isServerValidated;
      const gainedRP = isEligibleForRP ? rpBreakdown.totalGained : 0;
      const newRP = prevRP + gainedRP;

      // XP Calculation & Anti-Exploit Rules:
      // Award rate: 10 XP per full minute of recorded focus time: Math.floor(duration_seconds / 60) * 10
      // Duration gate: If session duration is under 60 seconds (< 1 min), earned focus XP is strictly 0.
      // Daily consistency streak bonus (+100 XP): First valid session (>= 60s) of the day
      const isValidSession = finalDurationSeconds >= 60;
      const focusXP = isValidSession ? Math.floor(finalDurationSeconds / 60) * 10 : 0;
      const appliedStreakBonus = isValidSession && (lastStreakBonusDate !== todayString);
      const totalEarnedXP = focusXP + (appliedStreakBonus ? 100 : 0);

      // Permanently increment lifetime_xp (never resets across seasons)
      const prevLifetimeXP = Number(user?.lifetime_xp ?? user?.lifetimeXp ?? user?.xp ?? 0);
      const newLifetimeXP = prevLifetimeXP + totalEarnedXP;
      const newLevel = getLevelFromLifetimeXP(newLifetimeXP);
      const newScholarTitle = getScholarTitle(newLevel);

      // Trigger celebratory XP gain notification
      if (totalEarnedXP > 0) {
        const mins = Math.floor(finalDurationSeconds / 60);
        const reason = appliedStreakBonus
          ? `${mins} min Focus (+100 Daily Streak)`
          : `${mins} min Focus Session`;
        triggerXpEarned(totalEarnedXP, reason, 'focus');
      }

      const prevLevel = getLevelFromLifetimeXP(prevLifetimeXP);
      if (newLevel > prevLevel) {
        triggerLevelUp(prevLevel, newLevel, newScholarTitle);
      }

      // Persist new RP, lifetime XP, level, and streak bonus date in profile
      const profileUpdates: Partial<UserProfile> = {
        seasonRp: Math.round(newRP),
        rp: Math.round(newRP),
        season_base_rp: effectiveBaseRp,
        carryover_rp: effectiveBaseRp,
        rank_title: getRankTier(newRP).name.toUpperCase(),
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
        } catch { }
      }

      updateProfile(profileUpdates);

      // Trigger Free Fire Post-Match Settlement Modal immediately
      showRankSettlement({
        prevRP,
        newRP,
        breakdown: {
          ...rpBreakdown,
          totalGained: gainedRP,
          sessionRP: gainedRP,
          isOfflinePending: Boolean(currentUserId) && !isServerValidated,
        },
        subjectName: selectedSub.name || 'General Study',
        subjectColor: selectedSub.color || '#10b981',
      });

      if (isServerValidated) {
        toast.success('Session saved successfully! 🎉', { id: 'session-saved-success', duration: 3000 });
      }

      // Reset and stop active timer engine (syncs stopped to all devices)
      resetTimer();
      clearPersistedTimer();
      if (clientSessionIdRef) clientSessionIdRef.current = null;
      setIsCountdownCompleted(false);
      setIsCountdownHalfwayNotified(false);
      soundFx.stopTimerAlarm();
      setIsAlarmRinging(false);
      setAlarmModalData(null);
      try {
        localStorage.removeItem('studyio_timer_countdown_completed');
        localStorage.removeItem('studyio_timer_countdown_halfway_notified');
      } catch { }
      setShowRecoveryBanner(false);

      // Explicitly ensure active_sessions is cleared from Supabase
      if (activeUser?.id && supabase) {
        try {
          await supabase.from('active_sessions').delete().eq('user_id', activeUser.id);
        } catch (delErr) {
          console.warn('StudyTimer: Failed to clear active_session on save:', delErr);
        }
      }

      // Invalidate and refetch analytics queries
      if (activeUser?.id) {
        try {
          await refetchSessions();
          if (isPremium) {
            checkGoalReached(finalDurationSeconds);
            await refreshGoals();
          }
        } catch (refetchErr) {
          console.warn('StudyTimer: Background refetch failed:', refetchErr);
        }
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    isRunning,
    startTimeRef,
    clientSessionIdRef,
    syncTimerWithServerTime,
    elapsedSeconds,
    selectedSubject,
    timerMode,
    user,
    currentNotes,
    addSession,
    soundFx,
    sessions,
    resetTimer,
    clearPersistedTimer,
    refetchSessions,
    activeTaskId,
    showRankSettlement,
    updateProfile,
    isPremium,
    checkGoalReached,
    refreshGoals,
    isCountdownCompleted,
    countdownTarget,
  ]);

  // Check if daily focus goal is reached while timer is running
  useEffect(() => {
    if (!isStudying || !isPremium || !goals.dailyMinutes || goals.dailyMinutes <= 0) return;
    const currentTotalSecs = goals.todaySeconds + elapsedSeconds;
    if (currentTotalSecs >= goals.dailyMinutes * 60) {
      checkGoalReached(elapsedSeconds);
    }
  }, [isStudying, isPremium, goals.dailyMinutes, goals.todaySeconds, elapsedSeconds, checkGoalReached]);

  useEffect(() => {
    refetchSessions();
  }, [refetchSessions]);

  // 1. State Persistence Strategy: Persist timer state in localStorage periodically (every 5s or on pause)
  useEffect(() => {
    if (isSaving || !isStudying || elapsedSeconds <= 0) return;
    if (elapsedSeconds % 5 !== 0 && !isPaused) return;
    try {
      localStorage.setItem('studyio_timer_seconds', String(elapsedSeconds));
      const subIdOrName = selectedSubject?.id || selectedSubject?.name || selectedSubjectId;
      if (subIdOrName) {
        localStorage.setItem('studyio_timer_subject', subIdOrName);
      }
      localStorage.setItem('studyio_timer_mode', timerMode || 'stopwatch');
      if (timerMode === 'countdown') {
        localStorage.setItem('studyio_timer_countdown_target', String(countdownTarget));
      } else if (timerMode === 'pomodoro') {
        localStorage.setItem('studyio_timer_pomodoro_phase', pomodoroPhase);
      }
    } catch (e) {
      console.warn('Failed to persist timer state to localStorage:', e);
    }
  }, [isSaving, isStudying, elapsedSeconds, isPaused, selectedSubject, selectedSubjectId, timerMode, countdownTarget, pomodoroPhase]);

  // 2. On Component Mount / Page Load: Check localStorage and recover session in Paused state
  useEffect(() => {
    try {
      const savedSecondsStr = localStorage.getItem('studyio_timer_seconds');
      if (savedSecondsStr) {
        const savedSeconds = parseInt(savedSecondsStr, 10);
        if (!isNaN(savedSeconds) && savedSeconds > 0) {
          const savedSubject = localStorage.getItem('studyio_timer_subject') || undefined;
          const savedMode = localStorage.getItem('studyio_timer_mode') as TimerMode | null;
          const validatedMode = savedMode === 'pomodoro' || savedMode === 'stopwatch' || savedMode === 'countdown' ? savedMode : undefined;

          if (validatedMode === 'countdown') {
            const savedTargetStr = localStorage.getItem('studyio_timer_countdown_target');
            if (savedTargetStr) {
              const savedTarget = parseInt(savedTargetStr, 10);
              if (!isNaN(savedTarget) && savedTarget > 0) {
                setCountdownTarget(savedTarget);
              }
            }
          } else if (validatedMode === 'pomodoro') {
            const savedPhase = localStorage.getItem('studyio_timer_pomodoro_phase') as any;
            if (savedPhase === 'work' || savedPhase === 'shortBreak' || savedPhase === 'longBreak') {
              setPomodoroPhase(savedPhase);
            }
          }

          restoreTimerSession(savedSeconds, validatedMode, savedSubject);
          if (localStorage.getItem('studyio_timer_countdown_completed') !== 'true') {
            setShowRecoveryBanner(true);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to restore timer from localStorage:', e);
    }
  }, [restoreTimerSession]);

  // Auto-dismiss recovery banner after 8 seconds
  useEffect(() => {
    if (!showRecoveryBanner) return;
    const timer = setTimeout(() => {
      setShowRecoveryBanner(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [showRecoveryBanner]);

  // 3. beforeunload event listener: warn user before closing or reloading tab if timer is running or has unsaved progress
  useEffect(() => {
    const hasUnsavedProgress = isRunning || (isStudying && elapsedSeconds > 0) || elapsedSeconds > 0;
    if (!hasUnsavedProgress) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isRunning, isStudying, elapsedSeconds]);

  // Auto-reset halfway notification flag when timer is clean/idle at 0 seconds
  useEffect(() => {
    if (!isStudying && elapsedSeconds === 0 && isCountdownHalfwayNotified) {
      setIsCountdownHalfwayNotified(false);
      try {
        localStorage.removeItem('studyio_timer_countdown_halfway_notified');
      } catch { }
    }
  }, [isStudying, elapsedSeconds, isCountdownHalfwayNotified]);

  // Handle Countdown Halfway Notification
  useEffect(() => {
    if (timerMode !== 'countdown' || !isStudying || isCountdownCompleted || isCountdownHalfwayNotified) {
      return;
    }

    const halfwayTarget = Math.floor(countdownTarget / 2);
    if (halfwayTarget > 0 && elapsedSeconds >= halfwayTarget && elapsedSeconds < countdownTarget) {
      setIsCountdownHalfwayNotified(true);
      try {
        localStorage.setItem('studyio_timer_countdown_halfway_notified', 'true');
      } catch { }

      const remainingSeconds = Math.max(0, countdownTarget - elapsedSeconds);
      const remainingText = formatSeconds(remainingSeconds);

      toast(`Halfway there! ⏳ 50% of your countdown complete (${remainingText} remaining)`, {
        id: 'countdown-halfway-toast',
        icon: '⏱️',
        duration: 5000,
      });

      notify('countdown_halfway', {
        body: `50% of your countdown completed (${remainingText} remaining). Keep up the great focus!`,
      });
    }
  }, [timerMode, isStudying, elapsedSeconds, countdownTarget, isCountdownCompleted, isCountdownHalfwayNotified]);

  // Handle Countdown Completion
  useEffect(() => {
    if (timerMode === 'countdown' && isStudying && elapsedSeconds >= countdownTarget && !isCountdownCompleted) {
      setIsCountdownCompleted(true);
      hapticSuccess();
      try {
        localStorage.setItem('studyio_timer_countdown_completed', 'true');
      } catch { }
      pauseTimer();
      if (isNativeAndroid()) {
        TimerNotification.stop().catch(() => {});
      }
      if (!isNativeAndroid()) {
        notify('countdown_completed', {
          body: 'Your timer is up! Click Save session to record your progress.',
        });
      }
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
      setIsFocusModeOpen(false);
      exitFullscreenSafely();

      // Trigger 5-minute alarm if enabled for countdown / ultra strict
      if (isAlarmEnabled) {
        soundFx.startTimerAlarm(300);
        setIsAlarmRinging(true);
        setAlarmModalData({
          mode: 'countdown',
          isUltraStrict,
          subjectName: selectedSubject?.name,
        });
      }
    }
  }, [timerMode, isStudying, elapsedSeconds, countdownTarget, isCountdownCompleted, pauseTimer, setIsFocusModeOpen, isAlarmEnabled, isUltraStrict, selectedSubject?.name]);

  // Handle Pomodoro Work / Break Completion Alarm
  const prevPomodoroCompletedPhaseRef = useRef<PomodoroCompletedPhase>(null);
  useEffect(() => {
    if (
      timerMode === 'pomodoro' &&
      pomodoroCompletedPhase &&
      pomodoroCompletedPhase !== prevPomodoroCompletedPhaseRef.current
    ) {
      if (isAlarmEnabled) {
        soundFx.startTimerAlarm(300);
        setIsAlarmRinging(true);
        setAlarmModalData({
          mode: 'pomodoro',
          phase: pomodoroCompletedPhase === 'work' ? 'work' : 'break',
          subjectName: selectedSubject?.name,
        });
      }
    }
    prevPomodoroCompletedPhaseRef.current = pomodoroCompletedPhase;
  }, [timerMode, pomodoroCompletedPhase, isAlarmEnabled, selectedSubject?.name]);

  // Alarm action handlers
  const handleDismissAlarm = useCallback(() => {
    soundFx.stopTimerAlarm();
    setIsAlarmRinging(false);
    setAlarmModalData(null);
  }, []);

  const handleSnoozeAlarm = useCallback(() => {
    handleDismissAlarm();
    if (timerMode === 'countdown') {
      const nextTarget = countdownTarget + 300;
      setCountdownTarget(nextTarget);
      setIsCountdownCompleted(false);
      try {
        localStorage.removeItem('studyio_timer_countdown_completed');
      } catch {}
      resumeTimer();
      toast.success('Snoozed for 5 minutes', { icon: '⏰' });
    }
  }, [handleDismissAlarm, timerMode, countdownTarget, setCountdownTarget, resumeTimer]);

  const handleStartBreakFromAlarm = useCallback(() => {
    handleDismissAlarm();
    saveAndStartBreak();
  }, [handleDismissAlarm, saveAndStartBreak]);

  const handleStartFocusFromAlarm = useCallback(() => {
    handleDismissAlarm();
    setPomodoroCompletedPhase(null);
    handleStartSession();
  }, [handleDismissAlarm, setPomodoroCompletedPhase, handleStartSession]);

  // Filtered sessions for Today (browser-local timezone)
  const todaySessions = useMemo(() => {
    return sessions.filter(s => {
      const duration = Number(s.durationSeconds ?? (s as any).duration_seconds ?? (s as any).duration ?? 0);
      if (duration <= 0) return false;
      const rawName = (s.subject_name || s.subjectName || (s as any).subject?.name || (s as any).subject || '').trim().toLowerCase();
      if (rawName === 'unassigned') return false;
      return isSessionToday(s);
    });
  }, [sessions]);

  // Filtered sessions for Yesterday (browser-local timezone)
  const yesterdaySessions = useMemo(() => {
    return sessions.filter(s => {
      const duration = Number(s.durationSeconds ?? (s as any).duration_seconds ?? (s as any).duration ?? 0);
      if (duration <= 0) return false;
      const rawName = (s.subject_name || s.subjectName || (s as any).subject?.name || (s as any).subject || '').trim().toLowerCase();
      if (rawName === 'unassigned') return false;
      return isSessionYesterday(s);
    });
  }, [sessions]);

  // Overview metrics (Today & Yesterday) - calculated strictly from saved sessions, never recalculates during active ticks
  const overviewTodaySeconds = useMemo(() => {
    return todaySessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  }, [todaySessions]);
  const overviewTodaySessionsCount = todaySessions.length;

  const yesterdayTotalSeconds = useMemo(() => {
    return yesterdaySessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  }, [yesterdaySessions]);
  const yesterdaySessionsCount = yesterdaySessions.length;

  // Calculate today's subject study time (completed sessions only to avoid active ticking re-evaluations)
  const todaySubjectSeconds = useMemo(() => {
    if (!selectedSubject?.id) return 0;
    return todaySessions
      .filter(s => s && s.subjectId === selectedSubject.id)
      .reduce((sum, s) => sum + (s?.durationSeconds || 0), 0);
  }, [todaySessions, selectedSubject?.id]);

  const shouldReduceMotion = useReducedMotion() ?? false;

  // Time calculations strictly for display
  let displayTime = formatSeconds(elapsedSeconds);
  let ringPercent = 0;
  let litCount = 0;

  if (timerMode === 'pomodoro') {
    const target = pomodoroPhase === 'work' ? pomodoroWorkDuration : pomodoroBreakDuration;
    const remaining = Math.max(0, target - elapsedSeconds);
    displayTime = formatSeconds(remaining);
    const fraction = target > 0 ? Math.max(0, Math.min(1, remaining / target)) : 0;
    litCount = isStudying ? Math.round(fraction * 60) : 0;
    ringPercent = isStudying ? fraction * 100 : 0;
  } else if (timerMode === 'countdown') {
    const target = countdownTarget;
    const remaining = isCountdownCompleted ? 0 : Math.max(0, target - elapsedSeconds);
    displayTime = formatSeconds(remaining);
    const fraction = target > 0 ? Math.max(0, Math.min(1, remaining / target)) : 0;
    litCount = isCountdownCompleted ? 60 : (isStudying ? Math.round(fraction * 60) : 0);
    ringPercent = isCountdownCompleted ? 100 : (isStudying ? fraction * 100 : 0);
  } else {
    displayTime = formatSeconds(elapsedSeconds);
    litCount = 0;
    ringPercent = 0;
  }

  // Derive status text in sentence case
  let statusText = 'Ready';
  if (isCountdownCompleted) {
    statusText = 'Completed';
  } else if (isUltraStrict) {
    statusText = isStudying ? 'Ultra Focus' : 'Ultra Focus Mode';
  } else if (timerMode === 'pomodoro') {
    if (isPaused) {
      statusText = 'Paused';
    } else if (isStudying) {
      statusText = pomodoroPhase === 'work' ? 'Focus' : 'Break';
    } else {
      statusText = pomodoroPhase === 'work' ? 'Ready' : 'Break time';
    }
  } else if (isPaused) {
    statusText = 'Paused';
  } else if (isStudying) {
    statusText = 'Studying';
  } else {
    statusText = 'Ready';
  }

  const ambientLabel = activeAtmosphereOption?.label || 'Silent';

  // Muted teal-gray (#5A6B6A) for General Focus, neutral slate-gray (#64748B) when no subject is selected
  const subjectColor = !selectedSubject
    ? '#64748B'
    : selectedSubject?.color || '#10B981';

  // Recent 4 sessions (filtering unassigned / null-subject sessions)
  const recentSessions = [...sessions]
    .filter(s => {
      const name = (s.subject_name || s.subjectName || (s as any).subject?.name || (s as any).subject || '').trim().toLowerCase();
      return name && name !== 'unassigned' && (s.subjectId || (s as any).subject_id);
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 4);

  // Dynamic Motivation & Boost Messaging - memoized based on saved sessions and locked quote
  const { primaryBoostMessage, secondaryBoostMessage } = useMemo(() => {
    if (isLoading) {
      return {
        primaryBoostMessage: 'Ready to begin your session.',
        secondaryBoostMessage: 'hover:scale-[1.02]',
      };
    }

    const currentStreak = user?.streakDays ?? 0;
    const focusMinutes = Math.floor(overviewTodaySeconds / 60);
    const sessionCount = todaySessions.length;

    let primary = '';
    let secondary = '';

    // 1. Streak-based evaluation
    if (currentStreak >= 30) {
      primary = "30-day streak! You've basically made this a lifestyle.";
    } else if (currentStreak >= 14) {
      primary = "Two weeks strong — this is becoming a habit now.";
    } else if (currentStreak >= 7) {
      primary = "7-day streak! Consistency is compounding.";
    } else if (currentStreak >= 3) {
      primary = `You're on a ${currentStreak}-day streak — don't break the chain.`;
    } else if (currentStreak === 2) {
      primary = "You're on a 2-day streak — don't break the chain.";
    } else if (currentStreak === 1) {
      primary = "Day 1 logged. Come back tomorrow to start a streak.";
    }

    // 2. Session-length based evaluation (based on completed focus time)
    let sessionMsg = '';
    if (focusMinutes >= 240) {
      sessionMsg = '4+ hours today. Seriously — consider a break.';
    } else if (focusMinutes >= 120) {
      sessionMsg = '2 hours of deep focus already. Great pace.';
    } else if (focusMinutes >= 25) {
      sessionMsg = 'Nice, you completed a full focus block today.';
    }

    // Priority & secondary combining logic
    if (primary) {
      if (sessionMsg) {
        secondary = sessionMsg;
      }
    } else if (sessionMsg) {
      primary = sessionMsg;
    } else if (currentStreak === 0 && overviewTodaySeconds === 0 && sessionCount === 0) {
      // Locked quote evaluated once on page load
      primary = lockedEmptyQuote;
    } else {
      primary = 'No pressure — just hit Start and your streak begins.';
    }

    return {
      primaryBoostMessage: primary,
      secondaryBoostMessage: secondary,
    };
  }, [isLoading, user?.streakDays, overviewTodaySeconds, todaySessions.length, lockedEmptyQuote]);

  return (
    <div className="max-w-[520px] w-full h-full max-h-full mx-auto flex flex-col items-center justify-between px-3 sm:px-6 pt-1 sm:pt-2 pb-1 select-none relative overflow-hidden">
      {/* Subject Manager Modal */}
      {isManageSubjectsOpen && (
        <ErrorBoundary
          fallbackTitle="Subject Manager"
          resetKey={isManageSubjectsOpen}
          onClose={() => setIsManageSubjectsOpen(false)}
        >
          <SubjectManager
            isOpen={isManageSubjectsOpen}
            onClose={() => setIsManageSubjectsOpen(false)}
          />
        </ErrorBoundary>
      )}

      {/* Top Section: Alerts + Mode Selector + Subject Chip */}
      <div className="w-full flex flex-col items-center shrink-0">
        {/* Session Resumed Alert Banner */}
        {showRecoveryBanner && (
          <div className="w-full max-w-sm mb-2 px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 backdrop-blur-md flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-medium">
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Previous session restored (paused)</span>
            </div>
            <button
              onClick={() => setShowRecoveryBanner(false)}
              className="p-1 rounded-lg hover:bg-amber-500/20 text-amber-300 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Subject warning banner */}
        {subjectWarning && (
          <div className="w-full max-w-sm mb-2 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-medium backdrop-blur-md shadow-lg shadow-amber-500/10">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>
                {activeSubjects.length === 0 ? 'Please add a subject before starting.' : 'Please select a subject before starting.'}
              </span>
            </div>
            <button
              onClick={() => setSubjectWarning(false)}
              className="p-1 rounded-lg hover:bg-amber-500/20 text-amber-300 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Focus Block Complete Alert Banner */}
        {pomodoroCompletedPhase === 'work' && (
          <div className="w-full max-w-md mb-2 flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-white/[0.04] border border-white/10 text-xs text-white backdrop-blur-md shadow-lg">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-white" />
              <div>
                <div className="text-sm font-semibold text-white">Focus block complete</div>
                <div className="text-[11px] text-zinc-400">Save session to pause for break, or skip.</div>
              </div>
            </div>
          </div>
        )}

        {/* Break Over Alert Banner */}
        {pomodoroCompletedPhase === 'break' && (
          <div className="w-full max-w-md mb-2 flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-white/[0.04] border border-white/10 text-xs text-white backdrop-blur-md shadow-lg">
            <div className="flex items-center gap-2.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-sm font-semibold text-white">Break over, ready to study?</div>
                <div className="text-[11px] text-zinc-400">Timer switched back to focus mode.</div>
              </div>
            </div>
            <button
              onClick={() => setPomodoroCompletedPhase(null)}
              className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Controls motion container: fades in and rises 8px over 250ms */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full flex flex-col items-center shrink-0"
        >
          {/* Remote Device Active Session Banner */}
          {isRemoteSession && isStudying && (
            <div className="mb-2 flex items-center justify-center animate-in fade-in duration-200">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/25 text-sky-400 text-xs font-hud font-semibold uppercase tracking-wider shadow-[0_0_12px_rgba(56,189,248,0.12)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
                </span>
                <span>Timer active on another device</span>
              </div>
            </div>
          )}

          {/* 1. Mode selector */}
          <div className="relative inline-flex items-center p-1 bg-fg/[0.04] border border-fg/[0.08] rounded-full shadow-card">
            {(['stopwatch', 'countdown', 'pomodoro'] as TimerMode[]).map((mode) => {
              const isActive = timerMode === mode;
              const label = mode === 'stopwatch' ? 'Stopwatch' : mode === 'countdown' ? 'Countdown' : 'Pomodoro';
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={isStudying || isCountdownCompleted}
                  onClick={() => {
                    if (!isStudying && !isCountdownCompleted) {
                      syncTimerMode(mode, false);
                      if (mode === 'countdown') {
                        setIsCountdownHalfwayNotified(false);
                        try {
                          localStorage.removeItem('studyio_timer_countdown_halfway_notified');
                        } catch { }
                      }
                    }
                  }}
                  className={`relative px-4 py-1.5 text-xs font-medium rounded-full transition-colors z-10 ${isActive ? 'text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'
                    } ${isStudying || isCountdownCompleted ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTimerMode"
                      className="absolute inset-0 bg-fg/[0.12] [[data-theme='paper']_&]:bg-[var(--surface)] border border-fg/[0.1] [[data-theme='paper']_&]:border-[var(--border-strong)] rounded-full shadow-card"
                      transition={shouldReduceMotion ? { duration: 0 } : { type: 'tween', duration: 0.2 }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>

          {/* 2. Subject chip - quiet skeleton while study mode is loading; hidden in Focus mode; normal in Subject mode */}
          {studyModeLoading ? (
            <div className="relative mt-2 sm:mt-2.5 mb-1 z-30">
              <div
                className="relative inline-flex items-center justify-center min-w-[220px] sm:min-w-[260px] max-w-[340px] h-[44px] sm:h-[48px] px-8 sm:px-10 rounded-full border border-[var(--border)] bg-[var(--surface)] opacity-50 animate-pulse"
                aria-hidden="true"
              >
                <div className="flex items-center justify-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--border-strong)]" />
                  <span className="w-24 h-3.5 rounded bg-[var(--border-strong)]" />
                </div>
              </div>
            </div>
          ) : isFocus ? null : (
            <div className="relative mt-2 sm:mt-2.5 mb-1 z-30">
              <button
                type="button"
                onClick={(e) => {
                  if (activeSubjects.length === 0) {
                    handleOpenSubjectManager(e);
                  } else {
                    setShowDropdown(!showDropdown);
                  }
                }}
                disabled={isStudying || isRemoteTransitioning}
                className={`relative inline-flex items-center justify-center min-w-[220px] sm:min-w-[260px] max-w-[340px] px-8 sm:px-10 py-2.5 sm:py-3 rounded-full border bg-[var(--surface)] hover:bg-[var(--surface-2)] active:scale-[0.98] transition-all text-sm font-semibold cursor-pointer shadow-card ${subjectWarning
                  ? 'border-amber-500/60 ring-1 ring-amber-500/30'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                  } ${isStudying ? 'opacity-90 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-center gap-2.5 min-w-0 max-w-full">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                    style={{
                      backgroundColor: selectedSubject
                        ? (selectedSubject.color || '#10B981')
                        : activeSubjects.length === 0
                          ? 'var(--accent)'
                          : '#71717A',
                    }}
                  />
                  <span className={`truncate text-sm sm:text-[15px] ${selectedSubject ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-dim)] font-medium'}`}>
                    {selectedSubject?.name || 'Choose a subject'}
                  </span>
                  {isStudying && (
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-fg/[0.08] text-[var(--text-dim)] flex-shrink-0">
                      Locked
                    </span>
                  )}
                </div>
                <ChevronDown className={`absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)] flex-shrink-0 transition-transform duration-200 pointer-events-none ${showDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Subject Dropdown Popover */}
              {showDropdown && !isStudying && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-[var(--surface)] backdrop-blur-xl border border-[var(--border-strong)] rounded-2xl p-2.5 shadow-card z-50 text-[var(--text)]">
                    <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--text-dim)] border-b border-fg/[0.06] mb-1">
                      Select subject
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-0.5">
                      {activeSubjects.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setSelectedSubjectId(sub.id);
                            setShowDropdown(false);
                            setSubjectWarning(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm transition-colors cursor-pointer ${sub.id === selectedSubjectId
                            ? 'bg-fg/[0.1] text-[var(--text)] font-medium'
                            : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-fg/[0.05]'
                            }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: sub.color || '#10B981' }}
                            />
                            <span className="truncate">{sub.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-[var(--text-dim)] ml-2 shrink-0">
                            {Math.floor((sub.targetMinutesPerDay || 60) / 60)}h goal
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="pt-2 mt-2 border-t border-fg/[0.06]">
                      <button
                        type="button"
                        onClick={handleOpenSubjectManager}
                        className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-fg/[0.05] transition-colors cursor-pointer"
                      >
                        <FolderPlus className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                        <span>Manage subjects</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* 3. The Dial (flex-1 min-h-0 centers vertically and absorbs remaining height) */}
      <div className="w-full flex-1 min-h-0 flex items-center justify-center my-auto py-1">
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: shouldReduceMotion ? 0 : 0.08, ease: 'easeOut' }}
          className="w-full h-full min-h-0 flex items-center justify-center"
        >
          <TimerDial
            displayTime={displayTime}
            ringPercent={ringPercent}
            litCount={litCount}
            statusText={statusText}
            subjectName={undefined}
            isRunning={isRunning}
            isPaused={isPaused}
            isStudying={isStudying}
            shouldReduceMotion={shouldReduceMotion}
            timerMode={timerMode}
            onStartCountdownEdit={() => setIsEditingCountdown(true)}
            pomodoroPreset={pomodoroPreset}
            onSelectPomodoroPreset={setPomodoroPreset}
          />
        </motion.div>
      </div>

      {/* Bottom Section: Primary Button Stack + Atmosphere/Focus + Today (shrink-0, pinned to bottom) */}
      <div className="w-full flex flex-col items-center shrink-0 mt-auto pb-0.5 sm:pb-1">
        {/* Network Status Warning Banner: Visible when offline during active or pending session */}
        {!isOnline && (isRunning || isPaused || isStudying || elapsedSeconds > 0 || isCountdownCompleted) && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-amber-400 font-mono py-1 px-3 rounded-full bg-amber-500/10 border border-amber-500/20 mb-2 select-none animate-in fade-in duration-200">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>Offline: Reconnect internet to stop &amp; save</span>
          </div>
        )}

        {/* 4. Primary Button Stack */}
        <div className="w-full flex items-center justify-center mt-1.5 mb-2.5">
          {isCountdownCompleted ? (
            <div className="flex flex-col items-center gap-2 w-full max-w-[360px] animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-2.5 w-full justify-center">
                <button
                  type="button"
                  onClick={async () => {
                    toast.dismiss();
                    if (!isOnline) {
                      toast.error('Network connection required to save session. Please reconnect.', {
                        id: 'offline-stop-blocked',
                        duration: 4000,
                      });
                      return;
                    }
                    setIsCountdownCompleted(false);
                    setIsCountdownHalfwayNotified(false);
                    try {
                      localStorage.removeItem('studyio_timer_countdown_completed');
                      localStorage.removeItem('studyio_timer_countdown_halfway_notified');
                    } catch { }
                    await handleStopAndSave(countdownTarget);
                  }}
                  disabled={isSaving || isRemoteTransitioning || !isOnline}
                  className={`flex-1 h-[52px] rounded-full font-bold text-sm active:scale-[0.98] transition-all duration-120 flex items-center justify-center gap-2 ${!isOnline
                    ? 'border border-white/10 bg-white/[0.04] text-white/40 cursor-not-allowed opacity-60'
                    : 'text-[var(--accent-contrast)] bg-[var(--accent)] hover:brightness-105 cursor-pointer disabled:opacity-50 shadow-lg shadow-[0_0_20px_var(--glow)]'
                    }`}
                  title={!isOnline ? 'No network connection. Reconnect to stop & save session.' : undefined}
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : !isOnline ? (
                    <>
                      <WifiOff className="w-4 h-4 text-white/40" />
                      <span>Offline (Reconnect)</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>Save session</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCountdownCompleted(false);
                    setIsCountdownHalfwayNotified(false);
                    try {
                      localStorage.removeItem('studyio_timer_countdown_completed');
                      localStorage.removeItem('studyio_timer_countdown_halfway_notified');
                    } catch { }
                    handleReset();
                  }}
                  disabled={isSaving || isRemoteTransitioning}
                  className="w-12 h-[52px] rounded-full border border-fg/20 bg-fg/[0.04] hover:bg-fg/[0.08] text-[var(--text-dim)] hover:text-[var(--text)] active:scale-[0.98] transition-transform duration-120 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-50"
                  title="Reset without saving"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-[var(--text-dim)] font-mono select-none">
                Countdown complete ({formatSeconds(countdownTarget)}). Save to claim your RP &amp; XP!
              </p>
            </div>
          ) : pomodoroCompletedPhase === 'work' ? (
            <div className="flex items-center gap-2.5 w-full max-w-[360px] justify-center">
              <button
                onClick={async () => {
                  if (!isOnline) {
                    toast.error('Network connection required to save session. Please reconnect.', {
                      id: 'offline-stop-blocked',
                      duration: 4000,
                    });
                    return;
                  }
                  setIsSaving(true);
                  try {
                    await saveAndStartBreak();
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving || isRemoteTransitioning || !isOnline}
                className={`flex-1 h-[52px] rounded-full font-medium text-sm active:scale-[0.98] transition-transform duration-120 flex items-center justify-center gap-2 ${!isOnline
                  ? 'border border-white/10 bg-white/[0.04] text-white/40 cursor-not-allowed opacity-60'
                  : 'text-[var(--accent-contrast)] bg-[var(--accent)] hover:brightness-105 cursor-pointer disabled:opacity-50 shadow-sm'
                  }`}
                title={!isOnline ? 'No network connection. Reconnect to stop & save session.' : undefined}
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[var(--accent-contrast)] border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : !isOnline ? (
                  <>
                    <WifiOff className="w-4 h-4 text-white/40" />
                    <span>Offline</span>
                  </>
                ) : (
                  <>
                    <Coffee className="w-4 h-4 fill-current" />
                    <span>Save &amp; start break</span>
                  </>
                )}
              </button>
              <button
                onClick={async () => {
                  if (!isOnline) {
                    toast.error('Network connection required to save session. Please reconnect.', {
                      id: 'offline-stop-blocked',
                      duration: 4000,
                    });
                    return;
                  }
                  setIsSaving(true);
                  try {
                    await skipPomodoroBreak();
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving || isRemoteTransitioning || !isOnline}
                className="px-5 h-[52px] rounded-full border border-fg/20 bg-fg/[0.04] hover:bg-fg/[0.08] text-[var(--text)] font-medium text-sm active:scale-[0.98] transition-transform duration-120 cursor-pointer disabled:opacity-50"
              >
                <span>Skip</span>
              </button>
            </div>
          ) : timerMode === 'pomodoro' && pomodoroPhase === 'shortBreak' ? (
            isPaused ? (
              <div className="flex items-center gap-2.5 w-[min(280px,85vw)] sm:w-[260px] justify-center">
                <button
                  onClick={startPomodoroBreak}
                  disabled={isSaving || isRemoteTransitioning}
                  className="flex-1 h-[52px] rounded-full font-medium text-sm text-[var(--accent-contrast)] bg-[var(--accent)] hover:brightness-105 active:scale-[0.98] transition-transform duration-120 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start break</span>
                </button>
                <button
                  onClick={handleReset}
                  disabled={isSaving || isRemoteTransitioning}
                  className="px-5 h-[52px] rounded-full border border-fg/20 bg-fg/[0.04] hover:bg-fg/[0.08] text-[var(--text)] font-medium text-sm active:scale-[0.98] transition-transform duration-120 cursor-pointer disabled:opacity-50"
                >
                  <span>Skip</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleReset}
                disabled={isSaving || isRemoteTransitioning}
                className="w-[min(280px,85vw)] sm:w-[240px] h-[52px] rounded-full border border-fg/20 bg-fg/[0.04] hover:bg-fg/[0.08] text-[var(--text)] font-medium text-sm active:scale-[0.98] transition-transform duration-120 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>End break</span>
              </button>
            )
          ) : pomodoroCompletedPhase === 'break' ? (
            <div className="flex flex-col items-center">
              <button
                onClick={() => {
                  setPomodoroCompletedPhase(null);
                  handleStartSession();
                }}
                disabled={isSaving || isRemoteTransitioning}
                className="w-[min(280px,85vw)] sm:w-[240px] h-[52px] rounded-full font-semibold text-sm text-[var(--accent-contrast)] bg-[var(--accent)] hover:brightness-105 active:scale-[0.98] transition-transform duration-120 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Flame className="w-4 h-4 fill-current" />
                <span>Start focus session</span>
              </button>
            </div>
          ) : !isStudying ? (
            <div className="flex flex-col items-center">
              {isFocus ? (
                <button
                  type="button"
                  onClick={handleStartSession}
                  disabled={isSaving || isRemoteTransitioning}
                  className="w-[min(280px,85vw)] sm:w-[240px] h-[52px] rounded-full font-semibold text-sm text-[var(--accent-contrast)] bg-[var(--accent)] shadow-sm hover:brightness-105 active:scale-[0.98] transition-transform duration-120 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start focus</span>
                </button>
              ) : !selectedSubject?.id ? (
                <button
                  type="button"
                  onClick={(e) => {
                    if (activeSubjects.length === 0) {
                      handleOpenSubjectManager(e);
                    } else {
                      setShowDropdown(true);
                    }
                  }}
                  className="w-[min(280px,85vw)] sm:w-[240px] h-[52px] rounded-full font-medium text-sm bg-fg/[0.08] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-fg/[0.12] border border-fg/[0.06] active:scale-[0.98] transition-transform duration-120 flex items-center justify-center gap-2 cursor-pointer text-center px-4"
                  title="Choose a subject to start"
                >
                  <span className="truncate">Choose a subject to start</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartSession}
                  disabled={isSaving || isRemoteTransitioning}
                  className="w-[min(280px,85vw)] sm:w-[240px] h-[52px] rounded-full font-semibold text-sm text-[var(--accent-contrast)] bg-[var(--accent)] shadow-sm hover:brightness-105 active:scale-[0.98] transition-transform duration-120 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start session</span>
                </button>
              )}
            </div>
          ) : isUltraStrict ? (
            /* Ultra Strict Session Running: No Stop, Pause, or Reset buttons until countdown completes */
            <div className="flex items-center justify-center w-[min(280px,85vw)] sm:w-[260px]">
              <div className="w-full h-[52px] rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-hud text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 select-none shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                <Lock className="w-4 h-4 shrink-0 text-emerald-400 animate-pulse" />
                <span>Ultra Focus • Locked</span>
              </div>
            </div>
          ) : !isPaused ? (
            <div className="flex items-center gap-2.5 w-[min(280px,85vw)] sm:w-[260px] justify-center">
              <button
                type="button"
                onClick={handlePause}
                disabled={isSaving || isRemoteTransitioning}
                className="flex-1 h-[52px] rounded-full border border-fg/20 bg-fg/[0.04] hover:bg-fg/[0.08] text-[var(--text)] font-medium text-sm active:scale-[0.98] transition-transform duration-120 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>
              <button
                type="button"
                onClick={() => handleStopAndSave()}
                disabled={isSaving || isRemoteTransitioning || !isOnline}
                className={`flex-1 h-[52px] rounded-full border text-sm font-medium active:scale-[0.98] transition-all duration-120 flex items-center justify-center gap-2 ${!isOnline
                  ? 'border-white/10 bg-white/[0.04] text-white/40 cursor-not-allowed opacity-60 hover:bg-white/[0.04]'
                  : 'border-rose-500/40 bg-rose-500/[0.06] hover:bg-rose-500/15 text-rose-300 cursor-pointer disabled:opacity-50'
                  }`}
                title={!isOnline ? 'No network connection. Reconnect to stop & save session.' : undefined}
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : !isOnline ? (
                  <>
                    <WifiOff className="w-4 h-4 text-white/40" />
                    <span>Offline</span>
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span>Stop</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 w-[min(300px,92vw)] sm:w-[320px] justify-center">
              <button
                type="button"
                onClick={handleResume}
                disabled={isSaving || isRemoteTransitioning}
                className="flex-1 h-[52px] rounded-full font-semibold text-sm text-[var(--accent-contrast)] bg-[var(--accent)] hover:brightness-105 active:scale-[0.98] transition-transform duration-120 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Resume</span>
              </button>
              <button
                type="button"
                onClick={() => handleStopAndSave()}
                disabled={isSaving || isRemoteTransitioning || !isOnline}
                className={`flex-1 h-[52px] rounded-full border text-sm font-medium active:scale-[0.98] transition-all duration-120 flex items-center justify-center gap-2 ${!isOnline
                  ? 'border-white/10 bg-white/[0.04] text-white/40 cursor-not-allowed opacity-60 hover:bg-white/[0.04]'
                  : 'border-rose-500/40 bg-rose-500/[0.06] hover:bg-rose-500/15 text-rose-300 cursor-pointer disabled:opacity-50'
                  }`}
                title={!isOnline ? 'No network connection. Reconnect to stop & save session.' : undefined}
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : !isOnline ? (
                  <>
                    <WifiOff className="w-4 h-4 text-white/40" />
                    <span>Offline</span>
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span>Stop</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving || isRemoteTransitioning}
                className="w-12 h-[52px] rounded-full border border-fg/20 bg-fg/[0.04] hover:bg-fg/[0.08] text-[var(--text-dim)] hover:text-[var(--text)] active:scale-[0.98] transition-transform duration-120 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-50"
                title="Reset timer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 5. Sleek Row of Auxiliary Control Buttons */}
        <div className="flex items-center justify-center gap-2 mt-2 relative z-20 max-w-full px-2">
          {/* Atmosphere Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsAmbientMenuOpen(!isAmbientMenuOpen)}
              className="h-8 inline-flex items-center gap-1.5 px-3 rounded-full border border-fg/[0.08] bg-fg/[0.03] hover:bg-fg/[0.06] text-[var(--text-dim)] hover:text-[var(--text)] text-xs font-medium transition-colors cursor-pointer select-none whitespace-nowrap"
            >
              {isAmbientLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)] shrink-0" />
              ) : (
                <Music className={`w-3.5 h-3.5 shrink-0 ${ambientSound !== 'none' ? 'text-[var(--accent,#E6C15A)]' : 'text-[var(--text-dim)]'}`} />
              )}
              <span className="truncate max-w-[85px]">
                {ambientSound === 'none' ? 'Atmosphere' : ambientLabel}
              </span>
              {ambientSound !== 'none' && !isAmbientLoading && (
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${isPaused ? 'bg-amber-400' : 'bg-[var(--accent,#E6C15A)] animate-pulse'
                    }`}
                />
              )}
            </button>

            {isAmbientMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsAmbientMenuOpen(false)} />
                <div className="absolute bottom-full left-0 mb-2 z-50 bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] rounded-2xl p-2.5 shadow-card min-w-[220px] w-56 max-w-[calc(100vw-32px)] max-h-[340px] overflow-y-auto text-[var(--text)]">
                  <div className="flex flex-col gap-1">
                    {[
                      { id: 'none', label: 'Silent', icon: <span className="w-3.5 h-3.5 rounded-full bg-zinc-500 mx-0.5" /> },
                      { id: 'rain', label: 'Gentle Rain', icon: <CloudRain className="w-4 h-4" /> },
                      { id: 'campfire', label: 'Fireplace', icon: <Flame className="w-4 h-4" /> },
                      { id: 'calmnoise', label: 'Calm Music', icon: <Music className="w-4 h-4" /> },
                      { id: 'starlitpiano', label: 'Starlit Piano', icon: <Music className="w-4 h-4" /> },
                      { id: 'zensanctuary', label: 'Zen Sanctuary', icon: <Music className="w-4 h-4" /> },
                      { id: 'brownnoise', label: 'Brown Noise', icon: <Headphones className="w-4 h-4" /> },
                      { id: 'pinknoise', label: 'Pink Noise', icon: <Radio className="w-4 h-4" /> },
                      { id: 'whitenoise', label: 'White Noise', icon: <Radio className="w-4 h-4" /> },
                    ].map((option) => {
                      const isSelected = ambientSound === option.id;
                      const isOptionLoading = isAmbientLoading && (ambientLoadingSound === option.id || (isSelected && !ambientLoadingSound));

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAmbientChange(option.id as any);
                          }}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-colors cursor-pointer ${isSelected
                            ? 'bg-fg/[0.1] text-[var(--text)] font-medium'
                            : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-fg/[0.05]'
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            {option.icon}
                            <span>{option.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isOptionLoading && (
                              <div className="flex items-center gap-1 text-[11px] font-mono text-[var(--accent)]">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span className="text-[10px]">Loading...</span>
                              </div>
                            )}
                            {isSelected && !isOptionLoading && (
                              <Check className="w-3.5 h-3.5 text-[var(--text)]" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {ambientSound !== 'none' && (
                    <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center gap-3 px-2">
                      <Volume2 className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={ambientVolume}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="flex-1 accent-[var(--accent)] bg-fg/10 rounded-lg cursor-pointer h-1.5"
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Alarm Toggle Button (Optional 5-min alarm for Countdown, Ultra Strict, Pomodoro) */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              const next = !isAlarmEnabled;
              setIsAlarmEnabled(next);
              saveTimerAlarmEnabled(next);
              toast(next ? 'Timer alarm: ON (rings for 5 min)' : 'Timer alarm: OFF', {
                icon: next ? '🔔' : '🔕',
              });
            }}
            className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-full border text-xs font-medium transition-colors cursor-pointer select-none whitespace-nowrap shrink-0 ${
              isAlarmEnabled
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 font-medium shadow-xs'
                : 'border-fg/[0.08] bg-fg/[0.03] hover:bg-fg/[0.06] text-[var(--text-dim)] hover:text-[var(--text)]'
            }`}
            title={
              isAlarmEnabled
                ? 'Alarm is ON (plays 5-minute repeating alarm when timer ends)'
                : 'Alarm is OFF (silent on timer completion)'
            }
          >
            {isAlarmEnabled ? (
              <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <BellOff className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
            )}
            <span>Alarm: {isAlarmEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {/* Focus Button - always visible in any mode */}
          <button
            type="button"
            onClick={() => {
              enterFullscreenSafely();
              setIsFocusModeOpen(true);
            }}
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-full border border-fg/[0.08] bg-fg/[0.03] hover:bg-fg/[0.06] text-[var(--text-dim)] hover:text-[var(--text)] text-xs font-medium transition-colors cursor-pointer select-none whitespace-nowrap shrink-0"
            title="Fullscreen Focus Mode"
          >
            <Maximize2 className="w-3.5 h-3.5 shrink-0" />
            <span>Focus</span>
          </button>

          {/* Strict Mode Button (Strictly Native Android Only) */}
          {isAndroid && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setIsStrictConfigOpen(true);
              }}
              className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-full border text-xs font-medium transition-colors cursor-pointer select-none whitespace-nowrap shrink-0 ${isRemoteSession
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-400 font-medium'
                : isStrictMode || isBlockShortsReels
                ? 'border-white/20 bg-white/10 text-white font-medium shadow-xs'
                : 'border-fg/[0.08] bg-fg/[0.03] hover:bg-fg/[0.06] text-[var(--text-dim)] hover:text-[var(--text)]'
                }`}
              title={
                isRemoteSession
                  ? 'Remote session active from desktop (Strict Mode bypassed on phone)'
                  : isStudying && (isStrictMode || isBlockShortsReels)
                  ? (isUltraStrict ? 'Ultra Strict Mode is active (all apps locked)' : 'Strict / Blocker is active and locked during study')
                  : (isUltraStrict ? 'Ultra Strict Mode (Full Lockdown)' : 'Strict Mode & Reels Blocker')
              }
            >
              <Shield className={`w-3.5 h-3.5 shrink-0 ${isRemoteSession ? 'text-sky-400' : isStrictMode || isBlockShortsReels ? 'text-emerald-400' : 'text-[var(--text-dim)]'}`} />
              <span>
                {isRemoteSession
                  ? 'Remote Focus'
                  : isUltraStrict && isStrictMode
                  ? 'Ultra: ON'
                  : isStrictMode
                  ? 'Strict: ON'
                  : isBlockShortsReels
                  ? 'Reels: Block'
                  : 'Strict: OFF'}
              </span>
              {!isRemoteSession && (isStrictMode || isBlockShortsReels) && (
                <span className="inline-flex items-center gap-1 ml-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                  {isStudying ? (
                    <Lock className="w-3 h-3 text-white/50 shrink-0" />
                  ) : isStrictMode && allowedApps.length > 0 ? (
                    <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-mono text-white/80 leading-none">
                      {allowedApps.length}
                    </span>
                  ) : null}
                </span>
              )}
            </button>
          )}
        </div>

        {/* 6. Today total one-liner */}
        <div className="mt-1.5 sm:mt-2 text-xs font-mono text-[var(--text-faint)] select-none">
          Today: {formatHoursAndMins(overviewTodaySeconds)}
        </div>
      </div>

      {/* Countdown Editor Modal */}
      {isEditingCountdown && (
        <CountdownEditor
          initialSeconds={countdownTarget}
          onSave={(seconds) => {
            setCountdownTarget(seconds);
            setIsCountdownHalfwayNotified(false);
            try {
              localStorage.removeItem('studyio_timer_countdown_halfway_notified');
            } catch { }
            setIsEditingCountdown(false);
          }}
          onCancel={() => setIsEditingCountdown(false)}
        />
      )}

      {/* Strict Mode Allowed Apps Modal */}
      {isAndroid && isAllowedAppsModalOpen && (
        <StrictModeAllowedAppsModal
          isOpen={isAllowedAppsModalOpen}
          onClose={() => setIsAllowedAppsModalOpen(false)}
          allowedApps={allowedApps}
          onSaveAllowedApps={(apps) => setAllowedApps(apps)}
        />
      )}

      {/* Strict Mode Permission Modal */}
      {isAndroid && isPermissionModalOpen && (
        <StrictModePermissionModal
          isOpen={isPermissionModalOpen}
          onClose={() => setIsPermissionModalOpen(false)}
          onRequestPermission={handleRequestPermission}
        />
      )}

      {/* Strict Mode Configuration Sheet */}
      {isAndroid && isStrictConfigOpen && (
        <StrictModeConfigModal
          isOpen={isStrictConfigOpen}
          onClose={() => setIsStrictConfigOpen(false)}
          isStrictMode={isStrictMode}
          isUltraStrict={isUltraStrict}
          isBlockShortsReels={isBlockShortsReels}
          onToggleStrictMode={handleToggleStrictMode}
          onToggleUltraStrict={handleToggleUltraStrict}
          onToggleBlockShortsReels={handleToggleBlockShortsReels}
          allowedAppsCount={allowedApps.length}
          onOpenAllowedApps={() => {
            if (isStudying) {
              toast('Allowed apps cannot be modified during active focus sessions', { icon: '🔒' });
              return;
            }
            setIsStrictConfigOpen(false);
            setIsAllowedAppsModalOpen(true);
          }}
          hasUsagePermission={hasUsagePerm}
          hasOverlayPermission={hasOverlayPerm}
          hasAccessibilityPermission={hasAccessibilityPerm}
          onRequestUsagePermission={handleRequestPermission}
          onRequestOverlayPermission={handleRequestOverlayPermission}
          onRequestAccessibilityPermission={handleRequestAccessibilityPermission}
          isFocusing={isStudying}
        />
      )}

      {/* Strict Mode Countdown Warning Confirmation Modal */}
      {isAndroid && isStrictWarningModalOpen && (
        <StrictCountdownWarningModal
          isOpen={isStrictWarningModalOpen}
          isUltraStrict={isUltraStrict}
          countdownSeconds={countdownTarget}
          subjectName={selectedSubject?.name}
          allowedAppsCount={allowedApps.length}
          onConfirm={handleConfirmStrictCountdown}
          onCancel={handleCancelStrictCountdown}
        />
      )}

      {/* Optional 5-Minute Timer Alarm Ringing Modal */}
      <TimerAlarmModal
        isOpen={isAlarmRinging}
        mode={alarmModalData?.mode || 'countdown'}
        phase={alarmModalData?.phase || 'work'}
        isUltraStrict={Boolean(alarmModalData?.isUltraStrict)}
        subjectName={alarmModalData?.subjectName}
        onDismiss={handleDismissAlarm}
        onSnooze={alarmModalData?.mode === 'countdown' ? handleSnoozeAlarm : undefined}
        onStartBreak={alarmModalData?.mode === 'pomodoro' && alarmModalData?.phase === 'work' ? handleStartBreakFromAlarm : undefined}
        onStartFocus={alarmModalData?.mode === 'pomodoro' && alarmModalData?.phase === 'break' ? handleStartFocusFromAlarm : undefined}
      />
    </div>
  );
}

