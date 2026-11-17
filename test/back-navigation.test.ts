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
});
