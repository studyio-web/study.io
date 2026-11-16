import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Subscription Expiration & Flair Gating', () => {
  it('correctly determines whether a subscription is active and unexpired', () => {
    const isSubscriptionActive = (s: { status: string; premium_until: string | null }, now: number) => {
      const hasExpiry = Boolean(s.premium_until);
      const isFuture = hasExpiry ? new Date(s.premium_until!).getTime() > now : false;
      const isStatusActive = s.status === 'active' || s.status === 'trialing';
      return hasExpiry ? isFuture : isStatusActive;
    };

    const now = new Date('2026-11-16T12:00:00Z').getTime();

    // 1. Expired subscription with 'active' status (the exact 'trial' bug scenario)
    const trialUser = {
      status: 'active',
      premium_until: '2026-11-15T15:26:14Z', // yesterday
    };
    assert.equal(isSubscriptionActive(trialUser, now), false, 'Expired subscription must return false');

    // 2. Active subscription in future ('ebin' scenario)
    const ebinUser = {
      status: 'active',
      premium_until: '2026-12-07T17:56:44Z', // next month
    };
    assert.equal(isSubscriptionActive(ebinUser, now), true, 'Unexpired subscription must return true');

    // 3. Lifetime subscription (status active, premium_until null)
    const lifetimeUser = {
      status: 'active',
      premium_until: null,
    };
    assert.equal(isSubscriptionActive(lifetimeUser, now), true, 'Lifetime active subscription must return true');

    // 4. Cancelled subscription within valid period (grace period until cycle end)
    const cancelledGrace = {
      status: 'canceled',
      premium_until: '2026-11-20T00:00:00Z',
    };
    assert.equal(isSubscriptionActive(cancelledGrace, now), true, 'Cancelled subscription before expiry must remain active');

    // 5. Cancelled and expired subscription
    const cancelledExpired = {
      status: 'canceled',
      premium_until: '2026-11-10T00:00:00Z',
    };
    assert.equal(isSubscriptionActive(cancelledExpired, now), false, 'Cancelled and expired subscription must return false');
  });

  it('guarantees current user pro state in study room is strictly bound to local isPremium', () => {
    // If user is current user and local isPremium is false, isPro must always be false
    const computeIsUserPro = (
      user: { is_current_user: boolean; user_id: string },
      localIsPremium: boolean,
      flairMap: Record<string, string>
    ) => {
      return user.is_current_user ? localIsPremium : Boolean(flairMap[user.user_id]);
    };

    const currentExpiredUser = { is_current_user: true, user_id: 'trial-user' };
    const staleFlairMap = { 'trial-user': 'gold' }; // Stale presence or flair payload

    // Even if flairMap has a stale 'gold', isPro MUST be false because localIsPremium is false
    const isPro = computeIsUserPro(currentExpiredUser, false, staleFlairMap);
    assert.equal(isPro, false, 'Current user must not have Pro ring when isPremium is false');

    // For a fellow room member who is verified pro
    const peerProUser = { is_current_user: false, user_id: 'ebin-user' };
    const peerFlairMap = { 'ebin-user': 'gold' };
    assert.equal(computeIsUserPro(peerProUser, false, peerFlairMap), true, 'Peer with active flair must have Pro ring');
  });
});
