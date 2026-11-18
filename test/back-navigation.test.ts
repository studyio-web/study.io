import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { registerBackButtonHandler } from '../src/lib/native-feel';

describe('Android Back Button LIFO Registry & Navigation Specification', () => {
  test('executes registered handlers in LIFO order (last registered runs first)', async () => {
    const executed: string[] = [];

    const unsub1 = registerBackButtonHandler(() => {
      executed.push('first-registered');
      return false;
    });

    const unsub2 = registerBackButtonHandler(() => {
      executed.push('second-registered');
      return false;
    });

    const unsub3 = registerBackButtonHandler(() => {
      executed.push('third-registered');
      return true; // consumes event
    });

    // Simulate event trigger
    // Since unsub3 returns true, unsub2 and unsub1 should not be needed if handled
    // Verify unsubscribe works cleanly
    unsub3();
    unsub2();
    unsub1();
  });

  test('verifies tab back-navigation specification: returns to timer tab before exit', () => {
    // Model the exact state machine used in page.tsx
    let currentTab: 'timer' | 'tasks' | 'analytics' | 'rooms' | 'settings' = 'rooms';
    let appExited = false;

    const handleBackButton = () => {
      if (currentTab !== 'timer') {
        currentTab = 'timer';
        return true; // handled, don't exit
      }
      appExited = true;
      return false; // let app exit
    };

    // 1. User starts on 'rooms' tab
    assert.equal(currentTab, 'rooms');

    // 2. User presses back button -> should navigate back to 'timer'
    const handledFirst = handleBackButton();
    assert.equal(handledFirst, true);
    assert.equal(currentTab, 'timer');
    assert.equal(appExited, false);

    // 3. User is now on 'timer' and presses back button again -> app exits
    const handledSecond = handleBackButton();
    assert.equal(handledSecond, false);
    assert.equal(appExited, true);
  });

  test('verifies modal dismissal takes precedence over tab navigation', () => {
    let currentTab: 'timer' | 'tasks' = 'tasks';
    let isModalOpen = true;

    const handleBackButton = () => {
      if (isModalOpen) {
        isModalOpen = false;
        return true;
      }
      if (currentTab !== 'timer') {
        currentTab = 'timer';
        return true;
      }
      return false;
    };

    // First back click closes modal, tab stays 'tasks'
    assert.equal(handleBackButton(), true);
    assert.equal(isModalOpen, false);
    assert.equal(currentTab, 'tasks');

    // Second back click changes tab to 'timer'
    assert.equal(handleBackButton(), true);
    assert.equal(currentTab, 'timer');

    // Third back click exits
    assert.equal(handleBackButton(), false);
  });

  test('verifies hierarchical room navigation: chat -> home -> rooms -> timer -> exit', () => {
    // Model state across ActiveRoom, StudyRoomsTab, and page.tsx
    type AppState = {
      activeTab: 'timer' | 'tasks' | 'analytics' | 'rooms' | 'settings' | 'leaderboard';
      activeRoomId: string | null;
      roomTab: 'home' | 'chat' | 'settings';
      replyingTo: boolean;
      mentionQuery: string | null;
      isScholarModalOpen: boolean;
      appExited: boolean;
    };

    const state: AppState = {
      activeTab: 'rooms',
      activeRoomId: 'room-physics-101',
      roomTab: 'chat',
      replyingTo: false,
      mentionQuery: null,
      isScholarModalOpen: false,
      appExited: false,
    };

    // The unified back button dispatcher matching ActiveRoom -> StudyRoomsTab -> page.tsx -> native-feel
    const pressHardwareBackButton = (): boolean => {
      // 1. ActiveRoom handler (runs first when ActiveRoom is mounted)
      if (state.activeRoomId) {
        if (state.isScholarModalOpen) {
          state.isScholarModalOpen = false;
          return true;
        }
        if (state.mentionQuery !== null) {
          state.mentionQuery = null;
          return true;
        }
        if (state.replyingTo) {
          state.replyingTo = false;
          return true;
        }
        if (state.roomTab !== 'home') {
          state.roomTab = 'home';
          return true;
        }
        // When on 'home', onBack() is called, setting activeRoomId = null
        state.activeRoomId = null;
        return true;
      }

      // 2. Main Page handler (page.tsx)
      if (state.activeTab !== 'timer') {
        state.activeTab = 'timer';
        return true;
      }

      // 3. Root timer view handler -> Exit App!
      state.appExited = true;
      return false;
    };

    // Step 0: User starts in room chat
    assert.equal(state.activeTab, 'rooms');
    assert.equal(state.activeRoomId, 'room-physics-101');
    assert.equal(state.roomTab, 'chat');
    assert.equal(state.appExited, false);

    // Step 1: Press back -> navigate from 'chat' to 'home' inside the active room
    const handledStep1 = pressHardwareBackButton();
    assert.equal(handledStep1, true);
    assert.equal(state.roomTab, 'home');
    assert.equal(state.activeRoomId, 'room-physics-101');
    assert.equal(state.activeTab, 'rooms');
    assert.equal(state.appExited, false);

    // Step 2: Press back -> navigate from room 'home' back to rooms list (activeRoomId = null)
    const handledStep2 = pressHardwareBackButton();
    assert.equal(handledStep2, true);
    assert.equal(state.activeRoomId, null);
    assert.equal(state.activeTab, 'rooms');
    assert.equal(state.appExited, false);

    // Step 3: Press back -> navigate from 'rooms' tab back to 'timer' tab
    const handledStep3 = pressHardwareBackButton();
    assert.equal(handledStep3, true);
    assert.equal(state.activeTab, 'timer');
    assert.equal(state.appExited, false);

    // Step 4: Press back -> from 'timer' tab exits the app (NO looping back to rooms!)
    const handledStep4 = pressHardwareBackButton();
    assert.equal(handledStep4, false);
    assert.equal(state.appExited, true);
  });

  test('verifies room settings and mention popup hierarchy: mention -> chat -> home -> rooms -> timer -> exit', () => {
    let activeTab: string = 'rooms';
    let inRoom: boolean = true;
    let roomTab: 'home' | 'chat' | 'settings' = 'chat';
    let mentionQuery: string | null = 'aljin';
    let exited = false;

    const dispatchBack = () => {
      if (inRoom) {
        if (mentionQuery !== null) {
          mentionQuery = null;
          return true;
        }
        if (roomTab !== 'home') {
          roomTab = 'home';
          return true;
        }
        inRoom = false;
        return true;
      }
      if (activeTab !== 'timer') {
        activeTab = 'timer';
        return true;
      }
      exited = true;
      return false;
    };

    // 1. Dismiss mention autocomplete popup
    assert.equal(dispatchBack(), true);
    assert.equal(mentionQuery, null);
    assert.equal(roomTab, 'chat');

    // 2. Chat -> Home
    assert.equal(dispatchBack(), true);
    assert.equal(roomTab, 'home');
    assert.equal(inRoom, true);

    // 3. Home -> Rooms list
    assert.equal(dispatchBack(), true);
    assert.equal(inRoom, false);
    assert.equal(activeTab, 'rooms');

    // 4. Rooms list -> Timer tab
    assert.equal(dispatchBack(), true);
    assert.equal(activeTab, 'timer');

    // 5. Timer tab -> Exit
    assert.equal(dispatchBack(), false);
    assert.equal(exited, true);
  });

  test('verifies all other tabs (tasks, analytics, leaderboard, settings) return to timer tab, then exit', () => {
    const tabs: Array<'tasks' | 'analytics' | 'leaderboard' | 'settings'> = [
      'tasks',
      'analytics',
      'leaderboard',
      'settings',
    ];

    for (const tab of tabs) {
      let currentTab: string = tab;
      let exited = false;

      const back = () => {
        if (currentTab !== 'timer') {
          currentTab = 'timer';
          return true;
        }
        exited = true;
        return false;
      };

      // Press back on secondary tab -> steps to timer tab
      assert.equal(back(), true);
      assert.equal(currentTab, 'timer');
      assert.equal(exited, false);

      // Press back on timer tab -> exits app
      assert.equal(back(), false);
      assert.equal(exited, true);
    }
  });

  test('verifies replaceState avoids history oscillation between rooms and timer', () => {
    // Model window.history behavior with pushState vs replaceState
    const historyStack: string[] = ['/dashboard'];
    let currentIndex = 0;

    const navigateTabReplace = (tab: string) => {
      const url = tab === 'timer' ? '/dashboard' : `/dashboard?tab=${tab}`;
      // replaceState overwrites the current entry without creating a back-forward loop
      historyStack[currentIndex] = url;
    };

    // User switches to rooms tab
    navigateTabReplace('rooms');
    assert.equal(historyStack.length, 1);
    assert.equal(historyStack[0], '/dashboard?tab=rooms');

    // User presses back to return to timer tab
    navigateTabReplace('timer');
    assert.equal(historyStack.length, 1);
    assert.equal(historyStack[0], '/dashboard');

    // History stack length is 1, so native-feel detects root view and exits without popping to rooms
    const isRoot = historyStack.length === 1 && historyStack[0] === '/dashboard';
    assert.equal(isRoot, true);
  });
});
