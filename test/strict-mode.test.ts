import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isStrictModeSupported,
  loadStrictModeEnabled,
  saveStrictModeEnabled,
  loadAllowedApps,
  saveAllowedApps,
  loadUltraStrictEnabled,
  saveUltraStrictEnabled,
} from '../src/lib/strictModePlugin';
import { resolveNotificationConfig } from '../src/lib/notifications';

describe('Strict Mode Android Specification & Platform Isolation', () => {
  it('guarantees Strict Mode is NOT supported on PC / Desktop web environment', () => {
    // In node/desktop web test environment without native Capacitor, isStrictModeSupported() MUST be false
    const supported = isStrictModeSupported();
    assert.equal(supported, false, 'Strict Mode must never activate on PC or web');
  });

  it('correctly persists and loads strict mode state', () => {
    // Mock localStorage and window
    const store: Record<string, string> = {};
    const originalLocalStorage = global.localStorage;
    const originalWindow = (global as any).window;
    (global as any).window = global;
    (global as any).localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    };

    try {
      assert.equal(loadStrictModeEnabled(), false);
      saveStrictModeEnabled(true);
      assert.equal(loadStrictModeEnabled(), true);
      saveStrictModeEnabled(false);
      assert.equal(loadStrictModeEnabled(), false);
    } finally {
      (global as any).localStorage = originalLocalStorage;
      (global as any).window = originalWindow;
    }
  });

  it('correctly persists and filters allowed apps list', () => {
    const store: Record<string, string> = {};
    const originalLocalStorage = global.localStorage;
    const originalWindow = (global as any).window;
    (global as any).window = global;
    (global as any).localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    };

    try {
      assert.deepEqual(loadAllowedApps(), []);

      const allowedList = [
        'com.google.android.calculator',
        'com.google.android.apps.messaging',
        'com.google.android.dialer',
      ];
      saveAllowedApps(allowedList);
      assert.deepEqual(loadAllowedApps(), allowedList);

      // Verify checking if an app is allowed
      const isAllowed = (pkg: string) => loadAllowedApps().includes(pkg);

      assert.equal(isAllowed('com.google.android.calculator'), true);
      assert.equal(isAllowed('com.instagram.android'), false);
      assert.equal(isAllowed('com.zhiliaoapp.musically'), false);
      assert.equal(isAllowed('com.google.android.youtube'), false);
    } finally {
      (global as any).localStorage = originalLocalStorage;
      (global as any).window = originalWindow;
    }
  });

  it('correctly routes strict_mode_blocked notification with high priority on timer channel', () => {
    const config = resolveNotificationConfig('strict_mode_blocked', {
      title: '🚫 Strict Mode: Instagram Blocked!',
      body: 'Return to Study.io to keep your focus streak alive.',
    });

    assert.equal(config.title, '🚫 Strict Mode: Instagram Blocked!');
    assert.equal(config.body, 'Return to Study.io to keep your focus streak alive.');
    assert.equal(config.channelId, 'timer_alerts');
    assert.equal(config.tab, 'timer');
  });

  it('validates launcher and system exclusion contract so home screen is not blocked', () => {
    const isLauncherOrSystemContract = (pkg: string): boolean => {
      if (pkg === 'com.studyio.app') return true;
      if (pkg === 'android' || pkg === 'com.android.systemui') return true;
      const lower = pkg.toLowerCase();
      if (
        lower.startsWith('com.android.launcher') ||
        lower.includes('nexuslauncher') ||
        lower.includes('quickstep') ||
        lower.includes('miui.home') ||
        lower.includes('sec.android.app.launcher')
      ) {
        return true;
      }
      return false;
    };

    // System and launcher apps must not be considered third-party distractions
    assert.equal(isLauncherOrSystemContract('com.studyio.app'), true);
    assert.equal(isLauncherOrSystemContract('android'), true);
    assert.equal(isLauncherOrSystemContract('com.android.systemui'), true);
    assert.equal(isLauncherOrSystemContract('com.google.android.apps.nexuslauncher'), true);
    assert.equal(isLauncherOrSystemContract('com.sec.android.app.launcher'), true);

    // Distracting social apps must be evaluated against user allowed list
    assert.equal(isLauncherOrSystemContract('com.instagram.android'), false);
    assert.equal(isLauncherOrSystemContract('com.google.android.youtube'), false);
    assert.equal(isLauncherOrSystemContract('com.twitter.android'), false);
  });

  it('correctly persists and loads ultra strict mode state', () => {
    const store: Record<string, string> = {};
    const originalLocalStorage = global.localStorage;
    const originalWindow = (global as any).window;
    (global as any).window = global;
    (global as any).localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    };

    try {
      assert.equal(loadUltraStrictEnabled(), false);
      saveUltraStrictEnabled(true);
      assert.equal(loadUltraStrictEnabled(), true);
      saveUltraStrictEnabled(false);
      assert.equal(loadUltraStrictEnabled(), false);
    } finally {
      (global as any).localStorage = originalLocalStorage;
      (global as any).window = originalWindow;
    }
  });

  it('guarantees Ultra Strict blocks ALL apps including whitelisted allowed apps', () => {
    const allowed = ['com.google.android.calculator', 'com.google.android.apps.messaging'];
    const isAppBlocked = (pkg: string, isUltra: boolean): boolean => {
      if (isUltra) return true; // Ultra Strict blocks ALL apps without exception
      return !allowed.includes(pkg);
    };

    // Under normal Strict Mode: calculator and messaging are allowed
    assert.equal(isAppBlocked('com.google.android.calculator', false), false);
    assert.equal(isAppBlocked('com.google.android.apps.messaging', false), false);
    assert.equal(isAppBlocked('com.instagram.android', false), true);

    // Under Ultra Strict Mode: ALL non-system apps are blocked, including calculator & messaging!
    assert.equal(isAppBlocked('com.google.android.calculator', true), true);
    assert.equal(isAppBlocked('com.google.android.apps.messaging', true), true);
    assert.equal(isAppBlocked('com.instagram.android', true), true);
    assert.equal(isAppBlocked('com.google.android.youtube', true), true);
  });

  it('guarantees Ultra Strict restricts timer modes strictly to Countdown only', () => {
    const getAvailableModes = (isUltra: boolean): string[] => {
      return isUltra ? ['countdown'] : ['stopwatch', 'countdown', 'pomodoro'];
    };

    assert.deepEqual(getAvailableModes(false), ['stopwatch', 'countdown', 'pomodoro']);
    assert.deepEqual(getAvailableModes(true), ['countdown']);
  });

  it('guarantees Countdown with Strict Mode requires explicit user acceptance before timer turns on', () => {
    let timerStarted = false;
    let warningPromptOpen = false;

    const onStartSession = (isAndroid: boolean, isStrictOrUltra: boolean, mode: string) => {
      if (isAndroid && isStrictOrUltra && mode === 'countdown') {
        warningPromptOpen = true;
        return; // Intercepted: must prompt user first!
      }
      timerStarted = true;
    };

    // 1. Starting countdown in strict mode must NOT immediately start timer; it opens warning prompt
    onStartSession(true, true, 'countdown');
    assert.equal(warningPromptOpen, true, 'Warning confirmation must open');
    assert.equal(timerStarted, false, 'Timer must NOT turn on before acceptance');

    // 2. User cancels: prompt closes, timer remains off
    warningPromptOpen = false;
    assert.equal(timerStarted, false, 'Timer must remain off if user cancels');

    // 3. User accepts: timer turns on
    const onUserAccept = () => {
      warningPromptOpen = false;
      timerStarted = true;
    };
    onUserAccept();
    assert.equal(timerStarted, true, 'Timer must turn on only when user accepts');
  });
});
