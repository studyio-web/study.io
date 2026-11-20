'use client';

import React from 'react';
import { AndroidPremiumView } from '../../components/premium/AndroidPremiumView';
import { usePremium } from '../../context/PremiumContext';
import { useRazorpayCheckout } from '../../hooks/useRazorpayCheckout';
import { useRankTheme } from '../../hooks/useRankTheme';

export default function PremiumNativePreviewPage() {
  const { isPremium, premiumUntil, loading } = usePremium();
  const { plans, isProcessing, startCheckout } = useRazorpayCheckout();
  const { userRank } = useRankTheme();

  return (
    <AndroidPremiumView
      isPremium={isPremium}
      premiumUntil={premiumUntil}
      loading={loading}
      plans={plans}
      isProcessing={isProcessing}
      startCheckout={startCheckout}
      userRank={userRank}
    />
  );
}
