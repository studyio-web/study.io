package com.studyio.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.HapticFeedbackConstants;
import android.view.OrientationEventListener;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean isImmersiveFullscreen = false;
    private boolean hasManuallyExitedFullscreen = false;
    private OrientationEventListener orientationEventListener;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TimerNotificationPlugin.class);
        super.onCreate(savedInstanceState);

        // Lock default app orientation strictly to portrait on launch
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

        // Ensure social_nudges notification channel exists natively for FCM background delivery
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                NotificationChannel channel = new NotificationChannel(
                    "social_nudges",
                    "Study Room Nudges",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Alerts when other scholars nudge you in active study rooms");
                channel.enableVibration(true);
                channel.enableLights(true);
                channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(channel);
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
    public void onDestroy() {
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
