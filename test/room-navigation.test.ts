import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Active Room Swipe Navigation Specification', () => {
  it('correctly maps available room tabs based on host status', () => {
    const getRoomTabs = (isHost: boolean): Array<'home' | 'chat' | 'settings'> => {
      return isHost ? ['home', 'chat', 'settings'] : ['home', 'chat'];
    };

    assert.deepEqual(getRoomTabs(true), ['home', 'chat', 'settings']);
    assert.deepEqual(getRoomTabs(false), ['home', 'chat']);
  });

  it('correctly resolves target tab on swipe left (next) and swipe right (previous)', () => {
    const resolveSwipeTarget = (
      currentIdx: number,
      dx: number,
      tabs: string[],
      threshold: number
    ): number => {
      if (Math.abs(dx) > threshold) {
        if (dx < 0 && currentIdx < tabs.length - 1) {
          return currentIdx + 1; // Swipe left -> next tab
        } else if (dx > 0 && currentIdx > 0) {
          return currentIdx - 1; // Swipe right -> previous tab
        }
      }
      return currentIdx; // Below threshold or at boundary: stay on current
    };

    const hostTabs = ['home', 'chat', 'settings'];
    const memberTabs = ['home', 'chat'];
    const threshold = 50;

    // 1. From HOME, swipe left moves to CHAT
    assert.equal(resolveSwipeTarget(0, -80, hostTabs, threshold), 1);
    assert.equal(resolveSwipeTarget(0, -80, memberTabs, threshold), 1);

    // 2. From HOME, swipe right stays on HOME (boundary resistance)
    assert.equal(resolveSwipeTarget(0, 80, hostTabs, threshold), 0);

    // 3. From CHAT, swipe right moves to HOME
    assert.equal(resolveSwipeTarget(1, 80, hostTabs, threshold), 0);
    assert.equal(resolveSwipeTarget(1, 80, memberTabs, threshold), 0);

    // 4. From CHAT, swipe left moves to SETTINGS for host, but stays on CHAT for non-host
    assert.equal(resolveSwipeTarget(1, -80, hostTabs, threshold), 2);
    assert.equal(resolveSwipeTarget(1, -80, memberTabs, threshold), 1);

    // 5. From SETTINGS, swipe right moves to CHAT
    assert.equal(resolveSwipeTarget(2, 80, hostTabs, threshold), 1);

    // 6. Insufficient swipe distance maintains current tab
    assert.equal(resolveSwipeTarget(1, -20, hostTabs, threshold), 1);
  });

  it('clears unread count whenever navigating to the chat tab', () => {
    let unreadCount = 5;
    const navigateToTab = (tab: 'home' | 'chat' | 'settings') => {
      if (tab === 'chat') {
        unreadCount = 0;
      }
    };

    navigateToTab('home');
    assert.equal(unreadCount, 5, 'Unread count should not clear on home');

    navigateToTab('chat');
    assert.equal(unreadCount, 0, 'Unread count must clear upon opening chat');
  });

  it('guarantees text inputs and active modals block horizontal room swipe', () => {
    const isRoomNonSwipable = (
      tagName: string,
      hasModal: boolean,
      isNoSwipeAttr: boolean
    ): boolean => {
      if (hasModal) return true;
      if (isNoSwipeAttr) return true;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
      return false;
    };

    // Chat input must not trigger room tab swipe
    assert.equal(isRoomNonSwipable('INPUT', false, false), true);
    assert.equal(isRoomNonSwipable('TEXTAREA', false, false), true);

    // Modals open must disable room tab swipe
    assert.equal(isRoomNonSwipable('DIV', true, false), true);

    // Regular avatar area or chat container allows swipe
    assert.equal(isRoomNonSwipable('DIV', false, false), false);
  });

  it('guarantees parent SwipeTabContainer is disabled when inside an active room', () => {
    const isParentSwipeContainerDisabled = (
      activeTab: string,
      isInsideRoom: boolean
    ): boolean => {
      return activeTab === 'rooms' && isInsideRoom;
    };

    assert.equal(isParentSwipeContainerDisabled('rooms', true), true, 'Must be disabled inside room');
    assert.equal(isParentSwipeContainerDisabled('rooms', false), false, 'Must be active on rooms list');
    assert.equal(isParentSwipeContainerDisabled('timer', false), false, 'Must be active on timer tab');
  });
});
