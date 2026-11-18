import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronUp,
  Flame,
  Home,
  MessageCircle,
  Pause,
  Play,
  User as UserIcon,
  Send,
  Settings,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Check,
  Users,
  Plus,
  Minus,
  Save,
  AlertCircle,
  AlertTriangle,
  Hash,
  Crown,
  Globe,
  Trash2,
  X,
  Radio,
  Ban,
  ShieldAlert,
  User,
  UserX,
  UserCheck,
  Loader2,
  Zap,
  Vibrate,
  AtSign,
  CornerUpLeft,
  Reply,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { UserAvatar } from '../common/UserAvatar';
import { resolveAppAvatar, isAppAvatar } from '@/lib/avatars';
import { FlairFrame, fetchFlairMap } from '../../lib/flair';
import { AvatarFlairRing, FlairCrown } from '../common/FlairBadge';
import { ProAvatarRing } from '../ui/ProAvatarRing';
import { ScholarProfileModal, ScholarModalData } from '../common/ScholarProfileModal';
import { ClassicNudgeButton } from './ClassicNudgeButton';
import { SwipeableChatMessage } from './SwipeableChatMessage';
import { playClassicNudgeSound } from '../../lib/nudgeSound';
import { triggerHaptic, registerBackButtonHandler } from '../../lib/native-feel';
import { hapticMedium, hapticTick, isHapticsEnabled, setHapticsEnabled } from '@/lib/haptics';
import {
  NUDGE_COOLDOWN_MS,
  formatNudgeCooldown,
  loadStoredNudgeTimestamps,
  persistNudgeTimestamp,
  getRemainingNudgeCooldownSeconds,
  requestNudgeNotificationPermission,
  triggerNudgePushNotification,
} from '../../lib/nudge';
import { getSupabase, broadcast } from '../../lib/supabase';
import {
  updateRoomSettingsAction,
  banRoomMemberAction,
  unbanRoomMemberAction,
} from '../../app/actions/rooms';
import { useAuth } from '../../context/AuthContext';
import { useStudy } from '../../context/StudyContext';

export interface ParsedMessage {
  replyTo: {
    id: string;
    username: string;
    snippet: string;
  } | null;
  text: string;
}

export function parseMessageContent(rawContent: string): ParsedMessage {
  if (!rawContent) return { replyTo: null, text: '' };
  if (rawContent.startsWith('[REPLY:') && rawContent.includes(']\n')) {
    try {
      const endMetaIdx = rawContent.indexOf(']\n');
      const metaJson = rawContent.slice(7, endMetaIdx);
      const parsed = JSON.parse(metaJson);
      const bodyText = rawContent.slice(endMetaIdx + 2);
      return {
        replyTo: {
          id: parsed.id || '',
          username: parsed.username || 'Scholar',
          snippet: parsed.snippet || '',
        },
        text: bodyText,
      };
    } catch {
      return { replyTo: null, text: rawContent };
    }
  }
  return { replyTo: null, text: rawContent };
}

export function formatReplyPayload(
  replyingTo: { messageId: string; username: string; snippet: string },
  text: string
): string {
  const replyMeta = {
    id: replyingTo.messageId,
    username: replyingTo.username,
    snippet: replyingTo.snippet.slice(0, 100),
  };
  return `[REPLY:${JSON.stringify(replyMeta)}]\n${text.trim()}`;
}

export function extractMentions(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/@[a-zA-Z0-9_\-\.]+/g) || [];
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())));
}

export function renderFormattedMessage(text: string, currentUsername?: string) {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9_\-\.]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const mentionName = part.slice(1);
      const isMe = currentUsername && mentionName.toLowerCase() === currentUsername.toLowerCase();
      return (
        <span
          key={i}
          className={`px-1.5 py-0.2 mx-0.5 rounded font-hud text-[11px] font-bold tracking-tight inline-block transition-all ${
            isMe
              ? 'bg-amber-400/25 text-amber-300 border border-amber-400/40 shadow-[0_0_8px_rgba(245,158,11,0.35)]'
              : 'bg-white/[0.08] text-amber-300 border border-white/10'
          }`}
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

interface ActiveRoomProps {
  roomId: string;
  onBack: () => void;
  initialTab?: 'home' | 'chat' | 'settings';
}

interface RoomDetails {
  id: string;
  name: string;
  description?: string | null;
  host_id: string;
  password?: string | null;
  is_private?: boolean;
  max_capacity?: number;
  short_code?: string;
}

interface RoomMemberInfo {
  user_id: string;
  username: string;
  avatar_url: string | null;
  is_host: boolean;
  is_studying: boolean;
  timer_start_at: number | null;
  accumulated_seconds?: number;
  base_today_seconds?: number;
  today_seconds: number;
  session_seconds?: number;
  total_focus_seconds?: number;
  is_online: boolean;
  is_current_user?: boolean;
}

// Formats total seconds to HH:MM:SS with 2-digit zero-padding
export function formatSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const hStr = String(hours).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');
  const sStr = String(seconds).padStart(2, '0');

  return `${hStr}:${mStr}:${sStr}`;
}

// In-memory module profile cache to immediately hydrate member avatars and usernames
const memoryProfileCache = new Map<string, { username: string; avatar_url: string | null }>();

export function getCachedMemberProfile(userId: string): { username?: string; avatar_url?: string | null } | undefined {
  if (!userId) return undefined;
  if (memoryProfileCache.has(userId)) {
    return memoryProfileCache.get(userId);
  }
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('study_io_profiles_cache') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed[userId]) {
        memoryProfileCache.set(userId, parsed[userId]);
        return parsed[userId];
      }
    }
  } catch {}
  return undefined;
}

export function cacheMemberProfiles(
  profiles: { id: string; username?: string; name?: string; avatar_url?: string | null }[]
) {
  if (!profiles || profiles.length === 0) return;
  try {
    let localObj: Record<string, { username: string; avatar_url: string | null }> = {};
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('study_io_profiles_cache');
        if (raw) localObj = JSON.parse(raw);
      } catch {}
    }

    profiles.forEach((p) => {
      if (!p || !p.id) return;
      const cleanAvatar =
        typeof p.avatar_url === 'string' && p.avatar_url.trim().length > 0
          ? resolveAppAvatar(p.avatar_url, p.username || p.name || p.id)
          : null;
      const item = {
        username: p.username || p.name || 'Scholar',
        avatar_url: cleanAvatar,
      };
      memoryProfileCache.set(p.id, item);
      localObj[p.id] = item;
    });

    if (typeof window !== 'undefined') {
      localStorage.setItem('study_io_profiles_cache', JSON.stringify(localObj));
    }
  } catch {}
}

import { usePremium } from '../../context/PremiumContext';

