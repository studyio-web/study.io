'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '../../context/AuthContext';
import { useStudy } from '../../context/StudyContext';
import { Navbar, NavTabType } from '../common/Navbar';
import { StudyTimer } from '../timer/StudyTimer';
import { IdleCheckModal } from '../timer/IdleCheckModal';
import { XpFloatingNotification } from '../gamification/XpFloatingNotification';
import { SeasonRecapBanner } from '../gamification/SeasonRecapBanner';
import { SeasonResetAlertModal } from '../gamification/SeasonResetAlertModal';
import { DailyBoostModal } from '../common/DailyBoostModal';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { SwipeTabContainer } from '../common/SwipeTabContainer';
import { useRankTheme } from '../../hooks/useRankTheme';
import { DevRankSwitcher } from '../common/DevRankSwitcher';
import { useStudyMode } from '../../context/StudyModeContext';
import { setupNotificationListeners } from '../../lib/notifications';
import { initPushNotifications } from '../../lib/pushNotifications';
import { registerBackButtonHandler } from '../../lib/native-feel';

// Lazy-load inactive tabs so chart, tasks, leaderboard, and WebRTC room libraries are deferred
const TasksOverview = dynamic(
  () => import('../todo/TasksOverview').then((mod) => mod.TasksOverview),
  { ssr: false }
);

const AnalyticsDashboard = dynamic(
  () => import('../analytics/AnalyticsDashboard').then((mod) => mod.AnalyticsDashboard),
  { ssr: false }
);

const MonthlyLeaderboard = dynamic(
  () => import('../leaderboard/MonthlyLeaderboard').then((mod) => mod.MonthlyLeaderboard),
  { ssr: false }
);

const StudyRoomsTab = dynamic(
  () => import('../rooms/StudyRoomsTab'),
  { ssr: false }
);

const SettingsTabContent = dynamic(
  () => import('../common/SettingsTabContent').then((mod) => mod.SettingsTabContent),
  { ssr: false }
);

// Lazy-load non-critical modals
const AuthModal = dynamic(
  () => import('../common/AuthModal').then((mod) => mod.AuthModal),
  { ssr: false }
);

const ProfileModal = dynamic(
  () => import('../common/ProfileModal').then((mod) => mod.ProfileModal),
  { ssr: false }
);

const SettingsModal = dynamic(
  () => import('../common/SettingsModal').then((mod) => mod.SettingsModal),
  { ssr: false }
);

const FocusModeModal = dynamic(
  () => import('../timer/FocusModeModal').then((mod) => mod.FocusModeModal),
  { ssr: false }
);

const LevelUpModal = dynamic(
  () => import('../gamification/LevelUpModal').then((mod) => mod.LevelUpModal),
  { ssr: false }
);

const RankSettlementModal = dynamic(
  () => import('../RankSettlementModal').then((mod) => mod.RankSettlementModal),
  { ssr: false }
);

const OnboardingFlow = dynamic(
  () => import('../onboarding/OnboardingFlow').then((mod) => mod.OnboardingFlow),
  { ssr: false }
);

