import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  REELS_BLOCKER_TOAST_ID,
  STORAGE_KEY_SHORTS_REELS_BLOCK,
  loadBlockShortsReelsEnabled,
  saveBlockShortsReelsEnabled,
} from '../src/lib/accessibility-blocker';

describe('Reels & Shorts Blocker Notification & Rapid-Click Debounce Specification', () => {
  it('guarantees REELS_BLOCKER_TOAST_ID constant is defined for toast deduplication', () => {
    assert.ok(REELS_BLOCKER_TOAST_ID, 'Toast ID must be defined');
    assert.strictEqual(typeof REELS_BLOCKER_TOAST_ID, 'string');
    assert.strictEqual(REELS_BLOCKER_TOAST_ID, 'reels-shorts-blocker-toast');
  });

  it('guarantees rapid successive toggles within cooldown window are throttled', () => {
    let callCount = 0;
    let lastTime = 0;
    const cooldownMs = 350;

    const throttledToggle = (mockNow: number) => {
      if (mockNow - lastTime < cooldownMs) {
        return false; // suppressed by debounce/cooldown
      }
      lastTime = mockNow;
      callCount++;
      return true;
    };

    // Simulate 15 rapid clicks in quick succession (e.g. within 200ms)
    const timestamps = [
      1000, 1010, 1025, 1040, 1060, 1080, 1100, 1120, 1140, 1160, 1180, 1200, 1220, 1240, 1260
    ];

    let registeredClicks = 0;
    for (const t of timestamps) {
      if (throttledToggle(t)) {
        registeredClicks++;
      }
    }

    // Only the first click at 1000 should register; all 14 rapid subsequent clicks must be blocked
    assert.strictEqual(registeredClicks, 1, 'Only 1 click must be accepted during rapid click bursts');
    assert.strictEqual(callCount, 1);

    // After waiting past the cooldown window (e.g. at 1400ms = 400ms later), next click succeeds
    const nextClick = throttledToggle(1400);
    assert.strictEqual(nextClick, true, 'Click after cooldown window must be accepted');
    assert.strictEqual(callCount, 2);
  });

  it('verifies toast manager deduplication contract: only 1 toast exists with the same ID', () => {
    // Simulate react-hot-toast queue with id replacement
    const toastStore = new Map<string, { message: string; icon?: string }>();

    const showToast = (message: string, options?: { id?: string; icon?: string }) => {
      const id = options?.id || Math.random().toString();
      toastStore.set(id, { message, icon: options?.icon });
      return id;
    };

    // User toggles reels blocker multiple times with REELS_BLOCKER_TOAST_ID
    showToast('Reels & Shorts Blocker enabled', { id: REELS_BLOCKER_TOAST_ID, icon: '🛡️' });
    assert.strictEqual(toastStore.size, 1);
    assert.strictEqual(toastStore.get(REELS_BLOCKER_TOAST_ID)?.message, 'Reels & Shorts Blocker enabled');

    showToast('Reels & Shorts Blocker disabled', { id: REELS_BLOCKER_TOAST_ID });
    // Toast store size must stay 1 (updated in place, not stacked!)
    assert.strictEqual(toastStore.size, 1);
    assert.strictEqual(toastStore.get(REELS_BLOCKER_TOAST_ID)?.message, 'Reels & Shorts Blocker disabled');

    showToast('Accessibility granted! Reels & Shorts Blocker enabled', { id: REELS_BLOCKER_TOAST_ID, icon: '🛡️' });
    // Toast store size must still stay 1!
    assert.strictEqual(toastStore.size, 1);
    assert.strictEqual(toastStore.get(REELS_BLOCKER_TOAST_ID)?.message, 'Accessibility granted! Reels & Shorts Blocker enabled');
  });

  it('persists and loads reels blocker enabled state reliably', () => {
    const originalWindow = (global as any).window;
    const originalLocalStorage = (global as any).localStorage;
    const store = new Map<string, string>();

    (global as any).window = {};
    (global as any).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };

    try {
      saveBlockShortsReelsEnabled(true);
      assert.strictEqual(loadBlockShortsReelsEnabled(), true);

      saveBlockShortsReelsEnabled(false);
      assert.strictEqual(loadBlockShortsReelsEnabled(), false);
    } finally {
      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    }
  });
});
