package com.studyio.app;

import android.app.KeyguardManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.OrientationEventListener;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "StudyAlarm";
    public static volatile boolean isAppInForeground = false;
    public static volatile long lastForegroundTime = 0L;

    private boolean isImmersiveFullscreen = false;
    private boolean hasManuallyExitedFullscreen = false;
    private OrientationEventListener orientationEventListener;
    private volatile boolean isWebLoaded = false;
    private String pendingAlarmScript = null;
    private long appLaunchTime = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        isAppInForeground = true;
        lastForegroundTime = System.currentTimeMillis();
        appLaunchTime = System.currentTimeMillis();
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> {
            return !isWebLoaded && (System.currentTimeMillis() - appLaunchTime < 2500);
        });

        registerPlugin(TimerNotificationPlugin.class);
        registerPlugin(StrictModePlugin.class);
        registerPlugin(AccessibilityBlockerPlugin.class);
        super.onCreate(savedInstanceState);

        // Lock default app orientation strictly to portrait on launch
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

        // Enable showing over lock screen and turning screen on when alarm triggers
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        );

        // Ensure social notification channels exist natively for FCM background delivery
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                NotificationChannel alarmChannel = new NotificationChannel(
                    "timer_alarm",
                    "Session Complete Alarm",
                    NotificationManager.IMPORTANCE_HIGH
                );
                alarmChannel.setDescription("Ringing alarm for study countdown and pomodoro completion");
                alarmChannel.setSound(null, null);
                alarmChannel.enableVibration(false);
                alarmChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(alarmChannel);

                NotificationChannel nudgesChannel = new NotificationChannel(
                    "social_nudges",
                    "Study Room Nudges",
                    NotificationManager.IMPORTANCE_HIGH
                );
                nudgesChannel.setDescription("Alerts when other scholars nudge you in active study rooms");
                nudgesChannel.enableVibration(true);
                nudgesChannel.enableLights(true);
                nudgesChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(nudgesChannel);

                NotificationChannel repliesChannel = new NotificationChannel(
                    "social_replies",
                    "Room Replies",
                    NotificationManager.IMPORTANCE_HIGH
                );
                repliesChannel.setDescription("Alerts when scholars reply directly to your messages in study rooms");
                repliesChannel.enableVibration(true);
                repliesChannel.enableLights(true);
                repliesChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(repliesChannel);

                NotificationChannel mentionsChannel = new NotificationChannel(
                    "social_mentions",
                    "Room Mentions",
                    NotificationManager.IMPORTANCE_HIGH
                );
                mentionsChannel.setDescription("Alerts when scholars mention you in study rooms");
                mentionsChannel.enableVibration(true);
                mentionsChannel.enableLights(true);
                mentionsChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(mentionsChannel);

                NotificationChannel chatChannel = new NotificationChannel(
                    "social_chat",
                    "Room Chat Messages",
                    NotificationManager.IMPORTANCE_HIGH
                );
                chatChannel.setDescription("Alerts for study room chat discussion");
                chatChannel.enableVibration(true);
                chatChannel.enableLights(true);
                chatChannel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(chatChannel);
            }
        }

        // Enable drawing the web app directly under the status and navigation bars
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Make both bars completely transparent so they overlay the app
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        // Enable aggressive Android WebView caching for instant sub-second cold starts
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings webSettings = getBridge().getWebView().getSettings();
            webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
            webSettings.setDomStorageEnabled(true);
            webSettings.setDatabaseEnabled(true);

            // Add JavaScript bridge to hide/show Android status bar & gesture navigation bar on demand
            getBridge().getWebView().addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void enterFullscreen() {
                    runOnUiThread(() -> {
                        hasManuallyExitedFullscreen = false;
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                        applyImmersiveMode(true);
                    });
                }

                @JavascriptInterface
                public void exitFullscreen() {
                    runOnUiThread(() -> {
                        hasManuallyExitedFullscreen = true;
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                        applyImmersiveMode(false);
                    });
                }

                @JavascriptInterface
                public void performSmallHaptic() {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        View webView = getBridge().getWebView();
                        webView.post(() -> {
                            webView.performHapticFeedback(
                                HapticFeedbackConstants.CLOCK_TICK,
                                HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING
                            );
                        });
                    }
                }

                @JavascriptInterface
                public void openExternalUrl(String url) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(intent);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }

                @JavascriptInterface
                public void onPageLoaded() {
                    isWebLoaded = true;
                    Log.d(TAG, "WebView reported onPageLoaded");
                    if (pendingAlarmScript != null) {
                        final String script = pendingAlarmScript;
                        pendingAlarmScript = null;
                        runOnUiThread(() -> {
                            if (getBridge() != null && getBridge().getWebView() != null) {
                                Log.d(TAG, "Evaluating deferred pendingAlarmScript now that webview is loaded");
                                getBridge().getWebView().evaluateJavascript(script, null);
                            }
                        });
                    }
                }
            }, "AndroidFullscreenBridge");

            // Native download listener: when any file/APK download URL is triggered, pass to Android's system Intent so DownloadManager handles it
            getBridge().getWebView().setDownloadListener((downloadUrl, userAgent, contentDisposition, mimetype, contentLength) -> {
                try {
                    Intent downloadIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl));
                    startActivity(downloadIntent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        // Native orientation sensor: auto-open focus mode on physical landscape rotation,
        // but automatically exit back to portrait when phone is returned upright.
        orientationEventListener = new OrientationEventListener(this) {
            @Override
            public void onOrientationChanged(int orientation) {
                if (orientation == OrientationEventListener.ORIENTATION_UNKNOWN) return;

                boolean isLandscapeAngle = (orientation >= 60 && orientation <= 120) || (orientation >= 240 && orientation <= 300);
                boolean isPortraitAngle = (orientation >= 330 || orientation <= 30) || (orientation >= 150 && orientation <= 210);

                if (isPortraitAngle) {
                    hasManuallyExitedFullscreen = false;
                    if (isImmersiveFullscreen) {
                        runOnUiThread(() -> {
                            if (getBridge() != null && getBridge().getWebView() != null) {
                                getBridge().getWebView().evaluateJavascript(
                                    "window.dispatchEvent(new CustomEvent('studyio:exit-focus-mode'));",
                                    null
                                );
                            }
                        });
                    }
                } else if (isLandscapeAngle) {
                    if (!isImmersiveFullscreen && !hasManuallyExitedFullscreen) {
                        runOnUiThread(() -> {
                            if (getBridge() != null && getBridge().getWebView() != null) {
                                getBridge().getWebView().evaluateJavascript(
                                    "window.dispatchEvent(new CustomEvent('studyio:open-focus-mode'));",
                                    null
                                );
                            }
                        });
                    }
                }
            }
        };

        if (orientationEventListener.canDetectOrientation()) {
            orientationEventListener.enable();
        }

        handleNotificationIntent(getIntent());
    }

    @Override
    public void onStart() {
        super.onStart();
        isAppInForeground = true;
        lastForegroundTime = System.currentTimeMillis();
    }

    @Override
    public void onResume() {
        super.onResume();
        isAppInForeground = true;
        lastForegroundTime = System.currentTimeMillis();

        if (AlarmService.Companion.isRinging()) {
            Log.d(TAG, "onResume: AlarmService is actively ringing! Applying lockscreen & wake flags");
            applyAlarmWindowFlags();
            dispatchOpenAlarm(
                AlarmService.Companion.getAlarmMode(),
                AlarmService.Companion.getAlarmPhase(),
                AlarmService.Companion.getAlarmSubject(),
                AlarmService.Companion.getAlarmDurationSeconds()
            );
        }
    }

    public void applyAlarmWindowFlags() {
        runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    setShowWhenLocked(true);
                    setTurnScreenOn(true);
                }
                getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                );
                KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                if (km != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    km.requestDismissKeyguard(this, null);
                }
                Log.d(TAG, "Applied alarm lockscreen, turn-screen-on, and dismiss-keyguard flags");
            } catch (Exception e) {
                Log.w(TAG, "Error applying alarm window flags", e);
            }
        });
    }

    private void dispatchOpenAlarm(String mode, String phase, String subject, long duration) {
        String cleanMode = mode != null ? mode : "countdown";
        String cleanPhase = phase != null ? phase : "work";
        String cleanSubject = subject != null ? subject.replace("'", "\\'") : "";
        String script = "window.dispatchEvent(new CustomEvent('studyio:open-alarm', { detail: { " +
            "mode: '" + cleanMode + "', " +
            "phase: '" + cleanPhase + "', " +
            "subject: '" + cleanSubject + "', " +
            "duration: " + duration + " } }));";

        if (isWebLoaded && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                Log.d(TAG, "Dispatching studyio:open-alarm event directly to WebView");
                getBridge().getWebView().evaluateJavascript(script, null);
            });
        } else {
            Log.d(TAG, "WebView not yet loaded: deferring studyio:open-alarm to pendingAlarmScript");
            pendingAlarmScript = script;
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        isAppInForeground = false;
        lastForegroundTime = System.currentTimeMillis();
    }

    @Override
    public void onStop() {
        super.onStop();
        isAppInForeground = false;
    }

    @Override
    public void onDestroy() {
        isAppInForeground = false;
        if (orientationEventListener != null) {
            orientationEventListener.disable();
        }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationIntent(intent);
    }

    private void handleNotificationIntent(Intent intent) {
        if (intent == null) return;

        if (intent.hasExtra("tab")) {
            String tab = intent.getStringExtra("tab");
            if (tab != null && getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() -> {
                    getBridge().getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('studyio:navigate-tab', { detail: { tab: '" + tab + "' } }));",
                        null
                    );
                });
            }
        }

        if (intent.hasExtra("timerAction")) {
            String action = intent.getStringExtra("timerAction");
            if (action != null) {
                TimerNotificationPlugin.Companion.emitTimerAction(action);
            }
        }

        if (intent.hasExtra("alarmAction")) {
            String action = intent.getStringExtra("alarmAction");
            if (action != null) {
                TimerNotificationPlugin.Companion.emitAlarmAction(action);
            }
        }

        if (intent.getBooleanExtra("openAlarm", false)) {
            String mode = intent.getStringExtra("alarmMode");
            String phase = intent.getStringExtra("alarmPhase");
            String subject = intent.getStringExtra("alarmSubject");
            long duration = intent.getLongExtra("alarmDuration", 0);
            Log.d(TAG, "handleNotificationIntent: openAlarm=true received (mode=" + mode + ", phase=" + phase + ")");
            applyAlarmWindowFlags();
            dispatchOpenAlarm(mode, phase, subject, duration);
        }
    }

    public void applyImmersiveMode(boolean enable) {
        isImmersiveFullscreen = enable;
        runOnUiThread(() -> {
            WindowInsetsControllerCompat insetsController =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (insetsController != null) {
                if (enable) {
                    // Hide both the top status bar (clock/battery) and bottom gesture/navigation bar
                    insetsController.hide(WindowInsetsCompat.Type.systemBars());
                    insetsController.setSystemBarsBehavior(
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    );
                } else {
                    // Restore both bars
                    insetsController.show(WindowInsetsCompat.Type.systemBars());
                }
            }

            // Robust fallback for vendor skins
            if (enable) {
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                );
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                );
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && isImmersiveFullscreen) {
            applyImmersiveMode(true);
        }
    }
}
