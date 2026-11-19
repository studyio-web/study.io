package com.studyio.app

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat

class TimerForegroundService : Service() {

    companion object {
        private const val TAG = "TimerForegroundService"
        const val CHANNEL_ID_RUNNING = "timer_running"
        const val CHANNEL_ID_ALERTS = "timer_alerts"
        const val NOTIFICATION_ID_RUNNING = 1001
        const val NOTIFICATION_ID_FINISHED = 1002

        const val ACTION_START = "com.studyio.app.ACTION_TIMER_START"
        const val ACTION_UPDATE = "com.studyio.app.ACTION_TIMER_UPDATE"
        const val ACTION_PAUSE = "com.studyio.app.ACTION_TIMER_PAUSE"
        const val ACTION_RESUME = "com.studyio.app.ACTION_TIMER_RESUME"
        const val ACTION_STOP = "com.studyio.app.ACTION_TIMER_STOP"
        const val ACTION_ALARM_TARGET_REACHED = "com.studyio.app.ACTION_ALARM_TARGET_REACHED"

        const val EXTRA_MODE = "mode" // "stopwatch" | "countdown" | "pomodoro"
        const val EXTRA_PHASE = "phase" // "work" | "break"
        const val EXTRA_START_TIME = "startTime" // epoch ms
        const val EXTRA_ELAPSED_SECONDS = "elapsedSeconds" // int
        const val EXTRA_TARGET_SECONDS = "targetSeconds" // int
        const val EXTRA_SUBJECT = "subject" // string

        @Volatile
        var isServiceRunning = false
            private set

        @Volatile
        private var instance: TimerForegroundService? = null

        fun onTargetReachedDirect(context: Context) {
            val inst = instance
            if (inst != null) {
                inst.onTimerTargetReached()
            } else {
                val intent = Intent(context, TimerForegroundService::class.java).apply {
                    action = ACTION_ALARM_TARGET_REACHED
                }
                try {
                    context.startService(intent)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to startService with ACTION_ALARM_TARGET_REACHED", e)
                }
            }
        }

        fun pauseDirect(context: Context) {
            val inst = instance
            if (inst != null && inst.isRunning && !inst.isPaused) {
                inst.handlePause()
            } else {
                val intent = Intent(context, TimerForegroundService::class.java).apply {
                    action = ACTION_PAUSE
                }
                try {
                    context.startService(intent)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to startService with ACTION_PAUSE", e)
                }
            }
        }

        fun resumeDirect(context: Context) {
            val inst = instance
            if (inst != null && inst.isPaused) {
                inst.handleResume()
            } else {
                val intent = Intent(context, TimerForegroundService::class.java).apply {
                    action = ACTION_RESUME
                }
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(intent)
                    } else {
                        context.startService(intent)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to startService with ACTION_RESUME", e)
                }
            }
        }

        fun stopDirect(context: Context) {
            val inst = instance
            if (inst != null) {
                inst.handleStop()
            } else {
                val intent = Intent(context, TimerForegroundService::class.java).apply {
                    action = ACTION_STOP
                }
                try {
                    context.stopService(intent)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to stopService with ACTION_STOP", e)
                }
            }
        }

        fun updateStrictConfig(context: Context, enabled: Boolean, allowedPackages: Set<String>, isUltra: Boolean = false, uninstallProtection: Boolean = true) {
            val inst = instance
            if (inst != null) {
                inst.isStrictActive = enabled
                inst.isUltraStrict = isUltra
                inst.isUninstallProtection = uninstallProtection
                inst.strictAllowedPackages = allowedPackages
                if (enabled && (inst.isRunning || inst.isPaused)) {
                    inst.startStrictMonitoring()
                } else if (!enabled) {
                    inst.stopStrictMonitoring()
                }
                Log.d(TAG, "updateStrictConfig live: enabled=$enabled, ultra=$isUltra, uninstallProt=$uninstallProtection, allowedCount=${allowedPackages.size}")
            }
        }

