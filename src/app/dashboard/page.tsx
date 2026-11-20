'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { Logo } from '../../components/Logo';
import Home from '../page';
import { hasValidCachedSession } from '../../lib/userCache';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const hasCachedUser = hasValidCachedSession();

  useEffect(() => {
    // Only redirect once auth loading has settled and confirmed unauthenticated
    if (!isLoading && !isAuthenticated && !hasCachedUser) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, hasCachedUser, router]);

  // Prevent premature bounce: show centered app logo while session is being verified/restored ONLY IF NO CACHE
  if (isLoading && !hasCachedUser) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050507]">
        <div className="flex flex-col items-center justify-center animate-pulse">
          <Logo className="w-20 h-20 drop-shadow-[0_0_28px_rgba(16,185,129,0.35)]" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !hasCachedUser) {
    return null;
  }

  return <Home />;
}
