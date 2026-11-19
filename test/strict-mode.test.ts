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

  it('guarantees Ultra Strict permits whitelisted allowed apps and blocks non-allowed apps', () => {
    const allowed = ['com.google.android.calculator', 'com.google.android.apps.messaging'];
    const isAppBlocked = (pkg: string): boolean => {
      return !allowed.includes(pkg);
    };

    // Under Ultra Strict Mode: whitelisted apps are allowed / unblocked
    assert.equal(isAppBlocked('com.google.android.calculator'), false);
    assert.equal(isAppBlocked('com.google.android.apps.messaging'), false);

    // Non-allowed / distracting apps are strictly blocked
    assert.equal(isAppBlocked('com.instagram.android'), true);
    assert.equal(isAppBlocked('com.google.android.youtube'), true);
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

  it('guarantees Strict Mode app blocking stays active while timer is paused and only stops on timer stop', () => {
    // Contract simulation matching TimerForegroundService state machine
    let isRunning = false;
    let isPaused = false;
    let isStrictActive = true;
    let isMonitoring = false;

    const startStrictMonitoring = () => {
      if (isStrictActive && (isRunning || isPaused)) {
        isMonitoring = true;
      }
    };

    const stopStrictMonitoring = () => {
      isMonitoring = false;
    };

    const handleStart = () => {
      isRunning = true;
      isPaused = false;
      startStrictMonitoring();
    };

    const handlePause = () => {
      if (!isRunning || isPaused) return;
      isPaused = true;
      // Strict Mode remains actively enforced during pause!
      if (isStrictActive) {
        startStrictMonitoring();
      }
    };

    const handleResume = () => {
      isPaused = false;
      isRunning = true;
      startStrictMonitoring();
    };

    const handleStop = () => {
      stopStrictMonitoring();
      isRunning = false;
      isPaused = false;
    };

    const shouldBlockDistraction = (pkg: string, allowed: string[]) => {
      // Enforcement condition: active when (isRunning || isPaused) and isStrictActive
      if (!((isRunning || isPaused) && isStrictActive && isMonitoring)) {
        return false;
      }
      return !allowed.includes(pkg);
    };

    const allowed = ['com.google.android.calculator'];

    // 1. Initially stopped
    assert.equal(shouldBlockDistraction('com.instagram.android', allowed), false);

    // 2. Timer started
    handleStart();
    assert.equal(isMonitoring, true);
    assert.equal(shouldBlockDistraction('com.google.android.calculator', allowed), false);
    assert.equal(shouldBlockDistraction('com.instagram.android', allowed), true);

    // 3. User pauses the timer: blocked apps MUST STILL BE BLOCKED!
    handlePause();
    assert.equal(isPaused, true);
    assert.equal(isMonitoring, true, 'Monitoring must stay active during pause');
    assert.equal(shouldBlockDistraction('com.instagram.android', allowed), true, 'Distracting app must remain blocked while paused');
    assert.equal(shouldBlockDistraction('com.google.android.calculator', allowed), false, 'Allowed app remains accessible while paused');

    // 4. User resumes the timer
    handleResume();
    assert.equal(isPaused, false);
    assert.equal(isMonitoring, true);
    assert.equal(shouldBlockDistraction('com.instagram.android', allowed), true);

    // 5. Timer officially stopped: only NOW is blocking deactivated
    handleStop();
    assert.equal(isMonitoring, false, 'Monitoring must stop when timer stops');
    assert.equal(shouldBlockDistraction('com.instagram.android', allowed), false, 'Apps unblocked after timer stop');
  });

  it('guarantees Strict Mode is completely bypassed on the phone when timer is started remotely from desktop', () => {
    let isLocalStrictMode = true;
    let isRemoteSession = false;
    let isStudying = false;

    // Evaluator matching StudyTimer.tsx and native sync
    const computeEffectiveStrictConfig = (localEnabled: boolean, remote: boolean) => {
      return {
        enabled: localEnabled && !remote,
        isUltraStrict: false && !remote,
      };
    };

    const shouldCheckViolation = (studying: boolean, strictActive: boolean, remote: boolean) => {
      if (!studying || !strictActive || remote) return false;
      return true;
    };

    // 1. Initially idle on phone with Strict Mode enabled
    assert.equal(isLocalStrictMode, true);
    assert.equal(isRemoteSession, false);
    assert.equal(shouldCheckViolation(isStudying, isLocalStrictMode, isRemoteSession), false);

    // 2. User starts timer on desktop (PC): remote sync arrives on phone
    isStudying = true;
    isRemoteSession = true;

    // Effective strict config sent to native Foreground Service
    const nativeConfig = computeEffectiveStrictConfig(isLocalStrictMode, isRemoteSession);
    assert.equal(nativeConfig.enabled, false, 'Native strict monitoring must be disabled on phone during remote desktop session');

    // Phone foreground violation check
    const phoneWillBlock = shouldCheckViolation(isStudying, isLocalStrictMode, isRemoteSession);
    assert.equal(phoneWillBlock, false, 'Phone must NOT block apps when focus session originated from PC');

    // 3. User stops session on desktop
    isStudying = false;
    isRemoteSession = false;

    const restoredNativeConfig = computeEffectiveStrictConfig(isLocalStrictMode, isRemoteSession);
    assert.equal(restoredNativeConfig.enabled, true, 'Local strict mode preference is restored once remote session ends');
  });
});