export default function ActiveRoom({ roomId, onBack, initialTab }: ActiveRoomProps) {
  const { user } = useAuth();
  const { isPremium, openPremiumModal } = usePremium();
  const {
    isRunning,
    isPaused,
    elapsedSeconds,
    getTodayTotalSeconds,
    startTimer,
    pauseTimer,
    resumeTimer,
    selectedSubject,
    subjects,
  } = useStudy();

  const handleStartOrResume = useCallback(() => {
    hapticMedium();
    if (isPaused) {
      resumeTimer();
    } else if (!isRunning) {
      const activeSubId = selectedSubject?.id || (subjects && subjects.length > 0 ? subjects[0]?.id : undefined);
      startTimer(activeSubId);
    }
  }, [isPaused, isRunning, resumeTimer, startTimer, selectedSubject?.id, subjects]);

  const handlePauseTimer = useCallback(() => {
    hapticMedium();
    if (isRunning) {
      pauseTimer();
    }
  }, [isRunning, pauseTimer]);

  const activeSubjectName = selectedSubject?.name || (subjects && subjects.length > 0 ? subjects[0]?.name : 'Focus');
  const activeSubjectColor = selectedSubject?.color || (subjects && subjects.length > 0 ? subjects[0]?.color : '#10B981');

  const [roomName, setRoomName] = useState<string>('Loading...');
  const [roomTab, setRoomTab] = useState<'home' | 'chat' | 'settings'>(initialTab || 'home');
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const roomTabRef = useRef(roomTab);

  // Room details & Host configuration
  const [roomInfo, setRoomInfo] = useState<RoomDetails | null>(null);
  const isHost = Boolean(user?.id && roomInfo?.host_id === user.id);

  // Dynamic tabs available in current room
  const roomTabs = useMemo<Array<'home' | 'chat' | 'settings'>>(
    () => (isHost ? ['home', 'chat', 'settings'] : ['home', 'chat']),
    [isHost]
  );

  const activeRoomTabIdx = Math.max(0, roomTabs.indexOf(roomTab));
  const currentRoomIdxRef = useRef(activeRoomTabIdx);

  const roomSwipeContainerRef = useRef<HTMLDivElement>(null);
  const roomSwipeTrackRef = useRef<HTMLDivElement>(null);

  const isRoomDraggingRef = useRef(false);
  const isRoomSwipeTransitioningRef = useRef(false);
  const roomDragXRef = useRef(0);
  const roomTouchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isRoomHorizontalLockRef = useRef<boolean | null>(null);
  const roomRafIdRef = useRef<number | null>(null);
  const roomContainerWidthRef = useRef(0);

  const handleSelectRoomTab = useCallback((targetTab: 'home' | 'chat' | 'settings') => {
    hapticTick();
    setRoomTab(targetTab);
    if (targetTab === 'chat') {
      setUnreadCount(0);
    }
  }, []);

  // Sync track when roomTab changes (e.g. from header button click)
  useEffect(() => {
    const idx = Math.max(0, roomTabs.indexOf(roomTab));
    currentRoomIdxRef.current = idx;

    if (roomSwipeTrackRef.current && !isRoomDraggingRef.current && !isRoomSwipeTransitioningRef.current) {
      roomSwipeTrackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
      roomSwipeTrackRef.current.style.transform = `translate3d(-${idx * (100 / roomTabs.length)}%, 0, 0)`;
    }
  }, [roomTab, roomTabs]);

  // If host status changes and user is on settings when not host, fall back to chat
  useEffect(() => {
    if (!isHost && roomTab === 'settings') {
      setRoomTab('chat');
    }
  }, [isHost, roomTab]);

  // Fast native check for non-swipable elements
  const isRoomNonSwipable = useCallback((target: HTMLElement | null): boolean => {
    if (!target) return false;
    // Disable swiping if any modal or dialog is open
    if (
      typeof document !== 'undefined' &&
      document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0.z-\\[99999\\], .fixed.inset-0.z-50')
    ) {
      return true;
    }
    const nonSwipable = target.closest(
      'button, [data-no-room-swipe="true"], input, textarea, select, .overflow-x-auto, .overflow-x-scroll'
    );
    if (nonSwipable) {
      if (nonSwipable.getAttribute('data-no-room-swipe') === 'true') return true;
      if (
        nonSwipable.tagName === 'BUTTON' ||
        nonSwipable.tagName === 'INPUT' ||
        nonSwipable.tagName === 'TEXTAREA' ||
        nonSwipable.tagName === 'SELECT'
      ) {
        return true;
      }
      if (nonSwipable.scrollWidth > nonSwipable.clientWidth) {
        return true;
      }
    }
    return false;
  }, []);

  // Touch event listeners for 120fps hardware-composited swipe navigation
  useEffect(() => {
    const container = roomSwipeContainerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (isRoomNonSwipable(target)) {
        roomTouchStartRef.current = null;
        return;
      }

      roomContainerWidthRef.current = container.clientWidth || window.innerWidth || 360;

      roomTouchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: performance.now(),
      };
      isRoomHorizontalLockRef.current = null;
      isRoomDraggingRef.current = false;
      roomDragXRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!roomTouchStartRef.current || e.touches.length !== 1) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const dx = currentX - roomTouchStartRef.current.x;
      const dy = currentY - roomTouchStartRef.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Disambiguate horizontal swipe vs vertical scroll
      if (isRoomHorizontalLockRef.current === null) {
        // Wait until touch has moved at least 8px before deciding direction
        if (absDx < 8 && absDy < 8) {
          return;
        }

        if (absDx > absDy) {
          isRoomHorizontalLockRef.current = true;
          isRoomDraggingRef.current = true;
          if (roomSwipeTrackRef.current) {
            roomSwipeTrackRef.current.style.transition = 'none';
          }
        } else {
          // Vertical scroll dominant: pass control entirely to native browser vertical scroll
          isRoomHorizontalLockRef.current = false;
          roomTouchStartRef.current = null;
          return;
        }
      }

      if (isRoomHorizontalLockRef.current) {
        if (e.cancelable) {
          e.preventDefault();
        }

        const idx = currentRoomIdxRef.current;
        const width = roomContainerWidthRef.current;

        // Rubber-band resistance at boundary edges
        let effectiveDx = dx;
        if ((idx === 0 && dx > 0) || (idx === roomTabs.length - 1 && dx < 0)) {
          effectiveDx = dx * 0.25;
        }

        roomDragXRef.current = effectiveDx;

        // Hardware-composited translate3d for 120fps direct GPU response
        if (roomRafIdRef.current === null) {
          roomRafIdRef.current = requestAnimationFrame(() => {
            if (roomSwipeTrackRef.current && isRoomDraggingRef.current) {
              const currentPx = -(idx * width) + roomDragXRef.current;
              roomSwipeTrackRef.current.style.transform = `translate3d(${currentPx}px, 0, 0)`;
            }
            roomRafIdRef.current = null;
          });
        }
      }
    };

    const onTouchEnd = () => {
      if (roomRafIdRef.current !== null) {
        cancelAnimationFrame(roomRafIdRef.current);
        roomRafIdRef.current = null;
      }

      if (!roomTouchStartRef.current || !isRoomHorizontalLockRef.current || !isRoomDraggingRef.current) {
        roomTouchStartRef.current = null;
        isRoomHorizontalLockRef.current = null;
        isRoomDraggingRef.current = false;
        return;
      }

      const dt = Math.max(1, performance.now() - roomTouchStartRef.current.time);
      const finalDx = roomDragXRef.current;
      const velocity = Math.abs(finalDx) / dt; // px/ms
      const distanceThreshold = (roomContainerWidthRef.current || 360) * 0.2; // 20% of screen width
      const velocityThreshold = 0.22; // flick velocity

      const currentIdx = currentRoomIdxRef.current;
      let targetIdx = currentIdx;

      if ((Math.abs(finalDx) > distanceThreshold || velocity > velocityThreshold) && Math.abs(finalDx) > 15) {
        if (finalDx < 0 && currentIdx < roomTabs.length - 1) {
          targetIdx = currentIdx + 1;
        } else if (finalDx > 0 && currentIdx > 0) {
          targetIdx = currentIdx - 1;
        }
      }

      isRoomSwipeTransitioningRef.current = true;

      if (roomSwipeTrackRef.current) {
        roomSwipeTrackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
        roomSwipeTrackRef.current.style.transform = `translate3d(-${targetIdx * (100 / roomTabs.length)}%, 0, 0)`;
      }

      isRoomDraggingRef.current = false;
      roomTouchStartRef.current = null;
      isRoomHorizontalLockRef.current = null;
      roomDragXRef.current = 0;

      if (targetIdx !== currentIdx) {
        currentRoomIdxRef.current = targetIdx;
        const targetTab = roomTabs[targetIdx];
        setRoomTab(targetTab);
        if (targetTab === 'chat') {
          setUnreadCount(0);
        }
        hapticTick();

        setTimeout(() => {
          isRoomSwipeTransitioningRef.current = false;
        }, 240);
      } else {
        setTimeout(() => {
          isRoomSwipeTransitioningRef.current = false;
        }, 240);
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      if (roomRafIdRef.current !== null) {
        cancelAnimationFrame(roomRafIdRef.current);
      }
    };
  }, [isRoomNonSwipable, roomTabs]);

  // Host Settings Form State
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [editMaxCapacity, setEditMaxCapacity] = useState(4);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [rlsBlocked, setRlsBlocked] = useState(false);
  const [copiedRlsSql, setCopiedRlsSql] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isFormDirtyRef = useRef(false);

  // Ban management state
  const [bannedMembers, setBannedMembers] = useState<{ userId: string; username: string }[]>([]);

  const [hapticsActive, setHapticsActive] = useState<boolean>(() => isHapticsEnabled());

  useEffect(() => {
    setHapticsActive(isHapticsEnabled());
    const handleHapticsChange = (e: any) => {
      setHapticsActive(Boolean(e.detail));
    };
    window.addEventListener('studyio_haptics_changed', handleHapticsChange);
    return () => {
      window.removeEventListener('studyio_haptics_changed', handleHapticsChange);
    };
  }, []);

  const handleToggleHaptics = () => {
    const nextVal = !hapticsActive;
    setHapticsActive(nextVal);
    setHapticsEnabled(nextVal);
    if (nextVal) {
      hapticMedium();
    }
  };
  const [memberToBan, setMemberToBan] = useState<{ userId: string; username: string } | null>(null);
  const [isBanning, setIsBanning] = useState(false);
  const [isUnbanning, setIsUnbanning] = useState<string | null>(null);

  // Premium flair for room members
  const [flairMap, setFlairMap] = useState<Record<string, FlairFrame>>({});

  // Scholar profile modal state
  const [selectedScholar, setSelectedScholar] = useState<ScholarModalData | null>(null);

  // Classic Nudge State & 15-Minute Rate Limiting
  const [nudgeTimestamps, setNudgeTimestamps] = useState<Record<string, number>>(() => {
    return loadStoredNudgeTimestamps(roomId, user?.id);
  });
  const [nudgeCooldowns, setNudgeCooldowns] = useState<Record<string, number>>({});
  const [recentlyNudgedUsers, setRecentlyNudgedUsers] = useState<Record<string, { fromUsername: string; timestamp: number }>>({});
  const [isScreenShaking, setIsScreenShaking] = useState(false);

  // Sync stored nudge timestamps whenever user or room changes
  useEffect(() => {
    if (user?.id) {
      setNudgeTimestamps(loadStoredNudgeTimestamps(roomId, user.id));
    }
  }, [roomId, user?.id]);

  // Request browser notification permission early on room entry
  useEffect(() => {
    requestNudgeNotificationPermission().catch(() => {});
  }, []);

  // Compute live remaining cooldown seconds from timestamps
  useEffect(() => {
    const updateCooldowns = () => {
      const next: Record<string, number> = {};
      for (const [uid, ts] of Object.entries(nudgeTimestamps)) {
        const remaining = getRemainingNudgeCooldownSeconds(ts);
        if (remaining > 0) {
          next[uid] = remaining;
        }
      }
      setNudgeCooldowns(next);
    };

    updateCooldowns();
    const timer = setInterval(updateCooldowns, 1000);
    return () => clearInterval(timer);
  }, [nudgeTimestamps]);

  const handleIncomingNudge = useCallback((payload: any) => {
    if (!payload || !payload.targetUserId) return;
    const ts = payload.timestamp || Date.now();

    // 1. Mark target scholar as having a 15-minute cooldown ONLY if the current user sent the nudge
    if (payload.fromUserId && payload.fromUserId === user?.id) {
      setNudgeTimestamps((prev) => ({ ...prev, [payload.targetUserId]: ts }));
      persistNudgeTimestamp(payload.targetUserId, roomId, ts, user.id);
    }

    // 2. Highlight target user's avatar card in the room with animated reaction for everyone in room
    setRecentlyNudgedUsers((prev) => ({
      ...prev,
      [payload.targetUserId]: {
        fromUsername: payload.fromUsername || 'A scholar',
        timestamp: ts,
      },
    }));

    setTimeout(() => {
      setRecentlyNudgedUsers((prev) => {
        const next = { ...prev };
        delete next[payload.targetUserId];
        return next;
      });
    }, 3500);

    // 3. If the current logged-in user is the recipient of the nudge:
    if (payload.targetUserId === user?.id) {
      playClassicNudgeSound();
      triggerHaptic('heavy');
      setIsScreenShaking(true);
      setTimeout(() => setIsScreenShaking(false), 500);

      const sender = payload.fromUsername || 'A scholar';

      // Browser Level Notification: only for web browsers when tab/window is hidden.
      // Native Android/iOS receives push notification directly via FCM system tray, so skip local duplicate.
      if (!Capacitor.isNativePlatform() && typeof document !== 'undefined' && document.hidden) {
        triggerNudgePushNotification(sender);
      }

      // In-App Attention Toast
      toast((t) => (
        <div className="flex items-center gap-3 py-1">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">Focus Nudge</div>
            <div className="text-xs font-semibold text-white">
              <span className="text-amber-300 font-bold">{sender}</span> nudged you to focus!
            </div>
          </div>
        </div>
      ), { duration: 5500, position: 'top-center' });
    }
  }, [user?.id, roomId]);

  const handleSendNudge = useCallback(async (targetUserId: string, targetUsername: string) => {
    if (!user?.id || targetUserId === user.id) return;

    // Check if target is on 15-minute cooldown for the CURRENT sender
    const remaining = getRemainingNudgeCooldownSeconds(nudgeTimestamps[targetUserId]);
    if (remaining > 0) {
      toast.error(`Nudge on cooldown for ${targetUsername} (${formatNudgeCooldown(remaining)} left)`);
      return;
    }

    const now = Date.now();
    // 15-minute cooldown stored locally for current user only
    persistNudgeTimestamp(targetUserId, roomId, now, user.id);
    setNudgeTimestamps((prev) => ({ ...prev, [targetUserId]: now }));

    triggerHaptic('medium');
    playClassicNudgeSound();

    const senderName = profile?.username || user.username || user.displayName || 'A scholar';

    try {
      const supabase = getSupabase();
      if (supabase) {
        // Single authoritative outbound FCM push notification dispatch
        supabase.functions.invoke('send-notification', {
          body: {
            sender_id: user.id,
            sender_username: senderName,
            receiver_id: targetUserId,
            type: 'nudge',
            message: 'nudged you to focus!',
          },
        }).then(({ data, error }) => {
          if (error) console.warn('[ActiveRoom] Send-notification error:', error);
          else console.log('[ActiveRoom] Send-notification result:', data);
        }).catch((err) => console.warn('[ActiveRoom] Send-notification error:', err));

        if (roomId) {
          const hubChannel = supabase.channel(`room_members_hub_${roomId}`);
          await hubChannel.send({
            type: 'broadcast',
            event: 'member_nudged',
            payload: {
              fromUserId: user.id,
              fromUsername: senderName,
              fromAvatarUrl: user.user_metadata?.avatar_url,
              targetUserId,
              targetUsername,
              timestamp: now,
            },
          });

          // Broadcast to target user's personal notifications channel
          const userNotifChannel = supabase.channel(`user_notifications_${targetUserId}`);
          await userNotifChannel.send({
            type: 'broadcast',
            event: 'nudge_received',
            payload: {
              id: `nudge-${now}`,
              fromUserId: user.id,
              fromUsername: senderName,
              fromAvatarUrl: user.user_metadata?.avatar_url,
              targetUserId,
              targetUsername,
              roomId,
              roomName: roomInfo?.name || 'Study Room',
              timestamp: now,
            },
          });

          // Persist system message to room_messages so other users & page refreshes sync the 3-hour cooldown
          await supabase.from('room_messages').insert({
            room_id: roomId,
            user_id: user.id,
            content: `[SYSTEM_NUDGE]:${JSON.stringify({
              fromUserId: user.id,
              fromUsername: senderName,
              targetUserId,
              targetUsername,
              timestamp: now,
            })}`,
          });
        }
      }
    } catch (err) {
      console.warn('Failed to broadcast nudge:', err);
    }

    toast.success(`Nudged ${targetUsername}!`, { duration: 2500 });
  }, [user, roomId, nudgeTimestamps]);

  const handleOpenScholarModal = (u: any) => {
    if (!u || !u.user_id) return;
    const isMe = u.user_id === user?.id || u.is_current_user;
    const isPro = isMe ? isPremium : Boolean(flairMap[u.user_id]);
    setSelectedScholar({
      userId: String(u.user_id),
      name: u.username || u.name,
      displayName: u.username || u.name,
      username: u.username,
      avatarUrl: u.avatar_url,
      level: u.level,
      isPro,
      flairFrame: isPro ? (flairMap[u.user_id] || 'gold') : null,
      currentPeriodSeconds: u.total_focus_seconds || u.today_seconds,
      currentPeriodLabel: 'Today in Room',
    });
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDeleteRoom = async () => {
    if (!user || !isHost || !roomId) return;
    setIsDeletingRoom(true);
    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('room_members').delete().eq('room_id', roomId);
        const { error } = await supabase.from('study_rooms').delete().eq('id', roomId);
        if (error) {
          toast.error('Failed to delete room: ' + error.message);
          return;
        }

        try {
          const lobbyChannel = supabase.channel('study_rooms_lobby_hub');
          lobbyChannel.send({
            type: 'broadcast',
            event: 'lobby_update',
            payload: { timestamp: Date.now() },
          });

          const roomChannel = supabase.channel(`room_members_hub_${roomId}`);
          roomChannel.send({
            type: 'broadcast',
            event: 'room_deleted',
            payload: { timestamp: Date.now() },
          });
        } catch {}

        if (broadcast) {
          broadcast.postMessage({ type: 'lobby_update', timestamp: Date.now() });
        }
      }
      toast.success('Study room deleted');
      onBack();
    } catch (err: any) {
      toast.error('Error deleting room: ' + err.message);
    } finally {
      setIsDeletingRoom(false);
      setShowDeleteConfirm(false);
    }
  };

  const ROOMS_RLS_SQL = `-- Run this in your Supabase Dashboard -> SQL Editor:
ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hosts can update their own study rooms" ON public.study_rooms;
CREATE POLICY "Hosts can update their own study rooms"
  ON public.study_rooms FOR UPDATE
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);`;

  const handleCopyRlsSql = () => {
    navigator.clipboard.writeText(ROOMS_RLS_SQL);
    setCopiedRlsSql(true);
    toast.success('SQL policy copied to clipboard!');
    setTimeout(() => setCopiedRlsSql(false), 2500);
  };

  useEffect(() => {
    roomTabRef.current = roomTab;
    if (roomTab === 'chat') {
      setUnreadCount(0);
    }
  }, [roomTab]);

  const [dbMembers, setDbMembers] = useState<RoomMemberInfo[]>([]);
  const [presentUsers, setPresentUsers] = useState<any[]>([]);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Real-time peer-to-peer focus telemetry map (calibrated to local receiver clock to eliminate drift/skew)
  const [liveFocusMap, setLiveFocusMap] = useState<
    Record<
      string,
      {
        is_studying: boolean;
        start_time?: number;
        received_at: number; // Local timestamp (Date.now()) when update arrived
        base_session_seconds: number; // Session elapsed seconds at received_at
        base_today_seconds: number; // Base today seconds (total minus session)
        today_seconds: number;
        last_seen: number;
        room_flair?: string | null;
        is_premium?: boolean;
        flair_frame?: string | null;
      }
    >
  >({});

  const [messages, setMessages] = useState<any[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Reply and Mention states
  const [replyingTo, setReplyingTo] = useState<{
    messageId: string;
    username: string;
    snippet: string;
  } | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionAtIdx, setMentionAtIdx] = useState<number | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Hardware Android Back Button navigation within ActiveRoom:
  // Step 1: Dismiss any active submodal / sheet (scholar profile, ban, delete)
  // Step 2: Dismiss mention popup or active reply quote
  // Step 3: If on 'chat' or 'settings', step back to 'home'
  // Step 4: If already on 'home', step back to Study Rooms list (calls onBack())
  useEffect(() => {
    return registerBackButtonHandler(() => {
      if (selectedScholar) {
        setSelectedScholar(null);
        return true;
      }
      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
        return true;
      }
      if (memberToBan) {
        setMemberToBan(null);
        return true;
      }
      if (mentionQuery !== null) {
        setMentionQuery(null);
        return true;
      }
      if (replyingTo !== null) {
        setReplyingTo(null);
        return true;
      }

      if (roomTab !== 'home') {
        handleSelectRoomTab('home');
        return true;
      }

      onBack();
      return true;
    });
  }, [
    selectedScholar,
    showDeleteConfirm,
    memberToBan,
    mentionQuery,
    replyingTo,
    roomTab,
    handleSelectRoomTab,
    onBack,
  ]);

  const isTimerRunning = isRunning;

  const profile = useMemo(() => {
    if (!user) return null;
    return {
      username: (user as any).username || user.displayName || 'Scholar',
      avatar_url: resolveAppAvatar(
        user.avatarUrl || (user as any).avatar_url,
        (user as any).username || user.displayName || user.id
      ),
    };
  }, [
    user?.id,
    (user as any)?.username,
    user?.displayName,
    user?.avatarUrl,
    (user as any)?.avatar_url,
  ]);

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const channelRef = useRef<any>(null);
  const chatChannelRef = useRef<any>(null);
  const globalHubRef = useRef<any>(null);
  const isSubscribedRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAdjustRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
  const isPrependingRef = useRef<boolean>(false);
  const clientIdRef = useRef(Math.random().toString(36).substring(2, 7));

  // Refs for frequently changing values to prevent effect re-runs
  const getTodayTotalSecondsRef = useRef(getTodayTotalSeconds);
  const isTimerRunningRef = useRef(isTimerRunning);
  const elapsedSecondsRef = useRef(elapsedSeconds);

  useEffect(() => {
    getTodayTotalSecondsRef.current = getTodayTotalSeconds;
    isTimerRunningRef.current = isTimerRunning;
    elapsedSecondsRef.current = elapsedSeconds;
  }, [getTodayTotalSeconds, isTimerRunning, elapsedSeconds]);

  // Keep local profile cache seeded with current user profile
  useEffect(() => {
    if (user?.id) {
      const myAvatar = resolveAppAvatar(
        profile?.avatar_url || user?.avatarUrl || (user as any)?.avatar_url,
        profile?.username || user?.displayName || user?.id
      );
      const myName = profile?.username || user?.displayName || user?.email?.split('@')[0] || 'Scholar';
      cacheMemberProfiles([{ id: user.id, username: myName, avatar_url: myAvatar }]);
    }
  }, [user?.id, profile?.avatar_url, profile?.username, user?.avatarUrl, user?.displayName, user?.email]);


  // Ticker to smoothly update live study timers every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle incoming focus broadcast from another peer
  const handleFocusUpdate = useCallback(
    (payload: any) => {
      if (!payload || !payload.user_id) return;
      if (payload.user_id === user?.id) return;

      const isStudying = Boolean(payload.is_studying);
      const sessionSeconds = Math.max(0, Number(payload.session_seconds || 0));
      const todayTotal = Math.max(0, Number(payload.today_seconds || 0));
      const baseToday = payload.base_today_seconds !== undefined
        ? Math.max(0, Number(payload.base_today_seconds))
        : Math.max(0, todayTotal - (isStudying ? sessionSeconds : 0));

      const now = Date.now();

      setLiveFocusMap((prev) => {
        const existing = prev[payload.user_id];
        let effectiveStartTime: number;

        if (isStudying) {
          if (payload.session_start_time) {
            effectiveStartTime = payload.session_start_time;
          } else if (existing && existing.is_studying && existing.start_time) {
            // Smooth monotonic check: if local calculated progress is within 3s of payload, preserve start_time
            const currentComputed = Math.max(0, Math.floor((now - existing.start_time) / 1000));
            if (Math.abs(sessionSeconds - currentComputed) <= 3) {
              effectiveStartTime = existing.start_time;
            } else {
              effectiveStartTime = now - (sessionSeconds * 1000);
            }
          } else {
            effectiveStartTime = now - (sessionSeconds * 1000);
          }
        } else {
          effectiveStartTime = 0;
        }

        // Deduplication: prevent duplicate state updates if telemetry hasn't changed
        if (
          existing &&
          existing.is_studying === isStudying &&
          existing.start_time === effectiveStartTime &&
          existing.room_flair === (payload.room_flair || payload.flair || null) &&
          existing.base_today_seconds === baseToday &&
          now - existing.last_seen < 4000
        ) {
          return prev;
        }

        return {
          ...prev,
          [payload.user_id]: {
            is_studying: isStudying,
            start_time: effectiveStartTime,
            received_at: now,
            base_session_seconds: sessionSeconds,
            base_today_seconds: baseToday,
            today_seconds: todayTotal,
            is_premium: Boolean(payload.is_premium),
            flair_frame: payload.flair_frame || (payload.is_premium ? 'gold' : null),
            room_flair: payload.room_flair || payload.flair || null,
            last_seen: now,
          },
        };
      });
    },
    [user?.id]
  );

  // Broadcast current focus telemetry over room chat and global study hub
  const sendFocusBroadcast = useCallback(() => {
    if (!user?.id) return;
    const isRunning = isTimerRunningRef.current;
    const elapsed = elapsedSecondsRef.current;
    const todayTotal = getTodayTotalSecondsRef.current ? getTodayTotalSecondsRef.current() : 0;
    const baseToday = Math.max(0, todayTotal - (isRunning ? elapsed : 0));
    const now = Date.now();
    
    const payload = {
      user_id: user.id,
      is_studying: isRunning,
      session_seconds: elapsed,
      session_start_time: isRunning ? now - (elapsed * 1000) : null,
      base_today_seconds: baseToday,
      today_seconds: todayTotal,
      is_premium: isPremium,
      flair_frame: isPremium ? 'gold' : null,
      timestamp: now,
    };

    if (chatChannelRef.current) {
      try {
        chatChannelRef.current
          .send({
            type: 'broadcast',
            event: 'focus_status_update',
            payload,
          })
          .catch(() => {});
      } catch (err) {}
    }

    if (globalHubRef.current) {
      try {
        globalHubRef.current
          .send({
            type: 'broadcast',
            event: 'focus_status_update',
            payload,
          })
          .catch(() => {});
      } catch (err) {}
    }
  }, [user?.id, isPremium]);

  // Periodic heartbeat broadcast while studying so all peers see live progress (12s is optimal for start_time anchors)
  useEffect(() => {
    sendFocusBroadcast();
    if (!isTimerRunning) return;

    const interval = setInterval(() => {
      sendFocusBroadcast();
    }, 12000);

    return () => clearInterval(interval);
  }, [isTimerRunning, sendFocusBroadcast]);

  // Real-time listener on global study rooms hub to capture focus progress across all tabs
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    const globalHub = supabase.channel('study_rooms_realtime_hub');
    globalHubRef.current = globalHub;

    globalHub
      .on('broadcast', { event: 'focus_status_update' }, (payload) => {
        handleFocusUpdate(payload.payload);
      })
      .on('broadcast', { event: 'ping_focus_status' }, () => {
        if (isTimerRunningRef.current) {
          sendFocusBroadcast();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(globalHub);
      globalHubRef.current = null;
    };
  }, [handleFocusUpdate, sendFocusBroadcast]);

  // On mount, ask other peers for their active focus status
  useEffect(() => {
    const timer = setTimeout(() => {
      if (chatChannelRef.current) {
        try {
          chatChannelRef.current
            .send({
              type: 'broadcast',
              event: 'ping_focus_status',
              payload: { requester_id: user?.id },
            })
            .catch(() => {});
        } catch (err) {}
      }
      if (globalHubRef.current) {
        try {
          globalHubRef.current
            .send({
              type: 'broadcast',
              event: 'ping_focus_status',
              payload: { requester_id: user?.id },
            })
            .catch(() => {});
        } catch (err) {}
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [user?.id]);

  // Fetch all registered members of this room + their active sessions and total study time today
  const fetchRoomMembers = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !roomId) return;

    try {
      // 1. Fetch room details
      const { data: roomData } = await supabase
        .from('study_rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();

      if (roomData) {
        setRoomInfo(roomData);
        if (roomData.name) {
          setRoomName(roomData.name);
        }
        if (!isFormDirtyRef.current) {
          setEditName(roomData.name || '');
          setEditDescription(roomData.description || '');
          setIsPrivate(Boolean(roomData.is_private));
          setEditPassword(roomData.password || '');
          setEditMaxCapacity(roomData.max_capacity || 4);
        }
      }

      // 2. Fetch all registered room members
      const { data: membersData } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', roomId);

      const hostId = roomData?.host_id;
      const allUserIds = Array.from(
        new Set([
          ...(membersData?.map((m: any) => m.user_id) || []),
          ...(hostId ? [hostId] : []),
        ])
      ).filter(Boolean);

      if (allUserIds.length === 0) return;

      // 3. Fetch user profiles for all members
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, name, avatar_url')
        .in('id', allUserIds);

      if (profilesData && profilesData.length > 0) {
        cacheMemberProfiles(profilesData);
      }

      // 4. Fetch active study sessions for all members
      const { data: activeSessionsData } = await supabase
        .from('active_sessions')
        .select('user_id, status, started_at, accumulated_seconds')
        .in('user_id', allUserIds);

      // 5. Fetch study sessions today for all members
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const queryIso = new Date(startOfDay.getTime() - 12 * 3600 * 1000).toISOString();

      const { data: todaySessionsData } = await supabase
        .from('study_sessions')
        .select('user_id, duration_seconds, started_at')
        .in('user_id', allUserIds)
        .gte('started_at', queryIso);

      const userTodayMap = new Map<string, number>();
      (todaySessionsData || []).forEach((s: any) => {
        const time = new Date(s.started_at).getTime();
        if (time >= startOfDay.getTime()) {
          const sec = Number(s.duration_seconds || 0);
          userTodayMap.set(s.user_id, (userTodayMap.get(s.user_id) || 0) + sec);
        }
      });

      const profilesMap = new Map((profilesData || []).map((p: any) => [p.id, p]));
      const sessionsMap = new Map((activeSessionsData || []).map((s: any) => [s.user_id, s]));

      const membersList: RoomMemberInfo[] = allUserIds.map((uid) => {
        const prof = profilesMap.get(uid);
        const cached = getCachedMemberProfile(uid);
        const sess = sessionsMap.get(uid);
        const isHost = uid === hostId;
        const isSessionRunning = sess?.status === 'running';
        const startTime = sess?.started_at ? new Date(sess.started_at).getTime() : null;

        const baseToday = userTodayMap.get(uid) || 0;

        const resolvedUsername =
          prof?.username ||
          prof?.name ||
          cached?.username ||
          (uid === user?.id ? (profileRef.current?.username || user?.displayName || 'Scholar') : 'Scholar');

        const resolvedAvatar =
          prof?.avatar_url ||
          cached?.avatar_url ||
          (uid === user?.id ? (profileRef.current?.avatar_url || user?.avatarUrl) : null);

        return {
          user_id: uid,
          username: resolvedUsername,
          avatar_url: resolvedAvatar,
          is_host: isHost,
          is_studying: isSessionRunning,
          timer_start_at: startTime,
          accumulated_seconds: Number(sess?.accumulated_seconds || 0),
          base_today_seconds: baseToday,
          today_seconds: baseToday,
          is_online: false,
        };
      });

      setDbMembers(membersList);

      // Seed liveFocusMap with active session members from DB if no fresher telemetry exists
      const nowTs = Date.now();
      setLiveFocusMap((prev) => {
        let updated = { ...prev };
        let hasChanges = false;
        for (const m of membersList) {
          if (m.user_id === user?.id) continue;
          const existing = prev[m.user_id];
          if (!existing || nowTs - existing.last_seen > 15000) {
            if (m.is_studying) {
              hasChanges = true;
              const elapsed = m.timer_start_at
                ? Math.max(0, Math.floor((nowTs - m.timer_start_at) / 1000)) + (m.accumulated_seconds || 0)
                : (m.accumulated_seconds || 0);
              const startTime = m.timer_start_at || (nowTs - elapsed * 1000);
              updated[m.user_id] = {
                is_studying: true,
                start_time: startTime,
                received_at: nowTs,
                base_session_seconds: elapsed,
                base_today_seconds: m.base_today_seconds || 0,
                today_seconds: (m.base_today_seconds || 0) + elapsed,
                last_seen: nowTs,
              };
            }
          }
        }
        return hasChanges ? updated : prev;
      });

      // 6. Fetch banned scholars for this room
      const { data: banRecords } = await supabase
        .from('room_messages')
        .select('content, created_at')
        .eq('room_id', roomId)
        .ilike('content', '%[SYSTEM_%')
        .order('created_at', { ascending: true });

      const banMap = new Map<string, { userId: string; username: string }>();
      if (banRecords) {
        for (const record of banRecords) {
          if (record.content?.startsWith('[SYSTEM_BAN]:')) {
            try {
              const parsed = JSON.parse(record.content.replace('[SYSTEM_BAN]:', ''));
              banMap.set(parsed.userId, { userId: parsed.userId, username: parsed.username });
            } catch {}
          } else if (record.content?.startsWith('[SYSTEM_UNBAN]:')) {
            try {
              const parsed = JSON.parse(record.content.replace('[SYSTEM_UNBAN]:', ''));
              banMap.delete(parsed.userId);
            } catch {}
          }
        }
      }
      setBannedMembers(Array.from(banMap.values()));

      if (user?.id && banMap.has(user.id)) {
        toast.error('You were banned from this room by the host.');
        onBack();
        return;
      }
    } catch (err) {
      console.error('Error fetching room members:', err);
    }
  }, [roomId, user?.id]);

  useEffect(() => {
    fetchRoomMembers();

    // 10-second polling interval to keep active sessions and member changes in sync
    const interval = setInterval(() => {
      fetchRoomMembers();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchRoomMembers]);

  // Real-time listener for room member changes and study room updates
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !roomId) return;

    const hubChannel = supabase.channel(`room_members_hub_${roomId}`);
    hubChannel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
        () => {
          fetchRoomMembers();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_sessions' },
        () => {
          fetchRoomMembers();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'study_sessions' },
        () => {
          fetchRoomMembers();
        }
      )
      .on('broadcast', { event: 'room_changed' }, () => {
        fetchRoomMembers();
      })
      .on('broadcast', { event: 'focus_status_update' }, (payload) => {
        handleFocusUpdate(payload.payload);
      })
      .on('broadcast', { event: 'ping_focus_status' }, () => {
        if (isTimerRunningRef.current) {
          sendFocusBroadcast();
        }
      })
      .on('broadcast', { event: 'member_banned' }, (payload: any) => {
        const bannedId = payload.payload?.userId;
        const bannedName = payload.payload?.username || 'A scholar';
        if (bannedId === user?.id) {
          toast.error('You were banned from this room by the host.');
          onBack();
        } else {
          fetchRoomMembers();
          fetchMessages();
        }
      })
      .on('broadcast', { event: 'member_unbanned' }, () => {
        fetchRoomMembers();
        fetchMessages();
      })
      .on('broadcast', { event: 'member_nudged' }, (payload: any) => {
        handleIncomingNudge(payload.payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(hubChannel);
    };
  }, [roomId, fetchRoomMembers, handleFocusUpdate, sendFocusBroadcast, handleIncomingNudge]);

  // Realtime Presence Channel
  useEffect(() => {
    if (!user?.id) return;

    const supabase = getSupabase();
    if (!supabase) return;

    isSubscribedRef.current = false;

    const presenceChannel = supabase.channel(`presence_room_${roomId}`, {
      config: { presence: { key: `${user.id}_${clientIdRef.current}` } },
    });
    channelRef.current = presenceChannel;

    const syncPresence = () => {
      if (!channelRef.current) return;
      const state = channelRef.current.presenceState();
      const flat = Object.values(state).flat();
      setPresentUsers(flat);

      // Merge real-time presence flair for other room members (never override current user's local state)
      for (const p of flat as any[]) {
        if (p?.user_id && p.user_id !== user?.id && (p.is_premium || p.flair_frame)) {
          setFlairMap((prev) => (prev[p.user_id] ? prev : { ...prev, [p.user_id]: p.flair_frame || 'gold' }));
        }
      }

      const now = Date.now();
      setLiveFocusMap((prev) => {
        let updated = { ...prev };
        let hasChanges = false;
        for (const p of flat as any[]) {
          if (!p?.user_id || p.user_id === user?.id) continue;
          const existing = prev[p.user_id];
          if (!existing || now - existing.last_seen > 12000) {
            hasChanges = true;
            const isStudying = Boolean(p.is_studying);
            const elapsed = Math.max(0, Number(p.elapsed_seconds || 0));
            const today = Math.max(0, Number(p.today_seconds || 0));
            const baseToday = p.base_today_seconds !== undefined
              ? Math.max(0, Number(p.base_today_seconds))
              : Math.max(0, today - (isStudying ? elapsed : 0));

            const startTime = isStudying
              ? (p.session_start_time || existing?.start_time || (now - elapsed * 1000))
              : 0;

            updated[p.user_id] = {
              is_studying: isStudying,
              start_time: startTime,
              received_at: now,
              base_session_seconds: elapsed,
              base_today_seconds: baseToday,
              today_seconds: today,
              is_premium: Boolean(p.is_premium),
              flair_frame: p.flair_frame || (p.is_premium ? 'gold' : null),
              room_flair: p.room_flair || null,
              last_seen: now,
            };
          }
        }
        return hasChanges ? updated : prev;
      });
    };

    presenceChannel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true;
          try {
            const isRunning = isTimerRunningRef.current;
            const elapsed = elapsedSecondsRef.current;
            const todayTotal = getTodayTotalSeconds ? getTodayTotalSeconds() : 0;
            const baseToday = Math.max(0, todayTotal - (isRunning ? elapsed : 0));

            const myUsername =
              profileRef.current?.username ||
              user?.displayName ||
              user?.email?.split('@')[0] ||
              getCachedMemberProfile(user.id)?.username ||
              'Scholar';
            const myAvatar = resolveAppAvatar(
              profileRef.current?.avatar_url ||
              user?.avatarUrl ||
              (user as any)?.avatar_url ||
              getCachedMemberProfile(user.id)?.avatar_url,
              myUsername || user.id
            );

            await presenceChannel.track({
              user_id: user.id,
              client_id: clientIdRef.current,
              username: myUsername,
              avatar_url: myAvatar,
              is_studying: isRunning,
              session_start_time: isRunning ? Date.now() - (elapsed * 1000) : null,
              elapsed_seconds: elapsed,
              base_today_seconds: baseToday,
              today_seconds: todayTotal,
              is_premium: isPremium,
              flair_frame: isPremium ? 'gold' : null,
            });
          } catch (err) {
            console.error('Initial presence track error:', err);
          }
        }
      });

    // Switched to Broadcast to bypass RLS streaming blocks
    const chatChannel = supabase.channel(`chat_room_${roomId}`);
    chatChannelRef.current = chatChannel;

    chatChannel
      .on('broadcast', { event: 'new_message' }, (payload) => {
        if (payload?.payload) {
          const rawMsg = payload.payload;
          const p = Array.isArray(rawMsg.profiles) ? rawMsg.profiles[0] : rawMsg.profiles;
          if (p && rawMsg.user_id) {
            cacheMemberProfiles([{
              id: rawMsg.user_id,
              username: p.username || p.name,
              avatar_url: p.avatar_url,
            }]);
          }
          setMessages((prev) => {
            if (prev.find((m) => m.id === rawMsg.id)) return prev;
            
            if (roomTabRef.current !== 'chat' && rawMsg.user_id !== user?.id) {
              setUnreadCount((c) => c + 1);
            }

            return [...prev, rawMsg];
          });
        }
      })
      .on('broadcast', { event: 'focus_status_update' }, (payload) => {
        handleFocusUpdate(payload.payload);
      })
      .on('broadcast', { event: 'ping_focus_status' }, () => {
        if (isTimerRunningRef.current) {
          sendFocusBroadcast();
        }
      })
      .subscribe();

    return () => {
      isSubscribedRef.current = false;
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(chatChannel);
      channelRef.current = null;
      chatChannelRef.current = null;
    };
  }, [roomId, user?.id, handleFocusUpdate, sendFocusBroadcast]);

  // Update presence status live when timer starts or stops
  useEffect(() => {
    if (channelRef.current && user?.id && isSubscribedRef.current) {
      try {
        const isRunning = isTimerRunning;
        const elapsed = elapsedSecondsRef.current;
        const todayTotal = getTodayTotalSecondsRef.current ? getTodayTotalSecondsRef.current() : 0;
        const baseToday = Math.max(0, todayTotal - (isRunning ? elapsed : 0));

        const myUsername =
          profile?.username ||
          user?.displayName ||
          user?.email?.split('@')[0] ||
          getCachedMemberProfile(user.id)?.username ||
          'Scholar';
        const myAvatar = resolveAppAvatar(
          profile?.avatar_url ||
          user?.avatarUrl ||
          (user as any)?.avatar_url ||
          getCachedMemberProfile(user.id)?.avatar_url,
          myUsername || user.id
        );

        channelRef.current.track({
          user_id: user.id,
          client_id: clientIdRef.current,
          username: myUsername,
          avatar_url: myAvatar,
          is_studying: isRunning,
          session_start_time: isRunning ? Date.now() - (elapsed * 1000) : null,
          elapsed_seconds: elapsed,
          base_today_seconds: baseToday,
          today_seconds: todayTotal,
          is_premium: isPremium,
          flair_frame: isPremium ? 'gold' : null,
        });
      } catch (err) {
        console.error('Tracking error:', err);
      }
    }
    sendFocusBroadcast();
  }, [
    isTimerRunning,
    user?.id,
    profile?.username,
    profile?.avatar_url,
    isPremium,
    sendFocusBroadcast,
  ]);

  // Fetch chat messages (initial 50 latest)
  const fetchMessages = useCallback(async () => {
    if (!user || !roomId) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const { data, error } = await supabase
      .from('room_messages')
      .select(`
        id, content, created_at, user_id,
        profiles ( id, username, name, avatar_url )
      `)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      const profsToCache: any[] = [];
      data.forEach((m: any) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        if (p && m.user_id) {
          profsToCache.push({
            id: m.user_id,
            username: p.username || p.name,
            name: p.name,
            avatar_url: p.avatar_url,
          });
        }
      });
      if (profsToCache.length > 0) {
        cacheMemberProfiles(profsToCache);
      }

      const chronological = [...data].reverse();
      setMessages(chronological);

      // Sync any active [SYSTEM_NUDGE] cooldowns from the past 15 minutes for the CURRENT user only
      const now = Date.now();
      const nudgeMap: Record<string, number> = {};
      data.forEach((m: any) => {
        if (m.content?.startsWith('[SYSTEM_NUDGE]:')) {
          try {
            const parsed = JSON.parse(m.content.replace('[SYSTEM_NUDGE]:', ''));
            // Enforce cooldown ONLY if the current logged-in user was the sender of that nudge
            if (
              user?.id &&
              parsed.fromUserId === user.id &&
              parsed.targetUserId &&
              parsed.timestamp &&
              now - parsed.timestamp < NUDGE_COOLDOWN_MS
            ) {
              if (!nudgeMap[parsed.targetUserId] || parsed.timestamp > nudgeMap[parsed.targetUserId]) {
                nudgeMap[parsed.targetUserId] = parsed.timestamp;
              }
            }
          } catch {}
        }
      });
      if (Object.keys(nudgeMap).length > 0) {
        setNudgeTimestamps((prev) => ({ ...prev, ...nudgeMap }));
      }

      if (data.length < 50) {
        setHasMoreMessages(false);
      } else {
        setHasMoreMessages(true);
      }
    }
  }, [roomId, user]);

  // Load previous messages pagination
  const loadMoreMessages = useCallback(async () => {
    if (!user || !roomId || isLoadingMore || !hasMoreMessages) return;
    const supabase = getSupabase();
    if (!supabase) return;

    setIsLoadingMore(true);

    try {
      if (messagesEndRef.current) {
        scrollAdjustRef.current = {
          prevScrollHeight: messagesEndRef.current.scrollHeight,
          prevScrollTop: messagesEndRef.current.scrollTop,
        };
        isPrependingRef.current = true;
      }

      const startIndex = messages.length;
      const endIndex = messages.length + 49;

      const { data, error } = await supabase
        .from('room_messages')
        .select(`
          id, content, created_at, user_id,
          profiles ( id, username, name, avatar_url )
        `)
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .range(startIndex, endIndex);

      if (error) {
        console.error('Failed to load older messages:', error);
        toast.error('Failed to load older messages');
        scrollAdjustRef.current = null;
        isPrependingRef.current = false;
        return;
      }

      if (data) {
        const profsToCache: any[] = [];
        data.forEach((m: any) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          if (p && m.user_id) {
            profsToCache.push({
              id: m.user_id,
              username: p.username || p.name,
              name: p.name,
              avatar_url: p.avatar_url,
            });
          }
        });
        if (profsToCache.length > 0) {
          cacheMemberProfiles(profsToCache);
        }

        if (data.length < 50) {
          setHasMoreMessages(false);
        }
        if (data.length > 0) {
          const olderBatch = [...data].reverse();
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const uniqueOlder = olderBatch.filter((m) => !existingIds.has(m.id));
            return [...uniqueOlder, ...prev];
          });
        }
      }
    } catch (err) {
      console.error('Error loading older messages:', err);
      scrollAdjustRef.current = null;
      isPrependingRef.current = false;
    } finally {
      setIsLoadingMore(false);
    }
  }, [user, roomId, isLoadingMore, hasMoreMessages, messages.length]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleConfirmBan = async () => {
    if (!memberToBan || !user || !roomId || !isHost) return;
    setIsBanning(true);

    try {
      const targetUserId = memberToBan.userId;
      const targetUsername = memberToBan.username;

      // 1. Server action
      let serverActionSuccess = false;
      try {
        const res = await banRoomMemberAction({
          roomId,
          targetUserId,
          targetUsername,
        });
        if (res && res.success) {
          serverActionSuccess = true;
        }
      } catch (e) {
        console.warn('Server action ban error:', e);
      }

      // 2. Client-side fallback
      const supabase = getSupabase();
      if (supabase) {
        await supabase
          .from('room_members')
          .delete()
          .eq('room_id', roomId)
          .eq('user_id', targetUserId);

        await supabase
          .from('room_presence')
          .delete()
          .eq('room_id', roomId)
          .eq('user_id', targetUserId);

        if (!serverActionSuccess) {
          const banPayload = JSON.stringify({
            type: 'ban',
            userId: targetUserId,
            username: targetUsername,
            timestamp: Date.now(),
          });

          await supabase
            .from('room_messages')
            .insert({
              room_id: roomId,
              user_id: user.id,
              content: `[SYSTEM_BAN]:${banPayload}`,
            });
        }

        const roomChannel = supabase.channel(`room_members_hub_${roomId}`);
        roomChannel.send({
          type: 'broadcast',
          event: 'member_banned',
          payload: { roomId, userId: targetUserId, username: targetUsername, timestamp: Date.now() },
        });

        const lobbyChannel = supabase.channel('study_rooms_lobby_hub');
        lobbyChannel.send({
          type: 'broadcast',
          event: 'lobby_update',
          payload: { timestamp: Date.now() },
        });
      }

      toast.success(`${targetUsername} was banned from the room.`);
      setMemberToBan(null);
      await fetchRoomMembers();
      await fetchMessages();
    } catch (err: any) {
      toast.error('Failed to ban member: ' + (err.message || 'Unknown error'));
    } finally {
      setIsBanning(false);
    }
  };

  const handleUnban = async (targetUserId: string, targetUsername: string) => {
    if (!user || !roomId || !isHost) return;
    setIsUnbanning(targetUserId);

    try {
      // 1. Server action
      let serverActionSuccess = false;
      try {
        const res = await unbanRoomMemberAction({
          roomId,
          targetUserId,
          targetUsername,
        });
        if (res && res.success) {
          serverActionSuccess = true;
        }
      } catch (e) {
        console.warn('Server action unban error:', e);
      }

      // 2. Client-side fallback
      const supabase = getSupabase();
      if (supabase) {
        if (!serverActionSuccess) {
          const unbanPayload = JSON.stringify({
            type: 'unban',
            userId: targetUserId,
            username: targetUsername,
            timestamp: Date.now(),
          });

          await supabase
            .from('room_messages')
            .insert({
              room_id: roomId,
              user_id: user.id,
              content: `[SYSTEM_UNBAN]:${unbanPayload}`,
            });
        }

        const roomChannel = supabase.channel(`room_members_hub_${roomId}`);
        roomChannel.send({
          type: 'broadcast',
          event: 'member_unbanned',
          payload: { roomId, userId: targetUserId, username: targetUsername, timestamp: Date.now() },
        });
      }

      toast.success(`${targetUsername} was unbanned.`);
      await fetchRoomMembers();
      await fetchMessages();
    } catch (err: any) {
      toast.error('Failed to unban: ' + (err.message || 'Unknown error'));
    } finally {
      setIsUnbanning(null);
    }
  };

  useLayoutEffect(() => {
    if (roomTab !== 'chat' || !messagesEndRef.current) return;
    const el = messagesEndRef.current;

    if (scrollAdjustRef.current) {
      const { prevScrollHeight, prevScrollTop } = scrollAdjustRef.current;
      const heightDiff = el.scrollHeight - prevScrollHeight;
      el.scrollTop = prevScrollTop + heightDiff;
      scrollAdjustRef.current = null;
    }
  }, [messages, roomTab]);

  useEffect(() => {
    if (roomTab === 'chat' && messagesEndRef.current) {
      if (isPrependingRef.current) {
        isPrependingRef.current = false;
        return;
      }
      const el = messagesEndRef.current;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, roomTab]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || isSending) return;

    setIsSending(true);
    const supabase = getSupabase();
    if (!supabase) return;

    const myUsername = profile?.username || user.username || user.displayName || 'Scholar';
    const myAvatar = profile?.avatar_url || user.avatarUrl;

    let contentToSend = newMessage.trim();
    if (replyingTo) {
      contentToSend = formatReplyPayload(replyingTo, contentToSend);
    }

    const { data, error } = await supabase
      .from('room_messages')
      .insert({
        room_id: roomId,
        user_id: user.id,
        content: contentToSend,
      })
      .select(`
        id, content, created_at, user_id,
        profiles ( id, username, name, avatar_url )
      `)
      .single();

    if (error) {
      console.error(error);
      alert('Failed to send message.');
    } else if (data) {
      const p = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
      const normalizedMsg = {
        ...data,
        profiles: {
          id: user.id,
          username: p?.username || myUsername,
          name: p?.name || user.displayName || myUsername,
          avatar_url: p?.avatar_url || myAvatar,
        },
      };

      cacheMemberProfiles([{
        id: user.id,
        username: normalizedMsg.profiles.username,
        avatar_url: normalizedMsg.profiles.avatar_url,
      }]);

      setNewMessage('');
      setReplyingTo(null);
      setMentionQuery(null);
      setMentionAtIdx(null);
      if (typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window)) {
        chatInputRef.current?.blur();
      }
      setMessages((prev) => [...prev, normalizedMsg]);

      // Detect mentions for notification
      const mentions = extractMentions(newMessage);

      // Outbound FCM push notification for room members in background
      supabase.functions.invoke('send-notification', {
        body: {
          room_id: roomId,
          room_name: roomName || roomInfo?.name,
          sender_id: user.id,
          sender_username: myUsername,
          type: 'chat',
          message: data.content,
          mentions,
        },
      }).catch((err) => console.warn('[ActiveRoom] Room chat push notification error:', err));

      if (chatChannelRef.current) {
        try {
          chatChannelRef.current
            .send({
              type: 'broadcast',
              event: 'new_message',
              payload: normalizedMsg,
            })
            .catch(console.error);
        } catch (err) {
          console.warn('Failed to broadcast message locally', err);
        }
      }
    }
    setIsSending(false);
  };

  // Merge DB registered members with live Realtime presence & broadcast focus telemetry
  const displayUsers = useMemo(() => {
    const presentMap = new Map<string, any>();
    presentUsers.forEach((pu) => {
      if (pu?.user_id) {
        presentMap.set(pu.user_id, pu);
      }
    });

    const result: any[] = [];
    const seenUserIds = new Set<string>();

    for (const member of dbMembers) {
      seenUserIds.add(member.user_id);
      const isCurrentUser = member.user_id === user?.id;
      const pu = presentMap.get(member.user_id);
      const liveFocus = liveFocusMap[member.user_id];

      let isStudying = false;
      let isOnline = false;
      let sessionSeconds = 0;
      let baseToday = member.base_today_seconds ?? member.today_seconds ?? 0;
      let totalFocusSeconds = baseToday;

      if (isCurrentUser) {
        isStudying = isTimerRunning;
        sessionSeconds = isTimerRunning ? elapsedSeconds : 0;
        isOnline = true;
        totalFocusSeconds = getTodayTotalSeconds ? getTodayTotalSeconds() : sessionSeconds;
        baseToday = Math.max(0, totalFocusSeconds - sessionSeconds);
      } else if (liveFocus && (nowTick - liveFocus.last_seen < 60000 || pu)) {
        // High-priority peer-to-peer broadcast telemetry
        isOnline = Boolean(pu || nowTick - liveFocus.last_seen < 60000);
        isStudying = liveFocus.is_studying;
        baseToday = Math.max(baseToday, liveFocus.base_today_seconds ?? 0);

        if (isStudying) {
          if (liveFocus.start_time) {
            sessionSeconds = Math.max(0, Math.floor((nowTick - liveFocus.start_time) / 1000));
          } else {
            const elapsedSinceSync = Math.max(0, Math.floor((nowTick - liveFocus.received_at) / 1000));
            sessionSeconds = (liveFocus.base_session_seconds || 0) + elapsedSinceSync;
          }
          totalFocusSeconds = baseToday + sessionSeconds;
        } else {
          sessionSeconds = liveFocus.base_session_seconds || 0;
          totalFocusSeconds = Math.max(baseToday, liveFocus.today_seconds || baseToday);
        }
      } else if (pu) {
        // Realtime presence state
        isOnline = true;
        isStudying = Boolean(pu.is_studying);
        const puElapsed = Number(pu.elapsed_seconds || 0);
        const puToday = Number(pu.today_seconds || 0);
        const puBase = pu.base_today_seconds !== undefined
          ? Number(pu.base_today_seconds)
          : Math.max(0, puToday - (isStudying ? puElapsed : 0));
        baseToday = Math.max(baseToday, puBase);

        if (isStudying) {
          sessionSeconds = puElapsed;
          totalFocusSeconds = baseToday + sessionSeconds;
        } else {
          sessionSeconds = 0;
          totalFocusSeconds = baseToday;
        }
      } else {
        // Database active_sessions fallback
        isOnline = false;
        isStudying = member.is_studying;
        if (isStudying && member.timer_start_at) {
          sessionSeconds = Math.max(
            0,
            Math.floor((nowTick - member.timer_start_at) / 1000) + (member.accumulated_seconds || 0)
          );
          totalFocusSeconds = baseToday + sessionSeconds;
        } else {
          sessionSeconds = 0;
          totalFocusSeconds = baseToday;
        }
      }

      const cached = getCachedMemberProfile(member.user_id);
      result.push({
        ...member,
        username:
          (isCurrentUser ? profile?.username : null) ||
          member.username ||
          cached?.username ||
          pu?.username ||
          'Scholar',
        avatar_url:
          (isCurrentUser ? profile?.avatar_url : null) ||
          member.avatar_url ||
          cached?.avatar_url ||
          pu?.avatar_url ||
          null,
        is_studying: isStudying,
        session_seconds: sessionSeconds,
        today_seconds: baseToday,
        total_focus_seconds: totalFocusSeconds,
        is_online: isOnline,
        is_current_user: isCurrentUser,
      });
    }

    // Ensure current user is always included even before dbMembers load
    if (user?.id && !seenUserIds.has(user.id)) {
      const sessionSeconds = isTimerRunning ? elapsedSeconds : 0;
      const totalFocus = getTodayTotalSeconds ? getTodayTotalSeconds() : sessionSeconds;
      const baseToday = Math.max(0, totalFocus - sessionSeconds);
      const cached = getCachedMemberProfile(user.id);
      result.unshift({
        user_id: user.id,
        username: profile?.username || user.displayName || cached?.username || 'Scholar',
        avatar_url: profile?.avatar_url || user.avatarUrl || cached?.avatar_url || null,
        is_host: Boolean(user?.id && roomInfo?.host_id === user.id),
        is_studying: isTimerRunning,
        session_seconds: sessionSeconds,
        today_seconds: baseToday,
        total_focus_seconds: totalFocus,
        is_online: true,
        is_current_user: true,
      });
      seenUserIds.add(user.id);
    }

    // Include any active presence users not in dbMembers
    for (const pu of presentUsers) {
      if (pu?.user_id && !seenUserIds.has(pu.user_id)) {
        seenUserIds.add(pu.user_id);
        const liveFocus = liveFocusMap[pu.user_id];
        let isStudying = Boolean(pu.is_studying);
        let sessionSeconds = Number(pu.elapsed_seconds || 0);
        let baseToday = pu.base_today_seconds !== undefined
          ? Number(pu.base_today_seconds)
          : Math.max(0, Number(pu.today_seconds || 0) - (isStudying ? sessionSeconds : 0));
        let totalFocus = baseToday + (isStudying ? sessionSeconds : 0);

        if (liveFocus) {
          isStudying = liveFocus.is_studying;
          baseToday = Math.max(baseToday, liveFocus.base_today_seconds ?? 0);
          if (isStudying) {
            if (liveFocus.start_time) {
              sessionSeconds = Math.max(0, Math.floor((nowTick - liveFocus.start_time) / 1000));
            } else {
              const elapsedSinceSync = Math.max(0, Math.floor((nowTick - liveFocus.received_at) / 1000));
              sessionSeconds = (liveFocus.base_session_seconds || 0) + elapsedSinceSync;
            }
            totalFocus = baseToday + sessionSeconds;
          } else {
            sessionSeconds = liveFocus.base_session_seconds || 0;
            totalFocus = Math.max(baseToday, liveFocus.today_seconds || baseToday);
          }
        }

        const cached = getCachedMemberProfile(pu.user_id);
        result.push({
          user_id: pu.user_id,
          username: pu.username || cached?.username || 'Scholar',
          avatar_url: pu.avatar_url || cached?.avatar_url || null,
          is_host: Boolean(pu.user_id && roomInfo?.host_id === pu.user_id),
          is_studying: isStudying,
          session_seconds: sessionSeconds,
          today_seconds: baseToday,
          total_focus_seconds: totalFocus,
          is_online: true,
          is_current_user: false,
        });
      }
    }

    // Sort group members based on study time: person who studied the most is first, least is last
    result.sort((a, b) => {
      const aTime = a.total_focus_seconds ?? 0;
      const bTime = b.total_focus_seconds ?? 0;
      if (bTime !== aTime) {
        return bTime - aTime;
      }
      if (a.is_studying !== b.is_studying) {
        return a.is_studying ? -1 : 1;
      }
      if (a.is_online !== b.is_online) {
        return a.is_online ? -1 : 1;
      }
      if (a.is_host !== b.is_host) {
        return a.is_host ? -1 : 1;
      }
      return (a.username || '').localeCompare(b.username || '');
    });

    return result;
  }, [
    dbMembers,
    presentUsers,
    liveFocusMap,
    user?.id,
    profile?.username,
    profile?.avatar_url,
    isTimerRunning,
    elapsedSeconds,
    nowTick,
    getTodayTotalSeconds,
    roomInfo?.host_id,
  ]);

  // Mention suggestion autocomplete list
  const filteredMentionUsers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return displayUsers
      .filter((u) => u.username && u.username.toLowerCase().includes(q))
      .slice(0, 6);
  }, [displayUsers, mentionQuery]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewMessage(val);
    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');

    if (lastAtIdx !== -1) {
      const charBeforeAt = lastAtIdx > 0 ? textBeforeCursor[lastAtIdx - 1] : ' ';
      if (/\s/.test(charBeforeAt) || lastAtIdx === 0) {
        const query = textBeforeCursor.slice(lastAtIdx + 1);
        if (!/\s/.test(query)) {
          setMentionQuery(query);
          setMentionAtIdx(lastAtIdx);
          return;
        }
      }
    }
    setMentionQuery(null);
    setMentionAtIdx(null);
  };

  const handleSelectMention = (userToMention: { username: string }) => {
    if (mentionAtIdx === null) return;
    const before = newMessage.slice(0, mentionAtIdx);
    const cursorPos = chatInputRef.current?.selectionStart ?? newMessage.length;
    const after = newMessage.slice(cursorPos);
    const inserted = `@${userToMention.username} `;
    const updated = `${before}${inserted}${after}`;
    setNewMessage(updated);
    setMentionQuery(null);
    setMentionAtIdx(null);
    hapticTick();
    setTimeout(() => {
      chatInputRef.current?.focus();
      const newPos = before.length + inserted.length;
      chatInputRef.current?.setSelectionRange(newPos, newPos);
    }, 50);
  };

  const handleMentionUser = (targetUsername: string) => {
    hapticTick();
    setNewMessage((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} @${targetUsername} ` : `@${targetUsername} `;
    });
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 50);
  };

  const handleStartReply = (msg: any, senderUsername: string) => {
    hapticTick();
    const { text } = parseMessageContent(msg.content);
    setReplyingTo({
      messageId: msg.id,
      username: senderUsername,
      snippet: text.trim().slice(0, 100),
    });
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 50);
  };

  const scrollToMessage = (targetMsgId: string) => {
    if (!targetMsgId) return;
    const el = document.getElementById(`msg-${targetMsgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-amber-400', 'bg-amber-500/20');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-amber-400', 'bg-amber-500/20');
      }, 1500);
    } else {
      toast('Referenced message is not in loaded history', {
        icon: 'ℹ️',
      });
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (mentionQuery !== null) {
        setMentionQuery(null);
        setMentionAtIdx(null);
        e.preventDefault();
      } else if (replyingTo) {
        setReplyingTo(null);
        e.preventDefault();
      }
    } else if (e.key === 'Tab' && mentionQuery !== null && filteredMentionUsers.length > 0) {
      e.preventDefault();
      handleSelectMention(filteredMentionUsers[0]);
    }
  };

  // Batch-fetch flair for visible room members and chat participants (stabilized key to avoid 1-second refetch loops)
  const memberIdsKey = useMemo(() => {
    const memberIds = dbMembers.map((m) => m.user_id);
    const presentIds = presentUsers.map((p) => p?.user_id).filter(Boolean);
    const chatIds = messages.map((m) => m.user_id).filter(Boolean);
    return Array.from(new Set([...memberIds, ...presentIds, ...chatIds])).filter(Boolean).sort().join(',');
  }, [dbMembers, presentUsers, messages]);

  useEffect(() => {
    if (!memberIdsKey) {
      setFlairMap({});
      return;
    }
    const uids = memberIdsKey.split(',');
    let active = true;
    fetchFlairMap(uids)
      .then((map) => {
        if (active) {
          if (isPremium && user?.id) {
            map[user.id] = map[user.id] || 'gold';
          } else if (!isPremium && user?.id) {
            delete map[user.id];
          }
          for (const pu of presentUsers as any[]) {
            if (pu?.user_id && pu.user_id !== user?.id && (pu.is_premium || pu.flair_frame)) {
              map[pu.user_id] = map[pu.user_id] || pu.flair_frame || 'gold';
            }
          }
          setFlairMap(map);
        }
      })
      .catch(() => {
        if (active) {
          const fallback: Record<string, FlairFrame> = {};
          if (isPremium && user?.id) {
            fallback[user.id] = 'gold';
          }
          setFlairMap(fallback);
        }
      });
    return () => {
      active = false;
    };
  }, [memberIdsKey, isPremium, user?.id]);

  const handleCopyPassword = () => {
    if (!editPassword) return;
    navigator.clipboard.writeText(editPassword);
    setCopiedPassword(true);
    toast.success('Room password copied to clipboard!');
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success('Room code copied!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !isHost || !roomId) return;

    if (!editName.trim()) {
      toast.error('Room name cannot be empty');
      return;
    }

    const minCap = Math.max(2, dbMembers.length);
    if (editMaxCapacity < minCap) {
      toast.error(`Capacity cannot be lower than current members (${dbMembers.length})`);
      return;
    }

    if (editMaxCapacity > 32) {
      toast.error('Max capacity cannot exceed 32 members');
      return;
    }

    if (isPrivate && !editPassword.trim()) {
      toast.error('Please enter a password for private room, or switch to Public');
      return;
    }

    setIsSaving(true);
    setSettingsError('');
    setRlsBlocked(false);

    try {
      const trimmedPass = editPassword.trim();
      const willBePrivate = isPrivate && trimmedPass.length > 0;
      const trimmedName = editName.trim();
      const capacity = editMaxCapacity;

      let savedRoom: any = null;

      // 1. Attempt Server Action first (can bypass RLS with service role if configured)
      try {
        const actionRes = await updateRoomSettingsAction({
          roomId,
          name: trimmedName,
          description: editDescription.trim() || null,
          password: willBePrivate ? trimmedPass : null,
          is_private: willBePrivate,
          max_capacity: capacity,
        });

        if (actionRes.success && actionRes.room) {
          savedRoom = actionRes.room;
        }
      } catch (actionErr) {
        console.warn('Server action room update note:', actionErr);
      }

      // 2. Client-side update fallback with user auth session
      if (!savedRoom) {
        const supabase = getSupabase();
        if (!supabase) {
          throw new Error('Supabase client is not available');
        }

        const updatePayload: any = {
          name: trimmedName,
          description: editDescription.trim() || null,
          password: willBePrivate ? trimmedPass : null,
          is_private: willBePrivate,
          max_capacity: capacity,
        };

        let { data, error } = await supabase
          .from('study_rooms')
          .update(updatePayload)
          .eq('id', roomId)
          .select();

        if (error && error.message?.includes('description')) {
          delete updatePayload.description;
          const fallback = await supabase
            .from('study_rooms')
            .update(updatePayload)
            .eq('id', roomId)
            .select();
          data = fallback.data;
          error = fallback.error;
        }

        if (error) {
          console.error('Error updating room settings:', error);
          setSettingsError(error.message || 'Failed to update settings');
          toast.error('Failed to update room settings: ' + error.message);
          return;
        }

        if (!data || data.length === 0) {
          // Zero rows updated -> PostgreSQL RLS is blocking the UPDATE!
          console.warn('RLS blocked room update: 0 rows modified.');
          setRlsBlocked(true);
          setSettingsError('Supabase Row-Level Security policy required: public.study_rooms lacks an UPDATE policy for hosts.');
          toast.error('Database permission blocked: RLS UPDATE policy required.');
          return;
        }

        savedRoom = data[0];
      }

      // 3. Update local state and propagate changes
      isFormDirtyRef.current = false;
      setRoomInfo(savedRoom);
      setRoomName(savedRoom.name);
      setEditName(savedRoom.name);
      setEditDescription(savedRoom.description || '');
      setIsPrivate(Boolean(savedRoom.is_private));
      setEditPassword(savedRoom.password || '');
      setEditMaxCapacity(savedRoom.max_capacity || capacity);

      // Refresh members and details
      await fetchRoomMembers();

      // Broadcast changes so all other clients in lobby & room refresh
      try {
        const supabase = getSupabase();
        if (supabase) {
          const lobbyChannel = supabase.channel('study_rooms_lobby_hub');
          lobbyChannel.send({
            type: 'broadcast',
            event: 'lobby_update',
            payload: { timestamp: Date.now() },
          });

          const roomChannel = supabase.channel(`room_members_hub_${roomId}`);
          roomChannel.send({
            type: 'broadcast',
            event: 'room_changed',
            payload: { timestamp: Date.now() },
          });
        }
        if (broadcast) {
          broadcast.postMessage({ type: 'lobby_update', timestamp: Date.now() });
          broadcast.postMessage({ type: 'room_changed', roomId, timestamp: Date.now() });
        }
      } catch (err) {
        console.warn('Broadcast room update error:', err);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      toast.success('Room settings updated successfully! 🎉');
    } catch (err: any) {
      console.error('Save room settings exception:', err);
      setSettingsError(err.message || 'An unexpected error occurred');
      toast.error('Error saving settings: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      data-no-swipe="true"
      className={`w-full h-full flex-1 min-h-0 bg-transparent flex flex-col relative text-slate-200 overflow-hidden ${
        isScreenShaking ? 'animate-classic-nudge-shake' : ''
      }`}
    >
      <style>{`
        @keyframes classicNudgeShake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          15% { transform: translate(-5px, 3px) rotate(-0.75deg); }
          30% { transform: translate(5px, -3px) rotate(0.75deg); }
          45% { transform: translate(-4px, 2px) rotate(-0.5deg); }
          60% { transform: translate(4px, -2px) rotate(0.5deg); }
          75% { transform: translate(-2px, 1px) rotate(-0.25deg); }
          90% { transform: translate(1px, -0.5px) rotate(0deg); }
        }
        .animate-classic-nudge-shake {
          animation: classicNudgeShake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }
        @keyframes classicNudgePulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(245, 158, 11, 0)); }
          50% { transform: scale(1.08); filter: drop-shadow(0 0 14px rgba(245, 158, 11, 0.85)); }
        }
        .animate-nudged-avatar {
          animation: classicNudgePulse 0.75s ease-in-out infinite;
        }
      `}</style>
      <header className="shrink-0 flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 border-b border-white/[0.08] bg-[#0c1017]/95 backdrop-blur-xl pt-[max(env(safe-area-inset-top,0px)+14px,36px)] sm:pt-2.5 z-30 transition-all">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              hapticTick();
              onBack();
            }}
            className="min-w-[40px] min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] active:bg-white/[0.15] border border-white/10 hover:border-white/20 text-slate-300 hover:text-white font-hud font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer shrink-0 touch-manipulation shadow-sm"
            aria-label="Leave study room"
            title="Leave study room"
          >
            <ChevronLeft className="w-4.5 h-4.5 text-slate-300" strokeWidth={2.5} />
            <span className="hidden sm:inline">LEAVE</span>
          </button>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <h1 className="text-xs sm:text-base font-hud font-bold text-white tracking-wide uppercase truncate max-w-[80px] xs:max-w-[120px] sm:max-w-[240px]">
                {roomName}
              </h1>
              <span className="text-[10px] font-hud-mono text-neutral-400 bg-white/[0.04] border border-white/10 px-2 py-0.5 rounded-full hidden sm:inline-flex items-center gap-1.5 shrink-0">
                <Users className="w-3.5 h-3.5 text-neutral-400" />
                {displayUsers.length} {displayUsers.length === 1 ? 'MEMBER' : 'MEMBERS'}
              </span>
            </div>
            {roomInfo?.description && (
              <p className="text-[11px] text-neutral-400 font-sans truncate max-w-[140px] sm:max-w-[280px] hidden xs:block" title={roomInfo.description}>
                {roomInfo.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center shrink-0">
          <div className="flex bg-black/50 border border-white/15 p-1 rounded-2xl shadow-inner backdrop-blur-md gap-1">
            <button
              type="button"
              onClick={() => handleSelectRoomTab('home')}
              className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-xs font-hud font-bold uppercase tracking-wider transition-all min-h-[38px] cursor-pointer touch-manipulation select-none active:scale-95 ${
                roomTab === 'home'
                  ? 'bg-white/[0.14] border border-white/25 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>HOME</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectRoomTab('chat')}
              className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-xs font-hud font-bold uppercase tracking-wider transition-all min-h-[38px] cursor-pointer touch-manipulation select-none relative active:scale-95 ${
                roomTab === 'chat'
                  ? 'bg-[var(--accent-soft)] border border-[var(--border)] text-[var(--accent)] shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>CHAT</span>
              {unreadCount > 0 && (
                <span
                  className="ml-0.5 text-[10px] font-hud-mono font-bold px-1.5 py-0.2 rounded-full border border-[var(--border)] animate-in zoom-in duration-200"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)', boxShadow: '0 0 8px var(--glow)' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {isHost && (
              <button
                type="button"
                onClick={() => handleSelectRoomTab('settings')}
                className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-xs font-hud font-bold uppercase tracking-wider transition-all min-h-[38px] cursor-pointer touch-manipulation select-none active:scale-95 ${
                  roomTab === 'settings'
                    ? 'bg-white/[0.14] border border-white/25 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>SETTINGS</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Dynamic Sliding Tab Track (Swipeable HOME / CHAT / SETTINGS) */}
      <div
        ref={roomSwipeContainerRef}
        className="flex-1 min-h-0 w-full overflow-hidden relative select-none touch-pan-y"
        style={{
          touchAction: 'pan-y pinch-zoom',
          contain: 'layout size',
        }}
      >
        <div
          ref={roomSwipeTrackRef}
          className="flex w-full h-full min-h-0 flex-1 will-change-transform"
          style={{
            width: `${roomTabs.length * 100}%`,
            transform: `translate3d(-${activeRoomTabIdx * (100 / roomTabs.length)}%, 0, 0)`,
            transition: 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          {roomTabs.map((tab) => {
            const isActive = tab === roomTab;
            return (
              <div
                key={tab}
                className={`flex-shrink-0 flex flex-col h-full min-h-0 ${
                  !isActive ? 'pointer-events-none' : ''
                }`}
                style={{
                  width: `${100 / roomTabs.length}%`,
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {tab === 'home' && (
                  <div className="relative w-full h-full min-h-0 flex-1 flex flex-col overflow-hidden">
                    <div
                      className="flex-1 min-h-0 w-full overflow-y-auto p-4 scrollbar-thin flex flex-col items-center pb-28 md:pb-24"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
            <div className="flex flex-wrap gap-8 justify-center items-start mt-8 pb-4 w-full">
              {displayUsers.map((u, i) => {
              const isStudying = u.is_studying;
              const sessionSec = u.session_seconds || 0;
              const todaySec = u.today_seconds || 0;
              const totalFocusSec = u.total_focus_seconds ?? (isStudying ? todaySec + sessionSec : todaySec);
              const isCurrentUser = Boolean(u.is_current_user || (user?.id && u.user_id === user.id));
              const isUserPro = isCurrentUser ? isPremium : Boolean(flairMap[u.user_id]);
              const userFlairFrame = isCurrentUser
                ? (isPremium ? (flairMap[u.user_id] || 'gold') : null)
                : flairMap[u.user_id];

              return (
                <div
                  key={u.user_id}
                  className="flex flex-col items-center gap-2 group relative transition-all duration-300 select-none"
                >
                  <div
                    onClick={() => {
                      hapticTick();
                      handleOpenScholarModal(u);
                    }}
                    role="button"
                    tabIndex={0}
                    className={`relative cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 ${
                      recentlyNudgedUsers[u.user_id] ? 'animate-nudged-avatar' : ''
                    }`}
                    title={isCurrentUser ? 'View your profile' : `View ${u.username}'s profile & nudge`}
                  >
                    {recentlyNudgedUsers[u.user_id] && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-30 pointer-events-none whitespace-nowrap bg-amber-500 text-black font-mono font-black text-[9px] px-2.5 py-0.5 rounded-full shadow-[0_0_12px_#f59e0b] border border-amber-300 flex items-center justify-center animate-bounce">
                        <span>NUDGED!</span>
                      </div>
                    )}
                    <ProAvatarRing
                      isPro={Boolean(isUserPro)}
                      isStudying={isStudying}
                      size="md"
                      defaultBorder
                    >
                      <UserAvatar
                        src={u.avatar_url}
                        name={u.username}
                        size={64}
                        className="transition-transform duration-300 pointer-events-none"
                      />
                    </ProAvatarRing>
                  </div>

                  {/* Member Name, Total Time Studied Today (Adds up live when focusing) */}
                  <div className="text-center mt-1 flex flex-col items-center max-w-[130px]">
                    <div className="flex items-center gap-1.5 justify-center">
                      <div className="inline-flex items-center gap-1 justify-center min-w-0">
                        <p
                          className={`text-sm font-bold truncate max-w-[100px] ${
                            isCurrentUser
                              ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.45)]'
                              : 'text-slate-200'
                          }`}
                          title={u.username}
                        >
                          {u.username}
                        </p>
                        {userFlairFrame && (
                          <FlairCrown frame={userFlairFrame} size={13.5} className="-ml-0.5" />
                        )}
                      </div>
                      {u.is_host && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/30 text-amber-400 font-semibold uppercase tracking-wider flex-shrink-0">
                          Host
                        </span>
                      )}
                      {u.is_current_user && !u.is_host && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/15 border border-amber-400/30 text-amber-300 font-semibold uppercase tracking-wider flex-shrink-0">
                          You
                        </span>
                      )}
                    </div>

                    {/* Displays Total Focus Time Today with live seconds ticking up from today's total */}
                    <p
                      className={`text-sm font-mono mt-1 font-bold tracking-wider transition-colors ${
                        isStudying
                          ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                          : 'text-slate-300'
                      }`}
                    >
                      {formatSeconds(totalFocusSec)}
                    </p>

                    {/* Status badge explaining state and session progress */}
                    <div className="mt-1 flex items-center justify-center">
                      {isStudying ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-400">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                          </span>
                          <span>Focusing ({formatSeconds(sessionSec)})</span>
                        </span>
                      ) : u.is_online ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-300/90 px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/25 shadow-sm">
                          <Pause className="w-2.5 h-2.5 fill-current" />
                          <span>Paused</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                          <span>Offline</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {displayUsers.length === 0 && (
              <div className="text-slate-500 text-center w-full mt-10">
                Waiting for scholars to join...
              </div>
            )}
                      </div>
                    </div>

                    {/* Floating Bottom Focus Timer Dock */}
                    <div
                      data-no-room-swipe="true"
                      className="absolute bottom-[max(calc(env(safe-area-inset-bottom,0px)+22px),28px)] sm:bottom-7 md:bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-auto select-none animate-in fade-in slide-in-from-bottom-2 duration-200"
                    >
                      <div className="flex items-center gap-2 sm:gap-3 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full bg-[#0c1017]/95 backdrop-blur-2xl border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.85)] transition-all">
                        {/* Live Indicator & Timer Readout */}
                        <div className="flex items-center gap-2 pr-2.5 border-r border-white/15">
                          <span className="relative flex h-2.5 w-2.5">
                            {isRunning ? (
                              <>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                              </>
                            ) : isPaused ? (
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                            ) : (
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-600" />
                            )}
                          </span>
                          <span className="font-mono font-bold text-xs sm:text-sm tracking-wider text-white">
                            {formatSeconds(elapsedSeconds)}
                          </span>
                        </div>

                        {/* Subject Indicator Badge */}
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 max-w-[100px] xs:max-w-[130px] shrink-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: activeSubjectColor }}
                          />
                          <span className="text-[11px] sm:text-xs font-medium text-slate-200 truncate">
                            {activeSubjectName}
                          </span>
                        </div>

                        {/* Translucent Icon-Only Control Buttons */}
                        <div className="flex items-center gap-2 pl-1 border-l border-white/15">
                          {/* START / RESUME */}
                          <button
                            type="button"
                            onClick={handleStartOrResume}
                            disabled={isRunning}
                            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all cursor-pointer touch-manipulation select-none active:scale-95 ${
                              isRunning
                                ? 'opacity-20 cursor-not-allowed bg-white/[0.02] text-slate-600 border border-white/5'
                                : isPaused
                                ? 'bg-emerald-500/30 hover:bg-emerald-500/40 active:bg-emerald-500/50 text-emerald-300 border border-emerald-400/50 backdrop-blur-sm shadow-[0_0_14px_rgba(16,185,129,0.35)]'
                                : 'bg-emerald-500/30 hover:bg-emerald-500/40 active:bg-emerald-500/50 text-emerald-300 border border-emerald-400/50 backdrop-blur-sm shadow-[0_0_14px_rgba(16,185,129,0.35)]'
                            }`}
                            title={isRunning ? 'Timer is currently running' : isPaused ? 'Resume focus timer' : 'Start focus timer'}
                            aria-label={isPaused ? 'Resume timer' : 'Start timer'}
                          >
                            <Play className="w-4.5 h-4.5 sm:w-5 sm:h-5 fill-current ml-0.5" />
                          </button>

                          {/* PAUSE */}
                          <button
                            type="button"
                            onClick={handlePauseTimer}
                            disabled={!isRunning}
                            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all cursor-pointer touch-manipulation select-none active:scale-95 ${
                              isRunning
                                ? 'bg-amber-500/30 hover:bg-amber-500/40 active:bg-amber-500/50 text-amber-300 border border-amber-400/50 backdrop-blur-sm shadow-[0_0_14px_rgba(245,158,11,0.35)]'
                                : 'opacity-20 cursor-not-allowed bg-white/[0.02] text-slate-600 border border-white/5'
                            }`}
                            title={isRunning ? 'Pause focus timer' : 'Timer is not running'}
                            aria-label="Pause timer"
                          >
                            <Pause className="w-4.5 h-4.5 sm:w-5 sm:h-5 fill-current" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'chat' && (
                  <div className="w-full flex-1 min-h-0 flex flex-col h-full overflow-hidden">
            {/* Messages Scroll Area */}
            <div
              ref={messagesEndRef}
              onPointerDown={() => {
                if (document.activeElement === chatInputRef.current) {
                  chatInputRef.current?.blur();
                }
              }}
              className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-6 py-4 scrollbar-thin"
            >
              <div className="max-w-3xl w-full mx-auto space-y-4">
                {/* Load Previous Messages Pagination Button */}
                {hasMoreMessages && (
                  <div className="flex justify-center pb-2">
                    <button
                      type="button"
                      onClick={loadMoreMessages}
                      disabled={isLoadingMore}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono text-neutral-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm select-none"
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>Loading...</span>
                        </>
                      ) : (
                        <>
                          <ChevronUp className="w-3.5 h-3.5 text-neutral-400" />
                          <span>Load previous messages</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
                {(() => {
                  const chatMessages = messages.filter(
                    (msg) => !msg.content?.startsWith('[SYSTEM_')
                  );

                  if (chatMessages.length === 0) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 my-auto min-h-[220px]">
                        <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-amber-400 shadow-inner">
                          <MessageCircle className="w-6 h-6 opacity-80" />
                        </div>
                        <div className="text-sm font-hud font-bold text-white tracking-wide uppercase">
                          ROOM COMMS STANDBY
                        </div>
                        <p className="text-xs text-neutral-400 max-w-xs font-mono">
                          No transmissions logged yet. Connect with fellow scholars or broadcast your study target.
                        </p>
                      </div>
                    );
                  }

                  const groups: any[][] = [];
                  let currentGroup: any[] = [];

                  for (const msg of chatMessages) {
                    if (currentGroup.length > 0 && currentGroup[0].user_id === msg.user_id) {
                      currentGroup.push(msg);
                    } else {
                      if (currentGroup.length > 0) {
                        groups.push(currentGroup);
                      }
                      currentGroup = [msg];
                    }
                  }
                  if (currentGroup.length > 0) {
                    groups.push(currentGroup);
                  }

                  return groups.map((group) => {
                      const firstMsg = group[0];
                      const lastMsg = group[group.length - 1];
                      const isMe = firstMsg.user_id === user?.id;
                      const senderMember = displayUsers.find(u => u.user_id === firstMsg.user_id);
                      const cachedUser = getCachedMemberProfile(firstMsg.user_id);
                      const isStudying = senderMember?.is_studying;
                      const isHostUser = senderMember?.is_host;
                      const timeString = new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                      const rawProfile = Array.isArray(firstMsg.profiles) ? firstMsg.profiles[0] : firstMsg.profiles;
                      const rawUsername = rawProfile?.username || rawProfile?.name;
                      const rawAvatar = rawProfile?.avatar_url;

                      const username = isMe
                        ? (profile?.username || user?.displayName || user?.username || 'Scholar')
                        : (rawUsername || senderMember?.username || cachedUser?.username || 'Scholar');

                      const avatarUrl = isMe
                        ? (profile?.avatar_url || user?.avatarUrl || senderMember?.avatar_url || cachedUser?.avatar_url || null)
                        : (rawAvatar || senderMember?.avatar_url || cachedUser?.avatar_url || null);

                      return (
                        <div
                          key={`group-${firstMsg.id}`}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
                        >
                          {/* Meta header: name, host badge, focusing status, timestamp, ban action */}
                          <div className={`flex items-center gap-2 mb-1.5 ${isMe ? 'mr-1 flex-row-reverse' : 'ml-1'}`}>
                            <div className="inline-flex items-center gap-1 min-w-0">
                              <span
                                onClick={() => !isMe && handleMentionUser(username)}
                                className={`text-xs font-hud font-bold tracking-tight cursor-pointer transition-colors ${
                                  isMe ? 'text-amber-400' : 'text-slate-200 hover:text-amber-400 hover:underline'
                                }`}
                                title={!isMe ? `Click to mention @${username}` : undefined}
                              >
                                {isMe ? `${username} (YOU)` : username}
                              </span>
                              {(isMe ? isPremium : Boolean(flairMap[firstMsg.user_id])) && (
                                <FlairCrown frame={flairMap[firstMsg.user_id] || 'gold'} size={12} className="-ml-0.5" />
                              )}
                            </div>
                            {isHostUser && (
                              <span className="text-[9px] font-hud font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                                HOST
                              </span>
                            )}
                            {isStudying && (
                              <span className="text-[9px] font-hud px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 uppercase font-semibold">
                                <Flame className="w-3 h-3 fill-amber-400" /> FOCUSING
                              </span>
                            )}
                            <span className="text-[10px] font-hud-mono text-neutral-500">
                              {timeString}
                            </span>
                            {isHost && !isMe && !isHostUser && (
                              <button
                                type="button"
                                onClick={() => setMemberToBan({ userId: firstMsg.user_id, username })}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                                title={`Ban ${username} from room`}
                              >
                                <Ban className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Avatar and Bubble Row */}
                          <div className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''} items-end max-w-[88%] sm:max-w-[75%]`}>
                            {/* Avatar */}
                            <div className="relative shrink-0">
                              <UserAvatar
                                src={avatarUrl}
                                name={username}
                                size={36}
                                className={`rounded-full border transition-all ${
                                  isStudying
                                    ? 'border-amber-500 ring-2 ring-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                                    : 'border-white/10'
                                }`}
                              />
                            </div>

                            {/* Bubble Stack */}
                            <div className={`flex flex-col gap-1.5 ${isMe ? 'items-end' : 'items-start'}`}>
                              {group.map((msg: any, idx: number) => {
                                const isFirst = idx === 0;
                                const isLast = idx === group.length - 1;
                                const { replyTo, text } = parseMessageContent(msg.content);

                                return (
                                  <SwipeableChatMessage
                                    key={msg.id}
                                    id={`msg-${msg.id}`}
                                    isMe={isMe}
                                    onReply={() => handleStartReply(msg, username)}
                                    className={`group/msg flex items-center gap-1.5 transition-all duration-200 ${
                                      isMe ? 'flex-row-reverse' : 'flex-row'
                                    }`}
                                  >
                                    <div
                                      className={`px-4 py-2.5 text-sm leading-relaxed transition-all break-words chat-message chat-bubble selectable-text ${
                                        isMe
                                          ? 'bg-gradient-to-br from-amber-500/25 via-amber-500/15 to-amber-600/10 border border-amber-500/35 text-amber-50 shadow-[0_2px_12px_rgba(245,158,11,0.1)]'
                                          : 'bg-white/[0.05] border border-white/[0.1] text-slate-100 shadow-md hover:border-white/20'
                                      } ${
                                        isMe
                                          ? `rounded-2xl ${isFirst ? 'rounded-tr-md' : 'rounded-tr-md'} ${isLast ? 'rounded-br-2xl' : 'rounded-br-md'}`
                                          : `rounded-2xl ${isFirst ? 'rounded-tl-md' : 'rounded-tl-md'} ${isLast ? 'rounded-bl-2xl' : 'rounded-bl-md'}`
                                      }`}
                                    >
                                      {/* Quoted Reply Preview */}
                                      {replyTo && (
                                        <div
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            scrollToMessage(replyTo.id);
                                          }}
                                          role="button"
                                          tabIndex={0}
                                          className={`mb-2 px-2.5 py-1.5 rounded-xl text-xs border-l-2 flex flex-col gap-0.5 cursor-pointer transition-all select-none ${
                                            isMe
                                              ? 'bg-amber-500/15 border-amber-400 hover:bg-amber-500/25 text-amber-200'
                                              : 'bg-white/[0.06] border-emerald-400 hover:bg-white/[0.1] text-slate-300'
                                          }`}
                                          title="Click to jump to original message"
                                        >
                                          <div className="flex items-center gap-1 font-hud font-bold text-[10px] uppercase tracking-wider text-amber-400">
                                            <CornerUpLeft className="w-3 h-3 text-amber-400" />
                                            <span>@{replyTo.username}</span>
                                          </div>
                                          <p className="text-[11px] text-neutral-300/80 line-clamp-2 italic truncate">
                                            {replyTo.snippet}
                                          </p>
                                        </div>
                                      )}

                                      {/* Message Body with Mentions */}
                                      <div className="leading-relaxed">
                                        {renderFormattedMessage(
                                          text,
                                          profile?.username || user?.displayName || user?.username
                                        )}
                                      </div>
                                    </div>

                                    {/* Action Buttons: Desktop Hover Reply Button (Mobile uses Swipe to Reply like WhatsApp/Instagram) */}
                                    <div
                                      className={`hidden sm:flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity ${
                                        isMe ? 'flex-row-reverse' : ''
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => handleStartReply(msg, username)}
                                        className="p-1 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-white/[0.08] active:scale-90 transition-all cursor-pointer"
                                        title="Reply to message"
                                        aria-label="Reply to message"
                                      >
                                        <Reply className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </SwipeableChatMessage>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
              </div>
            </div>

            {/* Input Form Dock positioned neatly at bottom above safe area / keyboard */}
            <form onSubmit={handleSendMessage} className="px-3 pt-2 pb-[max(env(safe-area-inset-bottom,0px),12px)] md:pb-4 md:pt-4 md:px-4 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md shrink-0 z-20">
              <div className="max-w-3xl w-full mx-auto relative">
                {/* Replying Preview Bar */}
                {replyingTo && (
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-2 rounded-xl bg-white/[0.05] border border-amber-500/30 backdrop-blur-md shadow-md animate-in fade-in slide-in-from-bottom-1 duration-150">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                        <Reply className="w-3 h-3 text-amber-400" />
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[11px] font-hud font-bold text-amber-400 uppercase tracking-wider shrink-0">
                          Replying to @{replyingTo.username}:
                        </span>
                        <span className="text-xs text-neutral-300 truncate max-w-[200px] xs:max-w-[280px] sm:max-w-[400px]">
                          {replyingTo.snippet}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
                      title="Cancel reply"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Mention Suggestion Autocomplete Popup */}
                {mentionQuery !== null && filteredMentionUsers.length > 0 && (
                  <div className="absolute bottom-full mb-2 left-0 right-0 max-w-sm bg-[#0c1017]/95 backdrop-blur-xl border border-white/15 rounded-2xl p-1.5 shadow-2xl z-30 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="px-2 py-1 text-[10px] font-hud font-bold text-neutral-400 uppercase tracking-wider border-b border-white/5 mb-1 flex items-center justify-between">
                      <span>Mention Scholar</span>
                      <span className="text-[9px] font-mono text-neutral-500">@{mentionQuery}</span>
                    </div>
                    {filteredMentionUsers.map((u) => (
                      <button
                        key={u.user_id}
                        type="button"
                        onClick={() => handleSelectMention(u)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors text-left cursor-pointer"
                      >
                        <UserAvatar src={u.avatar_url} name={u.username} size={24} className="shrink-0" />
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-xs font-hud font-bold text-white truncate">
                            @{u.username}
                          </span>
                          {u.is_host && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 font-semibold uppercase">
                              Host
                            </span>
                          )}
                          {u.is_studying && (
                            <span className="text-[9px] text-amber-400 flex items-center gap-0.5">
                              <Flame className="w-2.5 h-2.5 fill-current" />
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="w-full bg-[var(--surface-2)] border border-[var(--border)] focus-within:border-[var(--accent)]/60 focus-within:ring-2 focus-within:ring-[var(--accent)]/20 rounded-2xl p-1.5 pl-4 flex items-center gap-2 transition-all shadow-inner">
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={newMessage}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Transmit message to room... (use @ to mention)"
                    className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none font-sans"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || isSending}
                    className="px-4 sm:px-5 py-2.5 rounded-xl font-hud font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-sm"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)', boxShadow: '0 0 15px var(--glow)' }}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">SEND</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}


        {tab === 'settings' && isHost && (
          <div className="w-full flex-1 min-h-0 overflow-y-auto p-4 scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="max-w-2xl mx-auto w-full py-4 sm:py-6 space-y-6 animate-in fade-in duration-200 pb-28 md:pb-24">
            {/* Host Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/10 via-white/[0.02] to-transparent border border-amber-500/20 p-5 sm:p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-inner">
                    <Crown className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white tracking-wide">Room Host Controls</h2>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Host Only
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Configure room password security, member capacity, and study hall details.
                    </p>
                  </div>
                </div>

                {roomInfo?.short_code && (
                  <button
                    type="button"
                    onClick={() => handleCopyCode(roomInfo.short_code!)}
                    className="inline-flex items-center gap-2 self-start sm:self-center px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm group"
                    title="Click to copy room code"
                  >
                    <Hash className="w-3.5 h-3.5 text-amber-400 opacity-80" />
                    <span className="font-bold tracking-wider">{roomInfo.short_code}</span>
                    {copiedCode ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 ml-1" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 ml-1" />
                    )}
                  </button>
                )}
              </div>
            </div>


            {settingsError && (
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-3 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{settingsError}</span>
              </div>
            )}

            {rlsBlocked && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-3 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-300 text-sm">Supabase Permission Setup Required</p>
                    <p className="text-slate-300 mt-1 leading-relaxed">
                      PostgreSQL Row-Level Security (RLS) is blocking saves because <code className="text-amber-300 bg-amber-500/20 px-1 py-0.5 rounded font-mono">public.study_rooms</code> has no <code className="text-amber-300 bg-amber-500/20 px-1 py-0.5 rounded font-mono">UPDATE</code> policy for room hosts.
                    </p>
                  </div>
                </div>
                <div className="bg-slate-950/80 p-3 rounded-xl border border-white/5 font-mono text-[11px] text-slate-300 overflow-x-auto select-all">
                  <pre>{ROOMS_RLS_SQL}</pre>
                </div>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={handleCopyRlsSql}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedRlsSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedRlsSql ? 'Copied to Clipboard!' : 'Copy SQL Fix'}
                  </button>
                  <span className="text-[11px] text-slate-400">
                    Paste into Supabase Dashboard &rarr; SQL Editor &rarr; Run, then click Save again.
                  </span>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* Room Name */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-3">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Room Name
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={editName}
                  onChange={(e) => {
                    isFormDirtyRef.current = true;
                    setEditName(e.target.value);
                  }}
                  placeholder="e.g., Deep Work Grind"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors text-sm font-medium"
                  required
                />
              </div>

              {/* Room Purpose / Description */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Room Purpose & Description
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {editDescription.length}/160
                  </span>
                </div>
                <textarea
                  rows={2}
                  maxLength={160}
                  value={editDescription}
                  onChange={(e) => {
                    isFormDirtyRef.current = true;
                    setEditDescription(e.target.value);
                  }}
                  placeholder="Describe your focus topic, rules, or room goals..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors text-sm font-medium resize-none"
                />
              </div>

              {/* Security & Password */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[var(--accent)]" />
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      Password & Room Privacy
                    </h3>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    isPrivate
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--border)]'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {isPrivate ? 'Protected' : 'Public Access'}
                  </span>
                </div>

                <p className="text-xs text-slate-400">
                  Control whether other scholars need a password to enter this room. As the host, you can view, change, or remove the password at any time.
                </p>

                {/* Privacy Mode Selector */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      isFormDirtyRef.current = true;
                      setIsPrivate(false);
                    }}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      !isPrivate
                        ? 'bg-white/10 border-[var(--border)] text-white shadow-md'
                        : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Public (No Password)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      isFormDirtyRef.current = true;
                      setIsPrivate(true);
                    }}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      isPrivate
                        ? 'bg-[var(--accent-soft)] border-[var(--border)] text-[var(--accent)] shadow-md'
                        : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Private (Password)</span>
                  </button>
                </div>

                {/* Password field */}
                {isPrivate ? (
                  <div className="space-y-2 pt-2 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Current Room Password
                      </label>
                      {editPassword && (
                        <span className="text-[11px] text-slate-400">
                          {showPassword ? 'Password Revealed' : 'Password Masked'}
                        </span>
                      )}
                    </div>

                    <div className="relative flex items-center">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        maxLength={30}
                        value={editPassword}
                        onChange={(e) => {
                          isFormDirtyRef.current = true;
                          setEditPassword(e.target.value);
                        }}
                        placeholder="Enter room password..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-24 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors text-sm font-mono tracking-wider"
                        required={isPrivate}
                      />

                      <div className="absolute right-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title={showPassword ? 'Hide password' : 'See password'}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4 text-[var(--accent)]" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={!editPassword.trim()}
                          onClick={handleCopyPassword}
                          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-30"
                          title="Copy password to clipboard"
                        >
                          {copiedPassword ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500">
                      Scholars who enter via the explorer or short code will be asked for this password. Use the eye icon to see it or the copy button to share it.
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-slate-400 text-xs flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      This room is currently open for any scholar to join without entering a password.
                    </span>
                  </div>
                )}
              </div>

              {/* Room Capacity */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[var(--accent)]" />
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      Room Member Capacity
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-0.5 rounded-full border border-[var(--border)]">
                    {dbMembers.length} / {editMaxCapacity} Members
                  </span>
                </div>

                <p className="text-xs text-slate-400">
                  Increase or adjust the maximum number of scholars who can be enrolled in this focus group at the same time.
                </p>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                    <div
                      className={`h-full transition-all duration-300 ${
                        dbMembers.length >= editMaxCapacity
                          ? 'bg-red-500'
                          : 'bg-gradient-to-r from-amber-500 to-orange-500'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.round((dbMembers.length / Math.max(1, editMaxCapacity)) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{dbMembers.length} currently enrolled</span>
                    <span>
                      {editMaxCapacity - dbMembers.length <= 0
                        ? 'Squad is at max capacity'
                        : `${editMaxCapacity - dbMembers.length} spots remaining`}
                    </span>
                  </div>
                </div>

                {/* Interactive Capacity Stepper */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200">Max Member Limit</span>
                    <span className="text-[11px] text-slate-500">Min {Math.max(2, dbMembers.length)} • Max 32</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={editMaxCapacity <= Math.max(2, dbMembers.length)}
                      onClick={() => {
                        isFormDirtyRef.current = true;
                        setEditMaxCapacity((prev) => Math.max(Math.max(2, dbMembers.length), prev - 1));
                      }}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 border border-white/10 text-white flex items-center justify-center transition-all cursor-pointer font-bold text-lg"
                      title="Decrease capacity"
                    >
                      <Minus className="w-4 h-4" />
                    </button>

                    <div className="min-w-[70px] text-center">
                      <span className="text-2xl font-mono font-bold text-white">
                        {editMaxCapacity}
                      </span>
                      <span className="block text-[10px] text-slate-400 uppercase font-semibold">
                        Members
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={editMaxCapacity >= 32}
                      onClick={() => {
                        isFormDirtyRef.current = true;
                        setEditMaxCapacity((prev) => Math.min(32, prev + 1));
                      }}
                      className="w-10 h-10 rounded-xl hover:brightness-110 disabled:opacity-30 border border-[var(--border)] flex items-center justify-center transition-all cursor-pointer font-bold text-lg shadow-md"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
                      title="Increase capacity"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Quick Capacity Presets
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { count: 4, label: '4 (Squad)' },
                      { count: 8, label: '8 (Group)' },
                      { count: 12, label: '12 (Circle)' },
                      { count: 20, label: '20 (Hall)' },
                      { count: 32, label: '32 (Max Chamber)' },
                    ].map((preset) => {
                      const isSelected = editMaxCapacity === preset.count;
                      const isDisabled = preset.count < dbMembers.length;

                      return (
                        <button
                          key={preset.count}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            isFormDirtyRef.current = true;
                            setEditMaxCapacity(preset.count);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                            isSelected
                              ? 'border-[var(--border)] shadow-md'
                              : isDisabled
                              ? 'opacity-30 bg-white/[0.02] border-white/5 text-slate-600 cursor-not-allowed'
                              : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border-white/10'
                          }`}
                          style={isSelected ? { backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' } : undefined}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Submit CTA */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-3.5 px-6 rounded-xl hover:brightness-110 font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)', boxShadow: '0 4px 20px var(--glow)' }}
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Saving Settings...</span>
                    </>
                  ) : saveSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-slate-950" />
                      <span>Settings Saved!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 text-slate-950" />
                      <span>Save Room Changes</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (roomInfo) {
                      isFormDirtyRef.current = false;
                      setEditName(roomInfo.name || '');
                      setEditDescription(roomInfo.description || '');
                      setIsPrivate(Boolean(roomInfo.is_private));
                      setEditPassword(roomInfo.password || '');
                      setEditMaxCapacity(roomInfo.max_capacity || 4);
                      toast('Changes reset to current settings', { icon: '🔄' });
                    }
                  }}
                  className="py-3.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 font-bold text-sm transition-all cursor-pointer"
                >
                  Reset
                </button>
              </div>

              {/* Scholar Management & Ban Section */}
              <div className="rounded-3xl bg-white/[0.02] border border-white/5 p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white tracking-wide">Scholar Management & Bans</h3>
                      <p className="text-xs text-slate-400">
                        Manage room scholars and enforce exclusions.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-hud-mono font-bold px-2 py-1 rounded-full bg-white/5 border border-white/10 text-neutral-400">
                    {displayUsers.filter(u => !u.is_host).length} MEMBERS
                  </span>
                </div>

                {/* Active Room Members */}
                <div className="space-y-2">
                  <label className="text-xs font-hud font-bold text-slate-300 uppercase tracking-wider block">
                    Active Room Scholars
                  </label>
                  <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                    {displayUsers.map((member) => (
                      <div
                        key={member.user_id}
                        onClick={() => handleOpenScholarModal(member)}
                        role="button"
                        tabIndex={0}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/5 hover:border-amber-400/40 hover:bg-black/70 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            src={member.avatar_url}
                            name={member.username}
                            size={32}
                            className="rounded-full border shrink-0 border-white/10"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <div className="inline-flex items-center gap-1 min-w-0">
                                <span className={`text-sm font-bold truncate max-w-[140px] ${
                                  member.is_current_user ? 'text-amber-400 font-extrabold' : 'text-white'
                                }`}>
                                  {member.username} {member.is_current_user ? '(You)' : ''}
                                </span>
                                {(member.is_current_user ? isPremium : Boolean(flairMap[member.user_id])) && (
                                  <FlairCrown frame={flairMap[member.user_id] || 'gold'} size={13} className="-ml-0.5" />
                                )}
                              </div>
                              {member.is_host && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold uppercase">
                                  HOST
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatSeconds(member.total_focus_seconds || 0)} studied
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {!member.is_current_user && (
                            <ClassicNudgeButton
                              targetUserId={member.user_id}
                              targetUsername={member.username}
                              onNudge={(e) => {
                                e.stopPropagation();
                                handleSendNudge(member.user_id, member.username);
                              }}
                              cooldownSeconds={nudgeCooldowns[member.user_id] || 0}
                              size="sm"
                            />
                          )}

                          {isHost && !member.is_host && !member.is_current_user && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setMemberToBan({ userId: member.user_id, username: member.username }); }}
                              className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 hover:border-rose-500/60 text-rose-400 text-xs font-hud font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>BAN</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Banned Scholars List */}
                <div className="pt-3 border-t border-white/[0.08] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-hud font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Ban className="w-3.5 h-3.5" />
                      <span>Banned Scholars ({bannedMembers.length})</span>
                    </label>
                  </div>

                  {bannedMembers.length === 0 ? (
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-center text-xs text-neutral-500 font-mono">
                      No scholars are currently banned from this room.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin pr-1">
                      {bannedMembers.map((banned) => (
                        <div
                          key={banned.userId}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-rose-500/5 border border-rose-500/20"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                              <UserX className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-sm font-bold text-slate-200 truncate">
                              {banned.username}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUnban(banned.userId, banned.username)}
                            disabled={isUnbanning === banned.userId}
                            className="px-3 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 text-xs font-hud font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95 disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{isUnbanning === banned.userId ? 'UNBANNING...' : 'UNBAN'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Touch Vibrations (Haptics) Preference */}
              <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-amber-400">
                    <Vibrate className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-wide uppercase font-hud">
                      Touch Vibrations (Haptics)
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tactile touch vibration on timer controls, focus actions, and tabs
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={hapticsActive}
                  onClick={handleToggleHaptics}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    hapticsActive ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                  title={hapticsActive ? 'Disable touch vibrations' : 'Enable touch vibrations'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      hapticsActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Danger Zone: Delete Room */}
              <div className="pt-6 border-t border-white/5">
                <div className="p-5 rounded-2xl bg-red-500/5 border border-red-500/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-red-400 flex items-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      Delete Study Room
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Permanently delete this focus group. All enrolled scholars will be disconnected immediately.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSaving || isDeletingRoom}
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-white border border-red-500/20 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Room</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
})}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {mounted && typeof document !== 'undefined' && showDeleteConfirm && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingRoom) {
              setShowDeleteConfirm(false);
            }
          }}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        >
          <div className="bg-[#0f111a] border border-white/10 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
              disabled={isDeletingRoom}
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-white mb-2">
              Delete Study Room?
            </h2>
            <p className="text-sm text-slate-400 mb-8 leading-relaxed">
              Are you sure you want to delete &ldquo;{roomName}&rdquo;? This action cannot be undone and all active members will be removed.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeletingRoom}
                className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRoom}
                disabled={isDeletingRoom}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20 transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeletingRoom ? 'Deleting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Ban Scholar Confirmation Modal */}
      {mounted && typeof document !== 'undefined' && memberToBan && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isBanning) {
              setMemberToBan(null);
            }
          }}
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        >
          <div className="bg-[#0f111a] border border-rose-500/30 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setMemberToBan(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
              disabled={isBanning}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-hud font-bold text-lg text-white">Ban Scholar</h3>
                <p className="text-xs text-rose-300/80">Permanent room exclusion</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Are you sure you want to ban <span className="font-bold text-white font-hud">{memberToBan.username}</span> from this room? They will be removed immediately and barred from rejoining.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMemberToBan(null)}
                disabled={isBanning}
                className="flex-1 py-2.5 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer text-xs uppercase font-hud"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBan}
                disabled={isBanning}
                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 text-xs uppercase font-hud shadow-lg shadow-rose-600/30"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{isBanning ? 'Banning...' : 'Confirm Ban'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Scholar Profile & Stats Inspection Modal */}
      <ScholarProfileModal
        scholar={selectedScholar}
        isOpen={Boolean(selectedScholar)}
        onClose={() => setSelectedScholar(null)}
        onNudge={(uid, name) => handleSendNudge(uid, name)}
        nudgeCooldown={selectedScholar ? (nudgeCooldowns[selectedScholar.userId] || 0) : 0}
        isSelf={selectedScholar?.userId === user?.id}
        isHost={isHost}
        onBan={(uid, name) => {
          setSelectedScholar(null);
          setMemberToBan({ userId: uid, username: name });
        }}
      />


    </div>
  );
}