export function StudyDashboard() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { needsOnboarding } = useStudyMode();
  useRankTheme(); // Hydrate CSS custom properties globally for current session

  // Seamlessly keep the URL aligned with /dashboard without triggering a router navigation delay on startup
  useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined' && window.location.pathname === '/') {
      try {
        window.history.replaceState({}, '', '/dashboard');
      } catch {}
    }
  }, [isAuthenticated]);

  const {
    refetchSessions,
    levelUpData,
    dismissLevelUpModal,
    lastXpEarned,
    dismissXpNotification,
    settlementData,
    dismissRankSettlement,
    seasonRecap,
    dismissSeasonRecap,
    seasonResetAlert,
    dismissSeasonResetAlert,
    isFocusModeOpen,
    setIsFocusModeOpen,
  } = useStudy();

  // Navigation tabs: Timer, Tasks, Analytics, Leaderboard, Rooms, Settings
  const [activeTab, setActiveTab] = useState<NavTabType>(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const t = params.get('tab');
        if (t && ['timer', 'tasks', 'analytics', 'leaderboard', 'settings', 'rooms'].includes(t)) {
          return t as NavTabType;
        }
      } catch {}
    }
    return 'timer';
  });

  const handleTabChange = useCallback((newTab: NavTabType) => {
    setActiveTab(newTab);
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (newTab === 'timer') {
          url.searchParams.delete('tab');
        } else {
          url.searchParams.set('tab', newTab);
        }
        window.history.replaceState({ tab: newTab }, '', url.toString());
      } catch {}
    }
  }, []);

  // Listen for notification deep link / tab navigation events and initialize native push
  useEffect(() => {
    initPushNotifications().catch(() => {});

    const handleNavEvent = (e: any) => {
      const targetTab = e?.detail?.tab;
      if (targetTab && ['timer', 'tasks', 'analytics', 'leaderboard', 'settings', 'rooms', 'timetable'].includes(targetTab)) {
        handleTabChange(targetTab as NavTabType);
      }
    };
    window.addEventListener('studyio:navigate-tab', handleNavEvent);
    const cleanupNative = setupNotificationListeners((tab) => {
      if (['timer', 'tasks', 'analytics', 'leaderboard', 'settings', 'rooms', 'timetable'].includes(tab)) {
        handleTabChange(tab as NavTabType);
      }
    });

    return () => {
      window.removeEventListener('studyio:navigate-tab', handleNavEvent);
      cleanupNative();
    };
  }, [handleTabChange]);

  const lastTabRefetchRef = useRef<number>(Date.now());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkTab = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const t = params.get('tab') || 'timer';
        if (['timer', 'tasks', 'analytics', 'leaderboard', 'settings', 'rooms'].includes(t)) {
          setActiveTab(t as NavTabType);
        }
      } catch {}
    };
    checkTab();
    window.addEventListener('popstate', checkTab);
    return () => window.removeEventListener('popstate', checkTab);
  }, []);

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showDailyBoost, setShowDailyBoost] = useState(false);
  const [isInsideRoom, setIsInsideRoom] = useState(false);
  const hasTriggeredBoostRef = useRef(false);

  // Hardware Android Back Button management via Native Feel Bridge:
  // - Close any open modal / banner first
  // - If in any secondary tab (tasks, analytics, rooms, leaderboard, settings), come back to 'timer' tab!
  // - Only exit the app if already on 'timer' tab with no open modals
  useEffect(() => {
    return registerBackButtonHandler(() => {
      if (settlementData) {
        dismissRankSettlement();
        return true;
      }
      if (isSettingsOpen) {
        setIsSettingsOpen(false);
        return true;
      }
      if (isProfileOpen) {
        setIsProfileOpen(false);
        return true;
      }
      if (isAuthOpen) {
        setIsAuthOpen(false);
        return true;
      }
      if (showDailyBoost) {
        setShowDailyBoost(false);
        return true;
      }
      if (seasonRecap) {
        dismissSeasonRecap();
        return true;
      }
      if (seasonResetAlert) {
        dismissSeasonResetAlert();
        return true;
      }
      if (levelUpData) {
        dismissLevelUpModal();
        return true;
      }
      if (isFocusModeOpen) {
        setIsFocusModeOpen(false);
        return true;
      }

      if (activeTab !== 'timer') {
        handleTabChange('timer');
        return true;
      }

      return false; // Exit app at root timer tab
    });
  }, [
    settlementData,
    isSettingsOpen,
    isProfileOpen,
    isAuthOpen,
    showDailyBoost,
    seasonRecap,
    seasonResetAlert,
    levelUpData,
    isFocusModeOpen,
    activeTab,
    dismissRankSettlement,
    dismissSeasonRecap,
    dismissSeasonResetAlert,
    dismissLevelUpModal,
    setIsFocusModeOpen,
    handleTabChange,
  ]);

  // Today's Boost Welcome Modal (Trigger on every session / sign-in)
  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      hasTriggeredBoostRef.current = false;
      return;
    }

    if (isAuthenticated && !hasTriggeredBoostRef.current) {
      hasTriggeredBoostRef.current = true;
      if (user && user.is_onboarded !== true) {
        setIsProfileOpen(true);
      } else {
        setShowDailyBoost(true);
      }
      try {
        localStorage.removeItem('last_daily_boost_date');
      } catch {}
    }
  }, [isLoading, isAuthenticated, user]);

  const handleDismissDailyBoost = useCallback(() => {
    setShowDailyBoost(false);
    setActiveTab('timer');
  }, []);

  // Re-fetch sessions automatically whenever the user navigates back to Dashboard or switches tabs (throttled)
  useEffect(() => {
    if (isAuthenticated) {
      const now = Date.now();
      if (now - lastTabRefetchRef.current > 30000) {
        lastTabRefetchRef.current = now;
        refetchSessions();
      }
    }
  }, [activeTab, isAuthenticated, refetchSessions]);

  // Re-fetch sessions when window or tab gains focus
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleFocus = () => {
      refetchSessions();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetchSessions();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleSwitchTab = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setActiveTab(customEvent.detail as NavTabType);
      }
    };
    window.addEventListener('switch_tab', handleSwitchTab);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('switch_tab', handleSwitchTab);
    };
  }, [isAuthenticated, refetchSessions]);

  return (
    <div className="w-full h-[100dvh] bg-[var(--bg)] bg-dot-grid text-[var(--text)] flex flex-col relative selection:bg-[var(--accent)]/30 selection:text-[var(--accent)] overflow-hidden">
      {/* Infinite Edge-to-Edge Canvas Mesh Background */}
      <div className="fixed inset-0 w-screen h-screen overflow-x-hidden pointer-events-none bg-[#050507] -z-20" />
      {/* Subtle Background Dot Grid Texture */}
      <div className="fixed inset-0 w-screen h-screen overflow-x-hidden pointer-events-none bg-dot-grid -z-10" />
      {/* Drifting Ambient HUD Grid Overlay */}
      <div className="fixed inset-0 w-screen h-screen overflow-x-hidden pointer-events-none bg-hud-grid opacity-[0.03] -z-10" />

      {/* 4-Hour Idle Alarm Check */}
      <IdleCheckModal />

      {/* Floating XP Celebrations Toast */}
      <XpFloatingNotification
        notification={lastXpEarned}
        onDismiss={dismissXpNotification}
      />

      {/* Full Dashboard Content (hidden during Focus Mode for zero background jank) */}
      <div
        className="w-full flex flex-col items-center flex-1 min-h-0 overflow-hidden"
        style={{ display: isFocusModeOpen ? 'none' : undefined }}
      >
        {/* Top Navigation Bar (Hidden when inside an active study room) */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenSettings={() => handleTabChange('settings')}
          hideTopBar={activeTab === 'rooms' && isInsideRoom}
          hideBottomBar={activeTab === 'rooms' && isInsideRoom}
        />

        {/* Monthly Season Settlement Recap Banner */}
        {seasonRecap && (
          <SeasonRecapBanner
            recap={seasonRecap}
            onDismiss={dismissSeasonRecap}
          />
        )}

        {/* Main Content Area with Mobile Swipe Navigation */}
        <main className="w-full flex flex-col items-center relative z-10 px-0 md:px-8 flex-1 min-h-0 overflow-hidden pt-0 pb-0">
          <SwipeTabContainer
            activeTab={activeTab}
            onChangeTab={handleTabChange}
            disabled={activeTab === 'rooms' && isInsideRoom}
          >
            {{
              timer: (
                <ErrorBoundary fallbackTitle="Focus Timer">
                  <StudyTimer />
                </ErrorBoundary>
              ),
              tasks: (
                <ErrorBoundary fallbackTitle="Tasks Overview">
                  <TasksOverview />
                </ErrorBoundary>
              ),
              analytics: (
                <ErrorBoundary fallbackTitle="Analytics Dashboard">
                  <AnalyticsDashboard
                    onStartSession={() => handleTabChange('timer')}
                    onOpenSettings={() => handleTabChange('settings')}
                  />
                </ErrorBoundary>
              ),
              leaderboard: (
                <ErrorBoundary fallbackTitle="Monthly Leaderboard">
                  <MonthlyLeaderboard isEmbedded isActiveTab={activeTab === 'leaderboard'} />
                </ErrorBoundary>
              ),
              rooms: (
                <ErrorBoundary fallbackTitle="Study Rooms">
                  <StudyRoomsTab
                    onBackToDashboard={() => handleTabChange('timer')}
                    isActiveTab={activeTab === 'rooms'}
                    onActiveRoomChange={setIsInsideRoom}
                  />
                </ErrorBoundary>
              ),
              settings: (
                <ErrorBoundary fallbackTitle="Settings & Preferences">
                  <SettingsTabContent />
                </ErrorBoundary>
              ),
            }}
          </SwipeTabContainer>
        </main>
      </div>

      {/* Modals & Celebrations */}
      <ErrorBoundary fallbackTitle="Authentication">
        <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      </ErrorBoundary>
      <ErrorBoundary fallbackTitle="Profile">
        <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} user={user} />
      </ErrorBoundary>
      <ErrorBoundary fallbackTitle="Settings">
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </ErrorBoundary>
      <ErrorBoundary fallbackTitle="Focus Mode">
        <FocusModeModal />
      </ErrorBoundary>

      {/* Onboarding Flow (Study Mode Selection -> Welcome Intro Walkthrough) */}
      {!isProfileOpen && (
        <OnboardingFlow />
      )}

      {/* Free Fire Post-Match Rank Settlement Fullscreen Screen */}
      <RankSettlementModal
        isOpen={Boolean(settlementData)}
        data={settlementData}
        onContinue={dismissRankSettlement}
      />

      {/* Level Up Celebratory Modal */}
      {levelUpData && !settlementData && (
        <LevelUpModal
          isOpen={Boolean(levelUpData)}
          oldLevel={levelUpData.oldLevel}
          newLevel={levelUpData.newLevel}
          title={levelUpData.title}
          onClose={dismissLevelUpModal}
        />
      )}

      {/* Daily Boost Welcome Modal (Once per day) */}
      <DailyBoostModal
        isOpen={showDailyBoost}
        onClose={handleDismissDailyBoost}
        onStartFocusing={handleDismissDailyBoost}
        streakDays={user?.streakDays ?? 0}
        dailyGoalHours={user?.dailyGoalHours ?? 3}
      />

      {/* Monthly Season Soft-Reset Alert Card Modal */}
      <SeasonResetAlertModal
        isOpen={Boolean(seasonResetAlert)}
        data={seasonResetAlert}
        onDismiss={dismissSeasonResetAlert}
      />

      {/* Development Rank Preview Floating HUD */}
      {process.env.NODE_ENV !== 'production' && <DevRankSwitcher />}
    </div>
  );
}
