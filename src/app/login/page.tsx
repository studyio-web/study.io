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
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050507]">
        <div className="flex flex-col items-center justify-center animate-pulse">
          <Logo className="w-16 h-16 drop-shadow-[0_0_24px_rgba(16,185,129,0.35)]" />
        </div>
      </div>
    );
  }

  return <IntroductionAndLogin />;
}