        fun recoverNotification(context: Context) {
            val inst = instance
            if (inst != null && isServiceRunning && inst.isRunning && !inst.isPaused) {
                Log.d(TAG, "Re-anchoring dismissed notification for active running timer...")
                inst.reanchorNotification()
            } else if (isServiceRunning) {
                val intent = Intent(context, TimerForegroundService::class.java).apply {
                    action = ACTION_UPDATE
                }
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(intent)
                    } else {
                        context.startService(intent)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to startForegroundService in recoverNotification", e)
                }
            }
        }
    }

    private var mode: String = "stopwatch"
    private var phase: String = "work"
    private var isRunning: Boolean = false
    private var isPaused: Boolean = false
    private var startedAtMs: Long = 0L
    private var baseElapsedSeconds: Int = 0
    private var targetSeconds: Int = 0
    private var subject: String = ""

    private val mainHandler = Handler(Looper.getMainLooper())
    private var finishRunnable: Runnable? = null
    private var wakeLock: PowerManager.WakeLock? = null

    @Volatile
    private var isStrictActive: Boolean = false
    @Volatile
    private var isUltraStrict: Boolean = false
    @Volatile
    private var isUninstallProtection: Boolean = true
    @Volatile
    private var strictAllowedPackages: Set<String> = emptySet()
    private val strictHandler = Handler(Looper.getMainLooper())
    private var isStrictMonitoringRunning = false
    private var lastBlockedLaunchTime = 0L

    private val strictRunnable = object : Runnable {
        override fun run() {
            if ((isRunning || isPaused) && isStrictActive) {
                checkAndEnforceStrictMode()
                strictHandler.postDelayed(this, 350)
            } else {
                isStrictMonitoringRunning = false
            }
        }
    }

    private fun reloadStrictConfig() {
        try {
            val strictPrefs = getSharedPreferences("studyio_strict_prefs", Context.MODE_PRIVATE)
            isStrictActive = strictPrefs.getBoolean("enabled", false)
            isUltraStrict = strictPrefs.getBoolean("is_ultra", false)
            isUninstallProtection = strictPrefs.getBoolean("uninstall_protection", true)
            strictAllowedPackages = strictPrefs.getStringSet("allowed_packages", emptySet()) ?: emptySet()
            Log.d(TAG, "Reloaded strict config: enabled=$isStrictActive, ultra=$isUltraStrict, uninstallProt=$isUninstallProtection, allowedCount=${strictAllowedPackages.size}")
        } catch (e: Exception) {
            Log.w(TAG, "Failed reading studyio_strict_prefs", e)
        }
    }

    private fun startStrictMonitoring() {
        reloadStrictConfig()
        if (!isStrictMonitoringRunning && isStrictActive && (isRunning || isPaused)) {
            isStrictMonitoringRunning = true
            strictHandler.removeCallbacks(strictRunnable)
            strictHandler.post(strictRunnable)
            Log.d(TAG, "Started Strict Mode continuous app enforcement loop")
        }
    }

    private fun stopStrictMonitoring() {
        isStrictMonitoringRunning = false
        strictHandler.removeCallbacks(strictRunnable)
        Log.d(TAG, "Stopped Strict Mode continuous app enforcement loop")
    }

    private fun checkAndEnforceStrictMode() {
        if ((!isRunning && !isPaused) || !isStrictActive) return
        if (BlockedAppActivity.isVisible) return
        val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return

        val endTime = System.currentTimeMillis()
        val startTime = endTime - 1000 * 8 // Look back 8 seconds

        var currentPkg: String? = null
        var lastTime: Long = 0

        val events = usageStatsManager.queryEvents(startTime, endTime)
        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val pkg = event.packageName ?: continue
            val type = event.eventType

            // Do not let BlockedAppActivity mask the underlying blocked app
            if (pkg == packageName && event.className?.contains("BlockedAppActivity") == true) {
                continue
            }

            if (type == UsageEvents.Event.ACTIVITY_RESUMED ||
                type == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                if (event.timeStamp >= lastTime) {
                    currentPkg = pkg
                    lastTime = event.timeStamp
                }
            }
        }

        if (currentPkg == null) {
            val stats = usageStatsManager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, endTime)
            val recent = stats?.filter { it.packageName != packageName }?.maxByOrNull { it.lastTimeUsed }
            if (recent != null && (endTime - recent.lastTimeUsed) < 8000) {
                currentPkg = recent.packageName
            }
        }

        if (currentPkg == null) return
        if (currentPkg == packageName || isLauncherOrSystem(currentPkg)) return

        // UNINSTALL & TURN-OFF PROTECTION in Ultra Strict Mode:
        // When in Ultra Strict Mode, Settings, Package Installers, Play Store, and OEM Safecenters
        // are NEVER permitted even if somehow whitelisted!
        val isUninstallShieldViolation = isUltraStrict && isUninstallProtection && isSettingsOrAppManager(currentPkg)
        val isBlocked = isUninstallShieldViolation || !strictAllowedPackages.contains(currentPkg)

        if (isBlocked) {
            val now = System.currentTimeMillis()
            if (now - lastBlockedLaunchTime < 450) return
            lastBlockedLaunchTime = now

            val appName = if (isUninstallShieldViolation) {
                "Settings & App Management"
            } else {
                try {
                    val pm = packageManager
                    val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        pm.getApplicationInfo(currentPkg, PackageManager.ApplicationInfoFlags.of(0))
                    } else {
                        pm.getApplicationInfo(currentPkg, 0)
                    }
                    pm.getApplicationLabel(info).toString()
                } catch (e: Exception) {
                    currentPkg
                }
            }

            Log.w(TAG, "Strict Mode Violation: BLOCKING $currentPkg ($appName), ultra=$isUltraStrict, uninstallShield=$isUninstallShieldViolation")

            val blockIntent = Intent(this, BlockedAppActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_NO_ANIMATION or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra(BlockedAppActivity.EXTRA_BLOCKED_PACKAGE, currentPkg)
                putExtra(BlockedAppActivity.EXTRA_BLOCKED_NAME, appName)
                putExtra(BlockedAppActivity.EXTRA_IS_ULTRA, isUltraStrict)
                putExtra(BlockedAppActivity.EXTRA_IS_SETTINGS_OR_UNINSTALL, isUninstallShieldViolation)
            }

            try {
                startActivity(blockIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed startActivity from service, triggering fullScreenIntent fallback", e)
                try {
                    val pendingIntent = PendingIntent.getActivity(
                        this,
                        9999,
                        blockIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    val notif = NotificationCompat.Builder(this, CHANNEL_ID_ALERTS)
                        .setSmallIcon(R.drawable.ic_stat_studyio)
                        .setColor(androidx.core.content.ContextCompat.getColor(this, R.color.colorNotification))
                        .setContentTitle("Blocked by Study.io")
                        .setContentText("$appName is blocked during Strict Mode")
                        .setPriority(NotificationCompat.PRIORITY_MAX)
                        .setCategory(NotificationCompat.CATEGORY_ALARM)
                        .setFullScreenIntent(pendingIntent, true)
                        .setAutoCancel(true)
                        .build()
                    NotificationManagerCompat.from(this).notify(9999, notif)
                } catch (e2: Exception) {
                    Log.e(TAG, "Failed fullScreenIntent fallback", e2)
                }
            }
        }
    }

    private fun isLauncherOrSystem(pkgName: String): Boolean {
        if (pkgName == packageName) return true
        if (pkgName == "android" || pkgName == "com.android.systemui") return true

        try {
            val intent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
            }
            val resolveInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageManager.resolveActivity(intent, PackageManager.ResolveInfoFlags.of(0))
            } else {
                packageManager.resolveActivity(intent, 0)
            }
            val homePkg = resolveInfo?.activityInfo?.packageName
            if (homePkg != null && homePkg == pkgName) {
                return true
            }
        } catch (e: Exception) {
            // Ignore
        }

        val lower = pkgName.lowercase()
        return lower.startsWith("com.android.launcher") ||
                lower.contains("nexuslauncher") ||
                lower.contains("quickstep") ||
                lower.contains("miui.home") ||
                lower.contains("sec.android.app.launcher") ||
                lower.contains("huawei.android.launcher") ||
                lower.contains("oppo.launcher") ||
                lower.contains("oneplus.launcher")
    }

    private fun isSettingsOrAppManager(pkgName: String): Boolean {
        val lower = pkgName.lowercase()
        return lower == "com.android.settings" ||
                lower == "com.android.vending" ||
                lower.contains("packageinstaller") ||
                lower.contains("safecenter") ||
                lower.contains("securitycenter") ||
                lower.contains("systemmanager")
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
                wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "StudyIO:TimerWakeLock")?.apply {
                    setReferenceCounted(false)
                }
            }
            if (wakeLock?.isHeld == false) {
                wakeLock?.acquire(24 * 60 * 60 * 1000L) // 24-hour safeguard cap
                Log.d(TAG, "Acquired PARTIAL_WAKE_LOCK for timer persistence")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to acquire PARTIAL_WAKE_LOCK", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.d(TAG, "Released PARTIAL_WAKE_LOCK")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to release PARTIAL_WAKE_LOCK", e)
        }
    }

    private fun savePersistedState() {
        try {
            val prefs = getSharedPreferences("studyio_timer_prefs", Context.MODE_PRIVATE)
            prefs.edit().apply {
                putBoolean("is_running", isRunning)
                putBoolean("is_paused", isPaused)
                putString("mode", mode)
                putString("phase", phase)
                putLong("start_time", startedAtMs)
                putInt("elapsed_seconds", baseElapsedSeconds)
                putInt("target_seconds", targetSeconds)
                putString("subject", subject)
                apply()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to savePersistedState", e)
        }
    }

    private fun clearPersistedState() {
        try {
            val prefs = getSharedPreferences("studyio_timer_prefs", Context.MODE_PRIVATE)
            prefs.edit().clear().apply()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to clearPersistedState", e)
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        isServiceRunning = true
        ensureNotificationChannels()

        try {
            val strictPrefs = getSharedPreferences("studyio_strict_prefs", Context.MODE_PRIVATE)
            isStrictActive = strictPrefs.getBoolean("enabled", false)
            isUltraStrict = strictPrefs.getBoolean("is_ultra", false)
            strictAllowedPackages = strictPrefs.getStringSet("allowed_packages", emptySet()) ?: emptySet()
        } catch (e: Exception) {
            Log.w(TAG, "Failed reading studyio_strict_prefs on create", e)
        }

        Log.d(TAG, "TimerForegroundService created (isStrictActive=$isStrictActive, allowedCount=${strictAllowedPackages.size})")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            Log.d(TAG, "onStartCommand with null intent (system restart). Checking persisted state...")
            val prefs = getSharedPreferences("studyio_timer_prefs", Context.MODE_PRIVATE)
            val wasRunning = prefs.getBoolean("is_running", false)
            if (wasRunning) {
                isRunning = true
                isPaused = prefs.getBoolean("is_paused", false)
                mode = prefs.getString("mode", "stopwatch") ?: "stopwatch"
                phase = prefs.getString("phase", "work") ?: "work"
                startedAtMs = prefs.getLong("start_time", System.currentTimeMillis())
                baseElapsedSeconds = prefs.getInt("elapsed_seconds", 0)
                targetSeconds = prefs.getInt("target_seconds", 0)
                subject = prefs.getString("subject", "") ?: ""

                val notification = buildTimerNotification()
                startInForeground(notification)
                if (!isPaused) {
                    acquireWakeLock()
                    scheduleFinishCheckIfNeeded()
                    startStrictMonitoring()
                } else if (isStrictActive) {
                    acquireWakeLock()
                    startStrictMonitoring()
                }
                return START_STICKY
            } else {
                handleStop()
                return START_NOT_STICKY
            }
        }

        val action = intent.action ?: ACTION_START
        Log.d(TAG, "onStartCommand action: $action")

        when (action) {
            ACTION_START -> {
                parseIntentExtras(intent)
                isRunning = true
                isPaused = false
                acquireWakeLock()
                savePersistedState()
                val notification = buildTimerNotification()
                startInForeground(notification)
                scheduleFinishCheckIfNeeded()
                startStrictMonitoring()
            }

            ACTION_UPDATE -> {
                parseIntentExtras(intent)
                savePersistedState()
                if (isRunning && !isPaused) {
                    acquireWakeLock()
                    reanchorNotification()
                } else {
                    updateNotification()
                }
                scheduleFinishCheckIfNeeded()
            }

            ACTION_PAUSE -> {
                if (!isUltraStrict) {
                    handlePause()
                } else {
                    Log.w(TAG, "Pause rejected: Ultra Strict Mode active")
                }
            }

            ACTION_RESUME -> {
                handleResume()
            }

            ACTION_STOP -> {
                if (!isUltraStrict) {
                    handleStop()
                    return START_NOT_STICKY
                } else {
                    Log.w(TAG, "Stop rejected: Ultra Strict Mode active until timer ends")
                }
            }

            ACTION_ALARM_TARGET_REACHED -> {
                Log.d(TAG, "onStartCommand: ACTION_ALARM_TARGET_REACHED received from exact wake alarm")
                onTimerTargetReached()
            }
        }

        return START_STICKY
    }

    private fun parseIntentExtras(intent: Intent?) {
        if (intent == null) return
        if (intent.hasExtra(EXTRA_MODE)) {
            mode = intent.getStringExtra(EXTRA_MODE) ?: "stopwatch"
        }
        if (intent.hasExtra(EXTRA_PHASE)) {
            phase = intent.getStringExtra(EXTRA_PHASE) ?: "work"
        }
        if (intent.hasExtra(EXTRA_START_TIME)) {
            startedAtMs = intent.getLongExtra(EXTRA_START_TIME, System.currentTimeMillis())
        } else if (startedAtMs == 0L) {
            startedAtMs = System.currentTimeMillis()
        }
        if (intent.hasExtra(EXTRA_ELAPSED_SECONDS)) {
            baseElapsedSeconds = intent.getIntExtra(EXTRA_ELAPSED_SECONDS, 0)
        }
        if (intent.hasExtra(EXTRA_TARGET_SECONDS)) {
            targetSeconds = intent.getIntExtra(EXTRA_TARGET_SECONDS, 0)
        }
        if (intent.hasExtra(EXTRA_SUBJECT)) {
            subject = intent.getStringExtra(EXTRA_SUBJECT) ?: ""
        }
    }

    private fun handlePause() {
        if (!isRunning || isPaused) return
        // Calculate current elapsed up to pause moment
        val runDeltaSeconds = ((System.currentTimeMillis() - startedAtMs) / 1000L).coerceAtLeast(0L).toInt()
        baseElapsedSeconds += runDeltaSeconds
        isPaused = true
        if (!isStrictActive) {
            releaseWakeLock()
        }
        cancelScheduledFinishCheck()
        // Strict Mode remains actively enforced during pause until the timer is explicitly stopped
        if (isStrictActive) {
            startStrictMonitoring()
        }
        savePersistedState()

        if (mode == "countdown" && targetSeconds > 0 && baseElapsedSeconds >= targetSeconds) {
            Log.d(TAG, "Countdown already completed on pause. Terminating running notification.")
            handleStop()
            return
        }

        updateNotification()
        Log.d(TAG, "Timer paused at elapsed: $baseElapsedSeconds seconds")
    }

    private fun handleResume() {
        if (mode == "countdown" && targetSeconds > 0 && baseElapsedSeconds >= targetSeconds) {
            Log.w(TAG, "Resume rejected: Countdown already completed")
            return
        }

        val prefs = getSharedPreferences("studyio_timer_prefs", Context.MODE_PRIVATE)
        if (!isRunning && prefs.getBoolean("is_running", false)) {
            mode = prefs.getString("mode", "stopwatch") ?: "stopwatch"
            phase = prefs.getString("phase", "work") ?: "work"
            startedAtMs = prefs.getLong("start_time", System.currentTimeMillis())
            baseElapsedSeconds = prefs.getInt("elapsed_seconds", 0)
            targetSeconds = prefs.getInt("target_seconds", 0)
            subject = prefs.getString("subject", "") ?: ""
        }

        try {
            val strictPrefs = getSharedPreferences("studyio_strict_prefs", Context.MODE_PRIVATE)
            isStrictActive = strictPrefs.getBoolean("enabled", false)
            strictAllowedPackages = strictPrefs.getStringSet("allowed_packages", emptySet()) ?: emptySet()
        } catch (e: Exception) {
            Log.w(TAG, "Failed reading studyio_strict_prefs on resume", e)
        }
        startedAtMs = System.currentTimeMillis()
        isRunning = true
        isPaused = false
        acquireWakeLock()
        savePersistedState()
        val notification = buildTimerNotification()
        startInForeground(notification)
        scheduleFinishCheckIfNeeded()
        startStrictMonitoring()
        Log.d(TAG, "Timer resumed at base elapsed: $baseElapsedSeconds seconds")
    }

    private fun handleStop() {
        Log.d(TAG, "Stopping TimerForegroundService")
        cancelScheduledFinishCheck()
        releaseWakeLock()
        stopStrictMonitoring()
        clearPersistedState()
        isRunning = false
        isPaused = false
        isServiceRunning = false
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        val notificationManager = NotificationManagerCompat.from(this)
        notificationManager.cancel(NOTIFICATION_ID_RUNNING)
        stopSelf()
    }

    private fun startInForeground(notification: Notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                ServiceCompat.startForeground(
                    this,
                    NOTIFICATION_ID_RUNNING,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } else {
                startForeground(NOTIFICATION_ID_RUNNING, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to startForeground: ", e)
            val notificationManager = NotificationManagerCompat.from(this)
            notificationManager.notify(NOTIFICATION_ID_RUNNING, notification)
        }
    }

    fun reanchorNotification() {
        if (!isRunning || isPaused) return
        val notification = buildTimerNotification()
        startInForeground(notification)
        try {
            val notificationManager = NotificationManagerCompat.from(this)
            notificationManager.notify(NOTIFICATION_ID_RUNNING, notification)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to notify in reanchorNotification", e)
        }
    }

    private fun updateNotification() {
        if (!isRunning && !isPaused) return
        val notification = buildTimerNotification()
        val notificationManager = NotificationManagerCompat.from(this)
        try {
            notificationManager.notify(NOTIFICATION_ID_RUNNING, notification)
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing notification permission to update notification", e)
        }
    }

    private fun buildTimerNotification(): Notification {
        val title = getNotificationTitle()
        val isTimerActivelyRunning = isRunning && !isPaused
        val builder = NotificationCompat.Builder(this, CHANNEL_ID_RUNNING)
            .setSmallIcon(R.drawable.ic_stat_studyio)
            .setColor(androidx.core.content.ContextCompat.getColor(this, R.color.colorNotification))
            .setContentTitle(title)
            .setOngoing(isRunning || isPaused)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSilent(true)
            .setLocalOnly(true)

        if (subject.isNotBlank()) {
            builder.setSubText(subject)
        }

        try {
            val largeIcon = android.graphics.BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher)
            if (largeIcon != null) {
                builder.setLargeIcon(largeIcon)
            }
        } catch (_: Exception) {}

        // Tap content intent -> opens MainActivity on timer tab
        val contentIntent = createContentPendingIntent()
        builder.setContentIntent(contentIntent)

        // Delete intent -> catches Android 14 dismissal to recover notification
        val deleteIntent = createDeletePendingIntent()
        builder.setDeleteIntent(deleteIntent)

        // Custom aesthetic RemoteViews for large, beautiful HUD timer display
        val collapsedView = RemoteViews(packageName, R.layout.notification_timer_collapsed)
        val expandedView = RemoteViews(packageName, R.layout.notification_timer_expanded)
        val subjectDisplay = if (subject.isNotBlank()) subject else "General Focus"

        if (isPaused) {
            // Paused state: static text, chronometer OFF, Resume and Stop actions
            builder.setUsesChronometer(false)
            val timeText = if (mode == "countdown" || mode == "pomodoro") {
                val rem = (targetSeconds - baseElapsedSeconds).coerceAtLeast(0)
                formatSeconds(rem)
            } else {
                formatSeconds(baseElapsedSeconds)
            }
            builder.setContentText("⏸ Paused · $timeText")

            // Configure collapsed RemoteViews (26sp bold static text)
            collapsedView.setViewVisibility(R.id.notif_timer_chronometer, View.GONE)
            collapsedView.setViewVisibility(R.id.notif_timer_static, View.VISIBLE)
            collapsedView.setTextViewText(R.id.notif_timer_static, timeText)
            collapsedView.setTextViewText(R.id.notif_status_tag, "PAUSED")
            collapsedView.setTextColor(R.id.notif_status_tag, Color.parseColor("#F59E0B"))
            collapsedView.setTextViewText(R.id.notif_subject_text, subjectDisplay)

            // Configure expanded RemoteViews (34sp bold static text)
            expandedView.setViewVisibility(R.id.notif_exp_timer_chronometer, View.GONE)
            expandedView.setViewVisibility(R.id.notif_exp_timer_static, View.VISIBLE)
            expandedView.setTextViewText(R.id.notif_exp_timer_static, timeText)
            expandedView.setTextViewText(R.id.notif_exp_status_tag, "SESSION PAUSED")
            expandedView.setTextColor(R.id.notif_exp_status_tag, Color.parseColor("#F59E0B"))
            expandedView.setTextViewText(R.id.notif_exp_subject_text, subjectDisplay)
            expandedView.setTextViewText(R.id.notif_exp_subtext, "Tap Resume to continue focusing")

            val isCountdownCompleted = (mode == "countdown" && targetSeconds > 0 && baseElapsedSeconds >= targetSeconds)
            if (!isCountdownCompleted) {
                builder.addAction(
                    android.R.drawable.ic_media_play,
                    "Resume",
                    createActionPendingIntent(TimerNotificationReceiver.ACTION_TIMER_RESUME, 101)
                )
            }
        } else {
            // Running state: chronometer ON, Pause action (Stop removed from all notifications)
            builder.setUsesChronometer(true)

            // Calculate the exact virtual session origin timestamp where elapsed time was 0
            val sessionOriginMs = startedAtMs - (baseElapsedSeconds * 1000L)
            val deltaMs = if (startedAtMs > 0L) (System.currentTimeMillis() - startedAtMs).coerceAtLeast(0L) else 0L

            val statusTagText = when {
                isUltraStrict -> "⚡ ULTRA STRICT"
                mode == "pomodoro" -> if (phase == "work") "DEEP FOCUS" else "SHORT BREAK"
                mode == "countdown" -> "COUNTDOWN"
                else -> "FOCUSING"
            }
            val statusTagColor = when {
                isUltraStrict -> Color.parseColor("#10B981")
                phase == "break" -> Color.parseColor("#38BDF8")
                else -> Color.parseColor("#10B981")
            }

            if (mode == "stopwatch") {
                builder.setChronometerCountDown(false)
                builder.setWhen(sessionOriginMs)
                builder.setContentText("Focusing · In progress")

                // Elapsed time calculation for RemoteViews Chronometer base (SystemClock.elapsedRealtime reference)
                val totalElapsedMs = (baseElapsedSeconds * 1000L) + deltaMs
                val baseRealtime = SystemClock.elapsedRealtime() - totalElapsedMs

                // Collapsed Chronometer (26sp bold)
                collapsedView.setViewVisibility(R.id.notif_timer_chronometer, View.VISIBLE)
                collapsedView.setViewVisibility(R.id.notif_timer_static, View.GONE)
                collapsedView.setChronometer(R.id.notif_timer_chronometer, baseRealtime, "%s", true)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    collapsedView.setChronometerCountDown(R.id.notif_timer_chronometer, false)
                }

                // Expanded Chronometer (34sp bold)
                expandedView.setViewVisibility(R.id.notif_exp_timer_chronometer, View.VISIBLE)
                expandedView.setViewVisibility(R.id.notif_exp_timer_static, View.GONE)
                expandedView.setChronometer(R.id.notif_exp_timer_chronometer, baseRealtime, "%s", true)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    expandedView.setChronometerCountDown(R.id.notif_exp_timer_chronometer, false)
                }
                expandedView.setTextViewText(R.id.notif_exp_subtext, "Stopwatch Active · Keep studying")
            } else {
                // Countdown or Pomodoro: count DOWN
                builder.setChronometerCountDown(true)
                val targetFinishMs = sessionOriginMs + (targetSeconds * 1000L)
                builder.setWhen(targetFinishMs)
                builder.setContentText(if (mode == "pomodoro") "Pomodoro timer active" else "Countdown active")

                // Target remaining calculation for RemoteViews Chronometer
                val totalElapsedMs = (baseElapsedSeconds * 1000L) + deltaMs
                val remainingMs = ((targetSeconds * 1000L) - totalElapsedMs).coerceAtLeast(0L)
                val targetFinishRealtime = SystemClock.elapsedRealtime() + remainingMs

                if (remainingMs <= 0L) {
                    // Prevent countdown Chronometer from running down into negative numbers
                    collapsedView.setViewVisibility(R.id.notif_timer_chronometer, View.GONE)
                    collapsedView.setViewVisibility(R.id.notif_timer_static, View.VISIBLE)
                    collapsedView.setTextViewText(R.id.notif_timer_static, "00:00")

                    expandedView.setViewVisibility(R.id.notif_exp_timer_chronometer, View.GONE)
                    expandedView.setViewVisibility(R.id.notif_exp_timer_static, View.VISIBLE)
                    expandedView.setTextViewText(R.id.notif_exp_timer_static, "00:00")
                } else {
                    // Collapsed Countdown Chronometer (26sp bold)
                    collapsedView.setViewVisibility(R.id.notif_timer_chronometer, View.VISIBLE)
                    collapsedView.setViewVisibility(R.id.notif_timer_static, View.GONE)
                    collapsedView.setChronometer(R.id.notif_timer_chronometer, targetFinishRealtime, "%s", true)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        collapsedView.setChronometerCountDown(R.id.notif_timer_chronometer, true)
                    }

                    // Expanded Countdown Chronometer (34sp bold)
                    expandedView.setViewVisibility(R.id.notif_exp_timer_chronometer, View.VISIBLE)
                    expandedView.setViewVisibility(R.id.notif_exp_timer_static, View.GONE)
                    expandedView.setChronometer(R.id.notif_exp_timer_chronometer, targetFinishRealtime, "%s", true)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        expandedView.setChronometerCountDown(R.id.notif_exp_timer_chronometer, true)
                    }
                }
                expandedView.setTextViewText(
                    R.id.notif_exp_subtext,
                    if (mode == "pomodoro") "Pomodoro session · Target: ${formatSeconds(targetSeconds)}"
                    else "Countdown timer · Target: ${formatSeconds(targetSeconds)}"
                )
            }

            collapsedView.setTextViewText(R.id.notif_status_tag, statusTagText)
            collapsedView.setTextColor(R.id.notif_status_tag, statusTagColor)
            collapsedView.setTextViewText(R.id.notif_subject_text, subjectDisplay)

            expandedView.setTextViewText(R.id.notif_exp_status_tag, statusTagText)
            expandedView.setTextColor(R.id.notif_exp_status_tag, statusTagColor)
            expandedView.setTextViewText(R.id.notif_exp_subject_text, subjectDisplay)

            if (!isUltraStrict) {
                builder.addAction(
                    android.R.drawable.ic_media_pause,
                    "Pause",
                    createActionPendingIntent(TimerNotificationReceiver.ACTION_TIMER_PAUSE, 103)
                )
            }
        }

        // Apply DecoratedCustomViewStyle for system-integrated aesthetic custom layout
        builder
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(collapsedView)
            .setCustomBigContentView(expandedView)

        val notification = builder.build()
        if (isTimerActivelyRunning) {
            notification.flags = notification.flags or
                Notification.FLAG_ONGOING_EVENT or
                Notification.FLAG_NO_CLEAR or
                Notification.FLAG_FOREGROUND_SERVICE
        } else {
            notification.flags = notification.flags and (Notification.FLAG_ONGOING_EVENT or Notification.FLAG_NO_CLEAR).inv()
        }
        return notification
    }

    private fun getNotificationTitle(): String {
        return when (mode) {
            "stopwatch" -> if (isPaused) "Stopwatch (Paused)" else "Stopwatch"
            "countdown" -> if (isPaused) "Countdown (Paused)" else "Countdown"
            "pomodoro" -> {
                val phaseLabel = if (phase == "break") "Pomodoro: Break" else "Pomodoro: Focus"
                if (isPaused) "$phaseLabel (Paused)" else phaseLabel
            }
            else -> "Study Timer"
        }
    }

    private fun scheduleFinishCheckIfNeeded() {
        cancelScheduledFinishCheck()
        if (mode == "stopwatch" || targetSeconds <= 0 || isPaused || !isRunning) return

        val currentRunDeltaSeconds = if (isRunning && !isPaused && startedAtMs > 0L) {
            ((System.currentTimeMillis() - startedAtMs) / 1000L).coerceAtLeast(0L).toInt()
        } else {
            0
        }
        val totalElapsedSeconds = baseElapsedSeconds + currentRunDeltaSeconds
        val remainingSeconds = (targetSeconds - totalElapsedSeconds).coerceAtLeast(0)
        val delayMs = (remainingSeconds * 1000L)

        if (delayMs <= 0L) {
            onTimerTargetReached()
            return
        }

        // 1. In-app looper runnable
        finishRunnable = Runnable {
            if (isRunning && !isPaused) {
                onTimerTargetReached()
            }
        }
        mainHandler.postDelayed(finishRunnable!!, delayMs)

        // 2. Hardware AlarmManager RTC_WAKEUP (guarantees wakeup even when device screen is OFF / sleeping)
        try {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            val alarmIntent = Intent(this, TimerNotificationReceiver::class.java).apply {
                action = TimerNotificationReceiver.ACTION_TIMER_EXACT_FINISH
            }
            val pendingIntent = PendingIntent.getBroadcast(
                this,
                888,
                alarmIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val triggerAtMs = System.currentTimeMillis() + delayMs
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager?.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerAtMs,
                    pendingIntent
                )
            } else {
                alarmManager?.setExact(
                    AlarmManager.RTC_WAKEUP,
                    triggerAtMs,
                    pendingIntent
                )
            }
            Log.d(TAG, "Exact alarm scheduled with AlarmManager in ${delayMs / 1000}s (at $triggerAtMs)")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to schedule AlarmManager exact wakeup alarm", e)
        }
    }

    private fun cancelScheduledFinishCheck() {
        finishRunnable?.let {
            mainHandler.removeCallbacks(it)
            finishRunnable = null
        }
        try {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            val alarmIntent = Intent(this, TimerNotificationReceiver::class.java).apply {
                action = TimerNotificationReceiver.ACTION_TIMER_EXACT_FINISH
            }
            val pendingIntent = PendingIntent.getBroadcast(
                this,
                888,
                alarmIntent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )
            if (pendingIntent != null) {
                alarmManager?.cancel(pendingIntent)
                pendingIntent.cancel()
            }
        } catch (_: Exception) {}
    }

    private fun onTimerTargetReached() {
        Log.d(TAG, "Timer target reached: mode=$mode, phase=$phase, isUltra=$isUltraStrict")
        cancelScheduledFinishCheck()
        val wasUltra = isUltraStrict
        if (isUltraStrict) {
            isUltraStrict = false
            try {
                val strictPrefs = getSharedPreferences("studyio_strict_prefs", Context.MODE_PRIVATE)
                strictPrefs.edit().putBoolean("is_ultra", false).apply()
            } catch (e: Exception) {
                Log.w(TAG, "Failed clearing is_ultra on target reached", e)
            }
        }

        // Wake screen if phone screen is OFF / sleeping so lockscreen lights up with notification
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
            @Suppress("DEPRECATION")
            val screenWakeLock = pm?.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "StudyIO:CountdownFinishScreenWake"
            )
            screenWakeLock?.acquire(10000L) // Light up screen for 10s
        } catch (e: Exception) {
            Log.w(TAG, "Could not acquire screen wakeup lock", e)
        }

        postFinishAlertNotification(wasUltra)

        if (mode == "pomodoro") {
            // Toggle phase
            phase = if (phase == "work") "break" else "work"
            targetSeconds = if (phase == "break") 300 else 1500 // default 5m / 25m unless updated
            baseElapsedSeconds = 0
            startedAtMs = System.currentTimeMillis()
            updateNotification()
            scheduleFinishCheckIfNeeded()
        } else if (mode == "countdown") {
            Log.d(TAG, "Countdown completed: stopping ongoing foreground timer notification")
            baseElapsedSeconds = targetSeconds
            isPaused = true
            isRunning = false
            isServiceRunning = false
            cancelScheduledFinishCheck()
            releaseWakeLock()
            stopStrictMonitoring()
            clearPersistedState()
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            val notificationManager = NotificationManagerCompat.from(this)
            notificationManager.cancel(NOTIFICATION_ID_RUNNING)
            stopSelf()
        }
    }

    private fun postFinishAlertNotification(wasUltra: Boolean = false) {
        val title = when {
            wasUltra -> "⚡ Ultra Strict Completed!"
            mode == "countdown" -> "Countdown Finished!"
            mode == "pomodoro" -> if (phase == "work") "Focus session complete!" else "Break time is over!"
            else -> "Study Goal Reached!"
        }
        val body = when {
            wasUltra -> "Lockdown lifted! Return to Study.io to save your session."
            mode == "countdown" -> "Great focus session! Take a moment to record your notes."
            mode == "pomodoro" -> if (phase == "work") "Time for a well-deserved break." else "Ready to jump back in?"
            else -> "Session complete."
        }

        val alarmSound = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM)
            ?: android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION)

        val builder = NotificationCompat.Builder(this, CHANNEL_ID_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_studyio)
            .setColor(androidx.core.content.ContextCompat.getColor(this, R.color.colorNotification))
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(alarmSound)
            .setVibrate(longArrayOf(0, 500, 250, 500, 250, 1000))
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(createContentPendingIntent())
            .setFullScreenIntent(createContentPendingIntent(), true)

        try {
            val largeIcon = android.graphics.BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher)
            if (largeIcon != null) {
                builder.setLargeIcon(largeIcon)
            }
        } catch (_: Exception) {}

        val notificationManager = NotificationManagerCompat.from(this)
        try {
            notificationManager.notify(NOTIFICATION_ID_FINISHED, builder.build())
        } catch (e: SecurityException) {
            Log.e(TAG, "Cannot show finish alert notification", e)
        }
    }

    private fun createContentPendingIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_MAIN
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("tab", "timer")
        }
        return PendingIntent.getActivity(
            this,
            201,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun createDeletePendingIntent(): PendingIntent {
        val intent = Intent(this, TimerNotificationReceiver::class.java).apply {
            action = TimerNotificationReceiver.ACTION_NOTIFICATION_DELETED
            setPackage(packageName)
        }
        return PendingIntent.getBroadcast(
            this,
            202,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun createActionPendingIntent(action: String, requestCode: Int): PendingIntent {
        val intent = Intent(this, TimerNotificationReceiver::class.java).apply {
            this.action = action
            setPackage(packageName)
        }
        return PendingIntent.getBroadcast(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun formatSeconds(seconds: Int): String {
        val s = seconds.coerceAtLeast(0)
        val hrs = s / 3600
        val mins = (s % 3600) / 60
        val secs = s % 60
        return if (hrs > 0) {
            String.format("%d:%02d:%02d", hrs, mins, secs)
        } else {
            String.format("%02d:%02d", mins, secs)
        }
    }

    private fun ensureNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java) ?: return

            // Channel 1: timer_running (LOW importance, no beep on tick)
            val runningChannel = NotificationChannel(
                CHANNEL_ID_RUNNING,
                "Running Timer",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows live ongoing focus timer in the notification shade"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                enableVibration(false)
                setSound(null, null)
            }
            notificationManager.createNotificationChannel(runningChannel)

            // Channel 2: timer_alerts (HIGH importance, with sound & vibration)
            val alertsChannel = NotificationChannel(
                CHANNEL_ID_ALERTS,
                "Timer Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts when countdowns and Pomodoro phases complete"
                enableVibration(true)
                setShowBadge(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            notificationManager.createNotificationChannel(alertsChannel)
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.d(TAG, "onTaskRemoved: app closed from recent menu.")
        // If Strict Mode is actively running, DO NOT kill the service!
        // Keep the foreground service alive so users cannot bypass Strict Mode by swiping the app away.
        if (isStrictActive && (isRunning || isPaused)) {
            Log.i(TAG, "Strict Mode is active: keeping TimerForegroundService alive in background")
            acquireWakeLock()
            startStrictMonitoring()
        } else {
            handleStop()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cancelScheduledFinishCheck()
        releaseWakeLock()
        stopStrictMonitoring()
        instance = null
        isServiceRunning = false
        Log.d(TAG, "TimerForegroundService destroyed")
    }
}
