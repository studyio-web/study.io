import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isStrictModeSupported,
  loadStrictModeEnabled,
  saveStrictModeEnabled,
  loadAllowedApps,
  saveAllowedApps,
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
});
