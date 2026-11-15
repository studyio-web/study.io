'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, CheckCheck, Trash2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabase';
import { UserAvatar } from './UserAvatar';

export interface AppNotification {
  id: string;
  type: 'nudge' | 'general';
  title: string;
  message: string;
  senderName: string;
  senderAvatar?: string;
  roomId?: string;
  roomName?: string;
  timestamp: number;
  isRead: boolean;
}

interface NotificationBellProps {
  onNavigateToRooms?: () => void;
  className?: string;
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function NotificationBell({ onNavigateToRooms, className = '' }: NotificationBellProps) {
  const { user, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch offline nudges from room_messages where the target is the current user
  const fetchOfflineNudges = useCallback(async () => {
    if (!user?.id) return;
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from('room_messages')
        .select(`
          id,
          content,
          created_at,
          room_id,
          study_rooms ( name )
        `)
        .ilike('content', `%[SYSTEM_NUDGE]%${user.id}%`)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) {
        console.warn('Error fetching offline notifications:', error);
        return;
      }

      if (data && Array.isArray(data)) {
        const readIds: string[] = JSON.parse(
          localStorage.getItem(`studyio_read_notifs_${user.id}`) || '[]'
        );

        const loaded: AppNotification[] = [];
        for (const item of data) {
          try {
            if (!item.content?.startsWith('[SYSTEM_NUDGE]:')) continue;
            const parsed = JSON.parse(item.content.replace('[SYSTEM_NUDGE]:', ''));
            if (parsed.targetUserId === user.id) {
              const roomName = (item.study_rooms as any)?.name || 'Study Room';
              const ts = parsed.timestamp || new Date(item.created_at).getTime();
              loaded.push({
                id: item.id,
                type: 'nudge',
                title: 'Focus Nudge',
                message: `${parsed.fromUsername || 'A scholar'} nudged you to focus in ${roomName}`,
                senderName: parsed.fromUsername || 'A scholar',
                senderAvatar: parsed.fromAvatarUrl,
                roomId: item.room_id,
                roomName,
                timestamp: ts,
                isRead: readIds.includes(item.id),
              });
            }
          } catch {}
        }

        setNotifications(loaded);
      }
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    }
  }, [user?.id]);

  // Initial fetch on mount & auth change
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      fetchOfflineNudges();
    } else {
      setNotifications([]);
    }
  }, [isAuthenticated, user?.id, fetchOfflineNudges]);

  // Listen to live Realtime user-specific channel for real-time nudge arrivals
  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase.channel(`user_notifications_${user.id}`);
    channel
      .on('broadcast', { event: 'nudge_received' }, (payload: any) => {
        if (!payload || !payload.payload) return;
        const p = payload.payload;
        if (p.targetUserId === user.id) {
          const newNotif: AppNotification = {
            id: p.id || `nudge-${Date.now()}`,
            type: 'nudge',
            title: 'Focus Nudge',
            message: `${p.fromUsername || 'A scholar'} nudged you to focus in ${p.roomName || 'study room'}`,
            senderName: p.fromUsername || 'A scholar',
            senderAvatar: p.fromAvatarUrl,
            roomId: p.roomId,
            roomName: p.roomName,
            timestamp: p.timestamp || Date.now(),
            isRead: false,
          };

          setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Click outside listener to dismiss popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = () => {
    if (!user?.id) return;
    const allIds = notifications.map((n) => n.id);
    localStorage.setItem(`studyio_read_notifs_${user.id}`, JSON.stringify(allIds));
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleItemClick = (notif: AppNotification) => {
    if (!user?.id) return;
    if (!notif.isRead) {
      const readIds: string[] = JSON.parse(
        localStorage.getItem(`studyio_read_notifs_${user.id}`) || '[]'
      );
      if (!readIds.includes(notif.id)) {
        readIds.push(notif.id);
        localStorage.setItem(`studyio_read_notifs_${user.id}`, JSON.stringify(readIds));
      }
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
    }

    if (onNavigateToRooms) {
      setIsOpen(false);
      onNavigateToRooms();
    }
  };

  const handleClearAll = () => {
    if (!user?.id) return;
    const allIds = notifications.map((n) => n.id);
    localStorage.setItem(`studyio_read_notifs_${user.id}`, JSON.stringify(allIds));
    setNotifications([]);
  };

  return (
    <div className={`relative ${className}`} ref={popoverRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] shadow-card transition-all flex items-center justify-center cursor-pointer relative select-none ${
          isOpen ? 'ring-2 ring-amber-500/50 text-white bg-[var(--surface-2)]' : ''
        }`}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'Notifications'}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />

        {/* Unread Counter Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-amber-500 text-black font-mono font-black text-[10px] rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.7)] border border-amber-300 pointer-events-none animate-in zoom-in-75 duration-200">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-[#0c1017]/95 backdrop-blur-2xl border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.06)] z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-hud font-bold uppercase tracking-wider text-white">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-semibold text-slate-400 hover:text-amber-300 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark read</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors p-1 cursor-pointer"
                  title="Clear all notifications"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto scrollbar-thin divide-y divide-white/[0.05]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center space-y-2.5">
                <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-slate-500">
                  <Bell className="w-5 h-5 opacity-40" />
                </div>
                <div className="text-xs font-bold text-slate-300">All caught up!</div>
                <p className="text-[11px] text-slate-500 max-w-[200px] leading-relaxed">
                  When scholars in study rooms nudge you, your focus alerts will appear here.
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  role="button"
                  tabIndex={0}
                  className={`flex items-start gap-3 p-3.5 transition-colors cursor-pointer select-none ${
                    notif.isRead
                      ? 'bg-transparent hover:bg-white/[0.03] opacity-75'
                      : 'bg-amber-500/[0.06] hover:bg-amber-500/[0.1] border-l-2 border-l-amber-400'
                  }`}
                >
                  {/* Sender Avatar */}
                  <div className="shrink-0 mt-0.5 relative">
                    <UserAvatar
                      src={notif.senderAvatar}
                      name={notif.senderName}
                      size={34}
                      className="rounded-full border border-white/15"
                    />
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-[11px] font-hud font-bold uppercase tracking-wider text-amber-400">
                        {notif.title}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {formatRelativeTime(notif.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 leading-snug line-clamp-2">
                      <span className="font-bold text-white">{notif.senderName}</span> nudged you to focus in{' '}
                      <span className="font-semibold text-amber-300">{notif.roomName}</span>.
                    </p>

                    <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors uppercase tracking-wider">
                      <span>Enter Room</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>

                  {/* Unread Indicator Dot */}
                  {!notif.isRead && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] shrink-0 mt-2" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
