'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';
import { IntroductionAndLogin } from '../../components/common/IntroductionAndLogin';
import { Logo } from '../../components/Logo';
import { getCachedUserState } from '../../lib/userCache';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const hasCachedUser = typeof window !== 'undefined' && Boolean(
    getCachedUserState()?.profile?.id ||
    localStorage.getItem('studypulse_is_authenticated') === 'true'
  );

  useEffect(() => {
    if (isAuthenticated || hasCachedUser) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, hasCachedUser, router]);

  if (!isMounted || isLoading || hasCachedUser) {
    return (
      <div className="min-h-screen bg-[#050507] flex flex-col items-center justify-center text-slate-100">
        <div className="mb-4 animate-pulse">
          <Logo className="w-14 h-14" />
        </div>
        <div className="text-sm font-hud font-bold text-slate-400 tracking-widest uppercase">Loading study.io...</div>
      </div>
    );
  }

  return <IntroductionAndLogin />;
}
