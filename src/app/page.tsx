'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../context/AuthContext';
import { IntroductionAndLogin } from '../components/common/IntroductionAndLogin';
import { LandingPage } from '../components/landing/LandingPage';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { Logo } from '../components/Logo';
import { hasValidCachedSession } from '../lib/userCache';

// Lazy-load the heavy authenticated dashboard so logged-out landing visitors download minimal JS
const StudyDashboard = dynamic(
  () => import('../components/dashboard/StudyDashboard').then((mod) => mod.StudyDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050507]">
        <div className="flex flex-col items-center justify-center animate-pulse">
          <Logo className="w-20 h-20 drop-shadow-[0_0_28px_rgba(16,185,129,0.35)]" />
        </div>
      </div>
    ),
  }
);

const AuthModal = dynamic(
  () => import('../components/common/AuthModal').then((mod) => mod.AuthModal),
  { ssr: false }
);

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      (window as any).AndroidFullscreenBridge?.onPageLoaded?.();
    } catch {}
  }, []);

  const [isNativeApp, setIsNativeApp] = useState(() => {
    if (typeof window !== 'undefined') {
      return (
        Capacitor.isNativePlatform() ||
        Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
        Boolean(
          navigator?.userAgent &&
            (navigator.userAgent.includes('StudyIoNativeApp') ||
              /StudyIoNativeApp/i.test(navigator.userAgent))
        )
      );
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsNativeApp(
        Capacitor.isNativePlatform() ||
          Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
          Boolean(
            navigator?.userAgent &&
              (navigator.userAgent.includes('StudyIoNativeApp') ||
                /StudyIoNativeApp/i.test(navigator.userAgent))
          )
      );
    }
  }, []);

  // Seamlessly keep the URL aligned with /dashboard without triggering a router navigation delay on startup
  useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined' && window.location.pathname === '/') {
      try {
        window.history.replaceState({}, '', '/dashboard');
      } catch {}
    }
  }, [isAuthenticated]);

  const hasCachedUser = hasValidCachedSession();

  // During SSR or initial mount before hydration, display LandingPage for web visitors
  // to ensure instant server-rendered HTML for search engines and LCP performance.
  // In native app environment (or when cached user exists), display initial splash pulse.
  if (!isMounted) {
    if (isNativeApp || hasCachedUser) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050507]">
          <div className="flex flex-col items-center justify-center animate-pulse">
            <Logo className="w-20 h-20 drop-shadow-[0_0_28px_rgba(16,185,129,0.35)]" />
          </div>
        </div>
      );
    }
    return <LandingPage onOpenAuth={() => setIsAuthOpen(true)} />;
  }

  // Loading state while verifying stored session (skip when cached state exists)
  if (isLoading && !hasCachedUser) {
    if (isNativeApp) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050507]">
          <div className="flex flex-col items-center justify-center animate-pulse">
            <Logo className="w-20 h-20 drop-shadow-[0_0_28px_rgba(16,185,129,0.35)]" />
          </div>
        </div>
      );
    }
    return (
      <>
        <LandingPage onOpenAuth={() => setIsAuthOpen(true)} />
        <ErrorBoundary fallbackTitle="Authentication">
          <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
        </ErrorBoundary>
      </>
    );
  }

  // Not authenticated and no cached state:
  // Native Android app (Capacitor) displays direct sign in/up screen
  if (isNativeApp && !isAuthenticated && !hasCachedUser) {
    return <IntroductionAndLogin />;
  }

  // Web visitors (desktop & mobile browser) see the public marketing landing showcase
  if (!isAuthenticated && !hasCachedUser) {
    return (
      <>
        <LandingPage onOpenAuth={() => setIsAuthOpen(true)} />
        <ErrorBoundary fallbackTitle="Authentication">
          <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
        </ErrorBoundary>
      </>
    );
  }

  // Authenticated: Full StudyPulse focus dashboard
  return <StudyDashboard />;
}
