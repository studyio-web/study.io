'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useStudy } from '../../context/StudyContext';
import { Capacitor } from '@capacitor/core';
import { ShieldAlert, ArrowRightLeft, Layers, Laptop } from 'lucide-react';
import { soundFx } from '../../lib/audio';

interface TabLockData {
  tabId: string;
  userId: string;
  lastHeartbeat: number;
  createdAt: number;
}

export function SingleTabGuard() {
  const { user, isAuthenticated } = useAuth();
  const { isStudying } = useStudy();

  const [isBlocked, setIsBlocked] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const tabIdRef = useRef<string>('');
  const channelRef = useRef<BroadcastChannel | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const checkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isBlockedRef = useRef(false);

  // Keep isBlockedRef in sync
  useEffect(() => {
    isBlockedRef.current = isBlocked;
  }, [isBlocked]);

  // Generate a unique ID for this browser tab on mount
  useEffect(() => {
    setIsMounted(true);
    tabIdRef.current = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  const isNativeApp = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return (
      Capacitor.isNativePlatform() ||
      Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
      Boolean(
        navigator?.userAgent &&
          (navigator.userAgent.includes('StudyIoNativeApp') ||
            /StudyIoNativeApp/i.test(navigator.userAgent))
      )
    );
  }, []);

  // Claim leadership for this tab
  const claimActiveTab = useCallback(
    (channel: BroadcastChannel | null, userId: string) => {
      if (typeof window === 'undefined') return;
      const myTabId = tabIdRef.current;
      const storageKey = `studyio_active_tab_${userId}`;

      const lockData: TabLockData = {
        tabId: myTabId,
        userId,
        lastHeartbeat: Date.now(),
        createdAt: Date.now(),
      };

      try {
        localStorage.setItem(storageKey, JSON.stringify(lockData));
      } catch {}

      if (channel) {
        channel.postMessage({
          type: 'CLAIM_LEADERSHIP',
          tabId: myTabId,
          userId,
        });
      }

      setIsBlocked(false);
    },
    []
  );

  useEffect(() => {
    // Only run on web browsers, never on native Android app
    if (!isMounted || typeof window === 'undefined' || isNativeApp()) {
      return;
    }

    // Only enforce when logged into an account
    if (!isAuthenticated || !user?.id) {
      setIsBlocked(false);
      return;
    }

    const userId = user.id;
    const myTabId = tabIdRef.current;
    const storageKey = `studyio_active_tab_${userId}`;
    const channelName = `studyio_account_tabs_${userId}`;

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(channelName);
        channelRef.current = channel;
      } catch (err) {
        console.warn('[SingleTabGuard] BroadcastChannel not supported:', err);
      }
    }

    // 1. Check existing lock in localStorage
    const checkExistingLock = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const lock: TabLockData = JSON.parse(raw);
          const now = Date.now();
          const isFresh = now - (lock.lastHeartbeat || 0) < 5500;

          // If lock belongs to another tab and is still alive
          if (lock.tabId && lock.tabId !== myTabId && isFresh) {
            setIsBlocked(true);
            return true;
          }
        }
      } catch {}

      return false;
    };

    const hasOtherActiveTab = checkExistingLock();

    if (!hasOtherActiveTab) {
      // Claim leadership since no other active tab holds a fresh lock
      claimActiveTab(channel, userId);
    } else if (channel) {
      // Ping the active tab to confirm it's truly alive
      channel.postMessage({
        type: 'PING_LEADER',
        fromTabId: myTabId,
        userId,
      });
    }

    // 2. BroadcastChannel Message Listener
    const handleBroadcastMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.userId !== userId) return;

      switch (data.type) {
        case 'PING_LEADER':
          // If this tab is the active tab, acknowledge and re-assert leadership
          if (!isBlockedRef.current && tabIdRef.current !== data.fromTabId) {
            channel?.postMessage({
              type: 'PONG_LEADER',
              activeTabId: tabIdRef.current,
              userId,
            });
            // Update heartbeat in localStorage
            try {
              localStorage.setItem(
                storageKey,
                JSON.stringify({
                  tabId: tabIdRef.current,
                  userId,
                  lastHeartbeat: Date.now(),
                  createdAt: Date.now(),
                })
              );
            } catch {}
          }
          break;

        case 'PONG_LEADER':
          // Another tab responded saying it is active
          if (data.activeTabId && data.activeTabId !== myTabId) {
            setIsBlocked(true);
          }
          break;

        case 'CLAIM_LEADERSHIP':
          // Another tab forcibly claimed leadership (e.g. user clicked "Use This Tab Instead")
          if (data.tabId && data.tabId !== myTabId) {
            setIsBlocked(true);
          }
          break;

        case 'TAB_CLOSED':
          // The other tab was closed; automatically unblock this tab and claim leadership
          if (data.closedTabId && data.closedTabId !== myTabId) {
            claimActiveTab(channel, userId);
          }
          break;

        default:
          break;
      }
    };

    if (channel) {
      channel.addEventListener('message', handleBroadcastMessage);
    }

    // 3. Heartbeat loop (every 2.5s)
    heartbeatTimerRef.current = setInterval(() => {
      if (!isBlockedRef.current) {
        // Active tab writes fresh heartbeat
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({
              tabId: myTabId,
              userId,
              lastHeartbeat: Date.now(),
              createdAt: Date.now(),
            })
          );
        } catch {}
      } else {
        // Blocked tab checks if the active tab has gone stale/closed without sending TAB_CLOSED
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const lock: TabLockData = JSON.parse(raw);
            const now = Date.now();
            const isFresh = now - (lock.lastHeartbeat || 0) < 5500;
            if (!isFresh || lock.tabId === myTabId) {
              // Active tab died or closed; take over leadership
              claimActiveTab(channel, userId);
            }
          } else {
            claimActiveTab(channel, userId);
          }
        } catch {}
      }
    }, 2500);

    // 4. Release lock on tab close / navigation
    const handleUnload = () => {
      if (!isBlockedRef.current) {
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.tabId === myTabId) {
              localStorage.removeItem(storageKey);
            }
          }
        } catch {}

        if (channel) {
          channel.postMessage({
            type: 'TAB_CLOSED',
            closedTabId: myTabId,
            userId,
          });
        }
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (checkTimerRef.current) clearInterval(checkTimerRef.current);
      if (channel) {
        channel.removeEventListener('message', handleBroadcastMessage);
        channel.close();
      }
    };
  }, [isAuthenticated, user?.id, isMounted, isNativeApp, isStudying, claimActiveTab]);

  const handleTakeOver = () => {
    soundFx.resumeContext();
    if (!user?.id) return;
    claimActiveTab(channelRef.current, user.id);
  };

  // If tab is not blocked, render nothing (invisible guard)
  if (!isBlocked || !isAuthenticated) {
    return null;
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Active in another tab"
      className="fixed inset-0 z-[99999] bg-[#050507]/98 backdrop-blur-2xl flex flex-col items-center justify-center p-5 sm:p-8 text-center select-none animate-in fade-in duration-300"
    >
      {/* Ambient background glow */}
      <div
        className="absolute w-96 h-96 rounded-full blur-[120px] opacity-25 pointer-events-none"
        style={{ backgroundColor: 'var(--accent, #f59e0b)' }}
      />

      <div className="relative z-10 max-w-md w-full flex flex-col items-center space-y-5">
        {/* Glowing Shield Icon */}
        <div className="relative flex items-center justify-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center border shadow-2xl relative z-10"
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderColor: 'rgba(245, 158, 11, 0.3)',
              color: 'var(--accent, #f59e0b)',
              boxShadow: '0 0 35px rgba(245, 158, 11, 0.25)',
            }}
          >
            <Layers className="w-10 h-10" />
          </div>
          <div
            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-md z-20"
            title="Multi-tab protection"
          >
            <ShieldAlert className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
        </div>

        {/* Header Badges & Title */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-hud-mono font-bold tracking-widest uppercase text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>SESSION PROTECTION ACTIVE</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-hud font-black uppercase tracking-wider text-white">
            OPEN IN ANOTHER TAB
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm">
            Study.io is already open in another browser tab for account{' '}
            <span className="font-semibold text-white">
              {user?.email || user?.displayName || 'User'}
            </span>
            . To maintain precise timer tracking and data integrity, only one tab may be active at
            a time.
          </p>
        </div>

        {/* Action Button: Use This Tab Instead */}
        <div className="w-full pt-2 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleTakeOver}
            className="w-full sm:w-auto min-w-[240px] px-6 py-3.5 rounded-xl font-hud font-bold text-xs tracking-widest uppercase text-slate-950 transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:shadow-xl hover:brightness-110"
            style={{
              backgroundColor: 'var(--accent, #f59e0b)',
              boxShadow: '0 0 24px rgba(245, 158, 11, 0.4)',
            }}
          >
            <ArrowRightLeft className="w-4 h-4 stroke-[2.5]" />
            <span>USE THIS TAB INSTEAD</span>
          </button>

          <p className="text-[11px] text-slate-500 font-mono tracking-tight">
            Switching tabs pauses the other tab safely.
          </p>
        </div>
      </div>
    </div>
  );
}
