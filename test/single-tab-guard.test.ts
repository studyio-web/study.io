import test from 'node:test';
import assert from 'node:assert/strict';

interface TabLockData {
  tabId: string;
  userId: string;
  lastHeartbeat: number;
  createdAt: number;
}

// Emulate tab lock registry & resolution
class MockTabLockRegistry {
  private store = new Map<string, string>();

  getLock(userId: string): TabLockData | null {
    const raw = this.store.get(`studyio_active_tab_${userId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  setLock(data: TabLockData): void {
    this.store.set(`studyio_active_tab_${data.userId}`, JSON.stringify(data));
  }

  clearLock(userId: string, tabId: string): boolean {
    const current = this.getLock(userId);
    if (current && current.tabId === tabId) {
      this.store.delete(`studyio_active_tab_${userId}`);
      return true;
    }
    return false;
  }

  evaluateTabStatus(userId: string, myTabId: string, now: number): { isBlocked: boolean; canClaim: boolean } {
    const lock = this.getLock(userId);
    if (!lock) {
      return { isBlocked: false, canClaim: true };
    }

    if (lock.tabId === myTabId) {
      return { isBlocked: false, canClaim: false };
    }

    const isFresh = now - lock.lastHeartbeat < 5500;
    if (isFresh) {
      return { isBlocked: true, canClaim: false };
    }

    // Stale lock from crashed or ungracefully closed tab
    return { isBlocked: false, canClaim: true };
  }
}

test('Desktop Single-Active-Tab Account Guard Specification', async (t) => {
  await t.test('first tab for account claims active leadership', () => {
    const registry = new MockTabLockRegistry();
    const now = 1000000;
    const userId = 'usr_alice';
    const tab1 = 'tab_1';

    const status1 = registry.evaluateTabStatus(userId, tab1, now);
    assert.equal(status1.isBlocked, false);
    assert.equal(status1.canClaim, true);

    registry.setLock({ tabId: tab1, userId, lastHeartbeat: now, createdAt: now });
  });

  await t.test('second tab for same account is blocked while first tab is alive', () => {
    const registry = new MockTabLockRegistry();
    const now = 1000000;
    const userId = 'usr_alice';
    const tab1 = 'tab_1';
    const tab2 = 'tab_2';

    // Tab 1 claims lock
    registry.setLock({ tabId: tab1, userId, lastHeartbeat: now, createdAt: now });

    // Tab 2 opens 1 second later
    const status2 = registry.evaluateTabStatus(userId, tab2, now + 1000);
    assert.equal(status2.isBlocked, true, 'Tab 2 must be blocked by active Tab 1');
    assert.equal(status2.canClaim, false);
  });

  await t.test('different user accounts do not block each other', () => {
    const registry = new MockTabLockRegistry();
    const now = 1000000;
    const userAlice = 'usr_alice';
    const userBob = 'usr_bob';
    const tabAlice = 'tab_alice';
    const tabBob = 'tab_bob';

    // Alice opens tab
    registry.setLock({ tabId: tabAlice, userId: userAlice, lastHeartbeat: now, createdAt: now });

    // Bob opens tab
    const statusBob = registry.evaluateTabStatus(userBob, tabBob, now + 500);
    assert.equal(statusBob.isBlocked, false, 'Bob must not be blocked by Alice');
    assert.equal(statusBob.canClaim, true);
  });

  await t.test('stale locks (> 5.5s) are superseded if tab crashes without unloadevent', () => {
    const registry = new MockTabLockRegistry();
    const t0 = 1000000;
    const userId = 'usr_alice';
    const tab1 = 'tab_crashed';
    const tab2 = 'tab_fresh';

    // Tab 1 had heartbeat at t0
    registry.setLock({ tabId: tab1, userId, lastHeartbeat: t0, createdAt: t0 });

    // 6 seconds later (exceeds 5.5s timeout)
    const t1 = t0 + 6000;
    const status2 = registry.evaluateTabStatus(userId, tab2, t1);
    assert.equal(status2.isBlocked, false, 'Crashed tab must not indefinitely lock out user');
    assert.equal(status2.canClaim, true);
  });

  await t.test('explicit tab closure unblocks waiting tab', () => {
    const registry = new MockTabLockRegistry();
    const now = 1000000;
    const userId = 'usr_alice';
    const tab1 = 'tab_1';
    const tab2 = 'tab_2';

    registry.setLock({ tabId: tab1, userId, lastHeartbeat: now, createdAt: now });
    assert.equal(registry.evaluateTabStatus(userId, tab2, now).isBlocked, true);

    // Tab 1 closes gracefully
    const cleared = registry.clearLock(userId, tab1);
    assert.equal(cleared, true);

    // Tab 2 checks status
    assert.equal(registry.evaluateTabStatus(userId, tab2, now).isBlocked, false);
  });

  await t.test('user clicking "Use This Tab Instead" force-claims leadership', () => {
    const registry = new MockTabLockRegistry();
    const now = 1000000;
    const userId = 'usr_alice';
    const tab1 = 'tab_1';
    const tab2 = 'tab_2';

    registry.setLock({ tabId: tab1, userId, lastHeartbeat: now, createdAt: now });

    // Tab 2 takes over
    registry.setLock({ tabId: tab2, userId, lastHeartbeat: now + 500, createdAt: now + 500 });

    // Now Tab 1 evaluates as blocked
    assert.equal(registry.evaluateTabStatus(userId, tab1, now + 500).isBlocked, true);
    // Tab 2 evaluates as active
    assert.equal(registry.evaluateTabStatus(userId, tab2, now + 500).isBlocked, false);
  });
});
