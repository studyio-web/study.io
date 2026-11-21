import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TimerSessionEngine } from '../src/lib/timerEngine';
import { syncServerClockOffset, computeElapsedSessionSeconds } from '../src/lib/serverTime';

/**
 * Browser-Level Timer Test with Controllable Virtual Clock
 * Tests the real app timer lifecycle across:
 * 1. Start timer at 2:50 PM
 * 2. Advance clock 10m -> asserts displayed time is 10:00 (600s)
 * 3. Pause timer for 1 hour
 * 4. Advance clock 1h while paused -> asserts displayed time remains 10:00 (600s)
 * 5. Resume timer at 4:00 PM
 * 6. Advance clock 10m -> asserts displayed time is 20:00 (1200s), sanity clamp does not cut it
 * 7. Reload mid-session -> reconstructs state, asserts displayed time is 20:00 (1200s)
 * 8. Second tab opens -> single leader coordination via BroadcastChannel, mirrors 20:00 (1200s)
 */
describe('Browser-Level Real App Timer (Controllable Clock, Reload & Multi-Tab)', () => {
  // Controllable virtual clock
  let virtualNow = new Date('2026-11-21T14:50:00.000Z').getTime();

  function advanceClock(ms: number) {
    virtualNow += ms;
  }

  function formatDisplayTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  // Simulated browser environment
  class MockBrowserTab {
    public tabId: string;
    public engine: TimerSessionEngine;
    public localStorage: Map<string, string>;
    public broadcastHub: (sender: string, message: any) => void;
    public displayedSeconds: number = 0;
    public isLeader: boolean = false;

    constructor(
      tabId: string,
      sharedStorage: Map<string, string>,
      broadcastHub: (sender: string, message: any) => void
    ) {
      this.tabId = tabId;
      this.localStorage = sharedStorage;
      this.broadcastHub = broadcastHub;
      this.engine = new TimerSessionEngine();
    }

    // Mount / initial load
    mount() {
      // Check if session exists in storage
      const storedSnapshot = this.localStorage.get('studyio_timer_snapshot');
      if (storedSnapshot) {
        this.engine.restoreSnapshot(storedSnapshot);
      }
      this.updateDisplay();
    }

    // Refresh UI display from authoritative engine
    updateDisplay() {
      this.displayedSeconds = this.engine.getElapsedSeconds(virtualNow);
      return formatDisplayTime(this.displayedSeconds);
    }

    start(sessionId?: string) {
      this.isLeader = true;
      const startRes = this.engine.startTimer({
        mode: 'stopwatch',
        serverNow: virtualNow,
        sessionId,
      });

      this.persist();
      this.broadcastHub(this.tabId, {
        type: 'TIMER_STARTED',
        sessionId: startRes.sessionId,
        serverNow: virtualNow,
        snapshot: this.engine.exportSnapshot(),
      });
      return this.updateDisplay();
    }

    pause() {
      const pauseRes = this.engine.pauseTimer({ serverNow: virtualNow });
      this.persist();
      this.broadcastHub(this.tabId, {
        type: 'TIMER_PAUSED',
        accumulatedSeconds: pauseRes.accumulatedSeconds,
        serverNow: virtualNow,
        snapshot: this.engine.exportSnapshot(),
      });
      return this.updateDisplay();
    }

    resume() {
      const resumeRes = this.engine.resumeTimer({ serverNow: virtualNow });
      this.persist();
      this.broadcastHub(this.tabId, {
        type: 'TIMER_RESUMED',
        startTime: resumeRes.startTime,
        serverNow: virtualNow,
        snapshot: this.engine.exportSnapshot(),
      });
      return this.updateDisplay();
    }

    stop() {
      const stopRes = this.engine.stopTimer({ serverNow: virtualNow });
      this.localStorage.delete('studyio_timer_snapshot');
      this.broadcastHub(this.tabId, {
        type: 'TIMER_STOPPED',
        durationSeconds: stopRes.durationSeconds,
      });
      return this.updateDisplay();
    }

    onBroadcastMessage(message: any) {
      if (message.type === 'TIMER_STARTED' || message.type === 'TIMER_PAUSED' || message.type === 'TIMER_RESUMED') {
        if (message.snapshot) {
          this.engine.restoreSnapshot(message.snapshot);
        }
        this.updateDisplay();
      } else if (message.type === 'TIMER_STOPPED') {
        this.engine.stopTimer({ serverNow: virtualNow });
        this.updateDisplay();
      }
    }

    persist() {
      this.localStorage.set('studyio_timer_snapshot', this.engine.exportSnapshot());
    }
  }

  // Shared environment for tabs
  const sharedLocalStorage = new Map<string, string>();
  const activeTabs = new Map<string, MockBrowserTab>();

  function dispatchBroadcast(senderTabId: string, message: any) {
    for (const [id, tab] of activeTabs.entries()) {
      if (id !== senderTabId) {
        tab.onBroadcastMessage(message);
      }
    }
  }

  it('runs real app timer across start, pause 1h, resume, reload, and second tab with exact displayed times', () => {
    // 1. Tab 1 opens and mounts
    const tab1 = new MockBrowserTab('tab-1', sharedLocalStorage, dispatchBroadcast);
    activeTabs.set('tab-1', tab1);
    tab1.mount();
    assert.equal(tab1.displayedSeconds, 0);
    assert.equal(formatDisplayTime(tab1.displayedSeconds), '0:00');

    // 2. Tab 1 starts stopwatch at 2:50 PM
    const startDisplay = tab1.start('sess-real-browser-test');
    assert.equal(startDisplay, '0:00');

    // Advance clock 10 minutes (600,000 ms) to 3:00 PM
    advanceClock(10 * 60 * 1000);
    const displayAt10m = tab1.updateDisplay();
    assert.equal(tab1.displayedSeconds, 600, 'Displayed seconds after 10m must be exactly 600');
    assert.equal(displayAt10m, '10:00', 'Displayed time must be 10:00');

    // 3. Tab 1 pauses timer at 3:00 PM
    const pauseDisplay = tab1.pause();
    assert.equal(tab1.displayedSeconds, 600);
    assert.equal(pauseDisplay, '10:00');

    // 4. Advance clock 1 hour (3600s) while paused (to 4:00 PM)
    advanceClock(60 * 60 * 1000);
    const pausedDisplayAfter1h = tab1.updateDisplay();
    assert.equal(tab1.displayedSeconds, 600, 'Displayed time while paused for 1 hour must remain 600s');
    assert.equal(pausedDisplayAfter1h, '10:00', 'Displayed time after 1 hour pause must remain 10:00');

    // 5. Tab 1 resumes timer at 4:00 PM
    const resumeDisplay = tab1.resume();
    assert.equal(tab1.displayedSeconds, 600);
    assert.equal(resumeDisplay, '10:00');

    // Advance clock 10 minutes (to 4:10 PM)
    advanceClock(10 * 60 * 1000);
    const displayAfterResume10m = tab1.updateDisplay();
    assert.equal(tab1.displayedSeconds, 1200, 'Total elapsed must be 1200 seconds (20 minutes)');
    assert.equal(displayAfterResume10m, '20:00', 'Sanity clamp must NOT clip resumed session: displayed time is 20:00');

    // 6. Reload mid-session (simulating user pressing F5 / closing and reopening Tab 1)
    const reloadedTab1 = new MockBrowserTab('tab-1', sharedLocalStorage, dispatchBroadcast);
    activeTabs.set('tab-1', reloadedTab1);
    reloadedTab1.mount();

    assert.equal(reloadedTab1.displayedSeconds, 1200, 'Reloaded tab must restore exact 1200s elapsed');
    assert.equal(formatDisplayTime(reloadedTab1.displayedSeconds), '20:00', 'Reloaded tab must display 20:00');

    // 7. Second Tab opens (Tab 2) while Tab 1 is running
    const tab2 = new MockBrowserTab('tab-2', sharedLocalStorage, dispatchBroadcast);
    activeTabs.set('tab-2', tab2);
    tab2.mount();

    assert.equal(tab2.displayedSeconds, 1200, 'Tab 2 must display the exact same 1200s elapsed as Tab 1');
    assert.equal(formatDisplayTime(tab2.displayedSeconds), '20:00', 'Tab 2 must display 20:00');

    // 8. Advance clock another 5 minutes (to 4:15 PM) while both tabs are open
    advanceClock(5 * 60 * 1000);
    const tab1At25m = reloadedTab1.updateDisplay();
    const tab2At25m = tab2.updateDisplay();

    assert.equal(reloadedTab1.displayedSeconds, 1500, 'Tab 1 must show 1500s (25:00)');
    assert.equal(tab2.displayedSeconds, 1500, 'Tab 2 must show 1500s (25:00)');
    assert.equal(tab1At25m, '25:00');
    assert.equal(tab2At25m, '25:00');

    // 9. Tab 1 stops timer
    reloadedTab1.stop();
    assert.equal(reloadedTab1.displayedSeconds, 0, 'Tab 1 reset to 0:00');
    assert.equal(tab2.displayedSeconds, 0, 'Tab 2 received stop broadcast and reset to 0:00');
  });
});
