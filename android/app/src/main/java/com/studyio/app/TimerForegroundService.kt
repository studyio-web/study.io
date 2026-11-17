package com.studyio.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
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
                    context.startService(intent)
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

    override fun onCreate() {
        super.onCreate()
        instance = this
        isServiceRunning = true
        ensureNotificationChannels()
        Log.d(TAG, "TimerForegroundService created")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            Log.d(TAG, "onStartCommand with null intent (system restart). Cleaning up.")
            handleStop()
            return START_NOT_STICKY
        }

        val action = intent.action ?: ACTION_START
        Log.d(TAG, "onStartCommand action: $action")

        when (action) {
            ACTION_START -> {
                parseIntentExtras(intent)
                isRunning = true
                isPaused = false
                val notification = buildTimerNotification()
                startInForeground(notification)
                scheduleFinishCheckIfNeeded()
            }

            ACTION_UPDATE -> {
                parseIntentExtras(intent)
                if (isRunning && !isPaused) {
                    reanchorNotification()
                } else {
                    updateNotification()
                }
                scheduleFinishCheckIfNeeded()
            }

            ACTION_PAUSE -> {
                handlePause()
            }

            ACTION_RESUME -> {
                handleResume()
            }

            ACTION_STOP -> {
                handleStop()
                return START_NOT_STICKY
            }
        }

        return START_NOT_STICKY
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
        cancelScheduledFinishCheck()
        updateNotification()
        Log.d(TAG, "Timer paused at elapsed: $baseElapsedSeconds seconds")
    }

    private fun handleResume() {
        if (!isPaused) return
        startedAtMs = System.currentTimeMillis()
        isPaused = false
        updateNotification()
        scheduleFinishCheckIfNeeded()
        Log.d(TAG, "Timer resumed at base elapsed: $baseElapsedSeconds seconds")
    }

    private fun handleStop() {
        Log.d(TAG, "Stopping TimerForegroundService")
        cancelScheduledFinishCheck()
        isRunning = false
        isPaused = false
        isServiceRunning = false
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        val notificationManager = NotificationManagerCompat.from(this)
        notificationManager.cancel(NOTIFICATION_ID_RUNNING)
        notificationManager.cancel(NOTIFICATION_ID_FINISHED)
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
            .setColor(androidx.core.content.ContextCompat.getColor(this, R.color.colorPrimary))
            .setContentTitle(title)
            .setOngoing(isTimerActivelyRunning)
            .setAutoCancel(!isTimerActivelyRunning)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSilent(true)
            .setLocalOnly(true)

        if (subject.isNotBlank()) {
            builder.setSubText(subject)
        }

        // Tap content intent -> opens MainActivity on timer tab
        val contentIntent = createContentPendingIntent()
        builder.setContentIntent(contentIntent)

        // Delete intent -> catches Android 14 dismissal to recover notification
        val deleteIntent = createDeletePendingIntent()
        builder.setDeleteIntent(deleteIntent)

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

            builder.addAction(
                android.R.drawable.ic_media_play,
                "Resume",
                createActionPendingIntent(TimerNotificationReceiver.ACTION_TIMER_RESUME, 101)
            )
            builder.addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Stop",
                createActionPendingIntent(TimerNotificationReceiver.ACTION_TIMER_STOP, 102)
            )
        } else {
            // Running state: chronometer ON, Pause and Stop actions
            builder.setUsesChronometer(true)

            // Calculate the exact virtual session origin timestamp where elapsed time was 0
            val sessionOriginMs = startedAtMs - (baseElapsedSeconds * 1000L)

            if (mode == "stopwatch") {
                builder.setChronometerCountDown(false)
                builder.setWhen(sessionOriginMs)
                builder.setContentText("Focusing · In progress")
            } else {
                // Countdown or Pomodoro: count DOWN
                builder.setChronometerCountDown(true)
                val targetFinishMs = sessionOriginMs + (targetSeconds * 1000L)
                builder.setWhen(targetFinishMs)
                builder.setContentText(if (mode == "pomodoro") "Pomodoro timer active" else "Countdown active")
            }

            builder.addAction(
                android.R.drawable.ic_media_pause,
                "Pause",
                createActionPendingIntent(TimerNotificationReceiver.ACTION_TIMER_PAUSE, 103)
            )
            builder.addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Stop",
                createActionPendingIntent(TimerNotificationReceiver.ACTION_TIMER_STOP, 104)
            )
        }

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

        finishRunnable = Runnable {
            if (isRunning && !isPaused) {
                onTimerTargetReached()
            }
        }
        mainHandler.postDelayed(finishRunnable!!, delayMs)
    }

    private fun cancelScheduledFinishCheck() {
        finishRunnable?.let {
            mainHandler.removeCallbacks(it)
            finishRunnable = null
        }
    }

    private fun onTimerTargetReached() {
        Log.d(TAG, "Timer target reached: mode=$mode, phase=$phase")
        postFinishAlertNotification()

        if (mode == "pomodoro") {
            // Toggle phase
            phase = if (phase == "work") "break" else "work"
            targetSeconds = if (phase == "break") 300 else 1500 // default 5m / 25m unless updated
            baseElapsedSeconds = 0
            startedAtMs = System.currentTimeMillis()
            updateNotification()
            scheduleFinishCheckIfNeeded()
        }
    }

    private fun postFinishAlertNotification() {
        val title = when (mode) {
            "countdown" -> "Countdown Finished!"
            "pomodoro" -> if (phase == "work") "Focus session complete!" else "Break time is over!"
            else -> "Study Goal Reached!"
        }
        val body = when (mode) {
            "countdown" -> "Great focus session! Take a moment to record your notes."
            "pomodoro" -> if (phase == "work") "Time for a well-deserved break." else "Ready to jump back in?"
            else -> "Session complete."
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_ID_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_studyio)
            .setColor(androidx.core.content.ContextCompat.getColor(this, R.color.colorPrimary))
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(createContentPendingIntent())

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
        Log.d(TAG, "onTaskRemoved: app closed from recent menu. Removing notification and stopping service.")
        handleStop()
    }

    override fun onDestroy() {
        super.onDestroy()
        cancelScheduledFinishCheck()
        instance = null
        isServiceRunning = false
        Log.d(TAG, "TimerForegroundService destroyed")
    }
}
