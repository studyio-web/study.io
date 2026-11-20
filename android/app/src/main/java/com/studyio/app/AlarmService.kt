package com.studyio.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AlarmService : Service() {

    companion object {
        private const val TAG = "AlarmService"
        const val CHANNEL_ID_ALARM = "timer_alarm"
        const val NOTIFICATION_ID_ALARM = 2001
        const val NOTIFICATION_ID_MISSED = 2002

        const val ACTION_START_ALARM = "com.studyio.app.ACTION_START_ALARM"
        const val ACTION_STOP_ALARM = "com.studyio.app.ACTION_STOP_ALARM"

        @Volatile
        var isRinging = false
            private set

        fun stopAlarmService(context: Context) {
            val intent = Intent(context, AlarmService::class.java).apply {
                action = ACTION_STOP_ALARM
            }
            try {
                context.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error requesting AlarmService stop", e)
            }
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private val handler = Handler(Looper.getMainLooper())

    private var volumeRampStep = 0
    private val volumeRampRunnable = object : Runnable {
        override fun run() {
            if (mediaPlayer == null || !isRinging) return
            volumeRampStep++
            // 20-second linear volume ramp from 0.05 to 1.0f
            val currentVol = Math.min(1.0f, 0.05f + (0.95f * (volumeRampStep / 20.0f)))
            try {
                mediaPlayer?.setVolume(currentVol, currentVol)
            } catch (e: Exception) {
                // ignore
            }
            if (volumeRampStep < 20) {
                handler.postDelayed(this, 1000L)
            }
        }
    }

    private val autoSilenceRunnable = Runnable {
        Log.i(TAG, "Alarm auto-silence triggered after 5 minutes")
        handleAutoSilence()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createAlarmNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent.action == ACTION_STOP_ALARM) {
            stopRingingAndRelease()
            stopSelf()
            return START_NOT_STICKY
        }

        startRingingAlarm(intent)
        return START_NOT_STICKY
    }

    private fun startRingingAlarm(intent: Intent) {
        if (isRinging) {
            Log.w(TAG, "AlarmService is already ringing")
            return
        }
        isRinging = true

        val mode = intent.getStringExtra("mode") ?: "countdown"
        val phase = intent.getStringExtra("phase") ?: "work"
        val subject = intent.getStringExtra("subject") ?: ""
        val durationSeconds = intent.getLongExtra("durationSeconds", 0L)

        // 1. Acquire partial wake lock with safety timeout (6 minutes)
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
            wakeLock = powerManager?.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "studyio:AlarmServiceWakeLock"
            )?.apply {
                acquire(6 * 60 * 1000L)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire wake lock", e)
        }

        // 2. Build full-screen intent & notification
        val notification = buildAlarmNotification(mode, phase, subject, durationSeconds)

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID_ALARM,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } else {
                startForeground(NOTIFICATION_ID_ALARM, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to startForeground for AlarmService", e)
        }

        // 3. Play audio on USAGE_ALARM stream with 20s ramp
        startAlarmAudio()

        // 4. Start gentle repeating vibration
        startAlarmVibration()

        // 5. Schedule 5-minute auto silence
        handler.postDelayed(autoSilenceRunnable, 300_000L)
    }

    private fun buildAlarmNotification(
        mode: String,
        phase: String,
        subject: String,
        durationSeconds: Long
    ): Notification {
        val isBreak = mode == "pomodoro" && phase == "break"
        val title = if (isBreak) "Break Finished" else "Session Complete"
        val content = if (subject.isNotBlank()) "Focus block finished: $subject" else "Time is up! Your focus session is ready to save."

        val fullScreenIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openAlarm", true)
            putExtra("alarmMode", mode)
            putExtra("alarmPhase", phase)
            putExtra("alarmSubject", subject)
            putExtra("alarmDuration", durationSeconds)
        }

        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)

        val fullScreenPendingIntent = PendingIntent.getActivity(this, 3001, fullScreenIntent, pendingFlags)

        // Action: Stop
        val stopIntent = Intent(this, AlarmActionReceiver::class.java).apply {
            action = AlarmActionReceiver.ACTION_ALARM_STOP
        }
        val stopPendingIntent = PendingIntent.getBroadcast(this, 3002, stopIntent, pendingFlags)

        // Action: +5 min (Snooze)
        val snoozeIntent = Intent(this, AlarmActionReceiver::class.java).apply {
            action = AlarmActionReceiver.ACTION_ALARM_SNOOZE
        }
        val snoozePendingIntent = PendingIntent.getBroadcast(this, 3003, snoozeIntent, pendingFlags)

        // Action: Save
        val saveIntent = Intent(this, AlarmActionReceiver::class.java).apply {
            action = AlarmActionReceiver.ACTION_ALARM_SAVE
        }
        val savePendingIntent = PendingIntent.getBroadcast(this, 3004, saveIntent, pendingFlags)

        return NotificationCompat.Builder(this, CHANNEL_ID_ALARM)
            .setSmallIcon(R.drawable.ic_stat_timer)
            .setContentTitle(title)
            .setContentText(content)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .addAction(0, "Stop", stopPendingIntent)
            .addAction(0, "+5 min", snoozePendingIntent)
            .addAction(0, "Save", savePendingIntent)
            .build()
    }

    private fun startAlarmAudio() {
        try {
            val soundUri = resolveAlarmSoundUri()
            mediaPlayer = MediaPlayer().apply {
                setDataSource(this@AlarmService, soundUri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                setVolume(0.05f, 0.05f) // start gentle
                prepare()
                start()
            }
            volumeRampStep = 0
            handler.postDelayed(volumeRampRunnable, 1000L)
            Log.i(TAG, "Started alarm audio playback with 20s ramp on USAGE_ALARM stream")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting alarm audio MediaPlayer", e)
        }
    }

    private fun resolveAlarmSoundUri(): Uri {
        // 1. Check if user bundled custom sound in res/raw/alarm_sound
        val rawResId = resources.getIdentifier("alarm_sound", "raw", packageName)
        if (rawResId != 0) {
            return Uri.parse("android.resource://$packageName/$rawResId")
        }

        // 2. Fallback to system default alarm sound
        val defaultAlarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        if (defaultAlarm != null) {
            return defaultAlarm
        }

        // 3. Fallback to notification sound if no alarm sound exists
        return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            ?: Settings.System.DEFAULT_ALARM_ALERT_URI
    }

    private fun startAlarmVibration() {
        try {
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }

            val pattern = longArrayOf(0, 800, 1000, 800, 1000)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = VibrationEffect.createWaveform(pattern, 0)
                vibrator?.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error starting alarm vibration", e)
        }
    }

    private fun handleAutoSilence() {
        stopRingingAndRelease()

        // Post missed alarm notification on timer_alerts channel
        val timeStr = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date())
        val missedNotification = NotificationCompat.Builder(this, "timer_alerts")
            .setSmallIcon(R.drawable.ic_stat_timer)
            .setContentTitle("Missed Focus Countdown")
            .setContentText("Your countdown finished at $timeStr.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        nm?.notify(NOTIFICATION_ID_MISSED, missedNotification)

        stopSelf()
    }

    private fun stopRingingAndRelease() {
        isRinging = false
        handler.removeCallbacks(autoSilenceRunnable)
        handler.removeCallbacks(volumeRampRunnable)

        try {
            if (mediaPlayer != null) {
                if (mediaPlayer!!.isPlaying) {
                    mediaPlayer!!.stop()
                }
                mediaPlayer!!.release()
                mediaPlayer = null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing MediaPlayer", e)
        }

        try {
            vibrator?.cancel()
            vibrator = null
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping vibrator", e)
        }

        try {
            if (wakeLock != null && wakeLock!!.isHeld) {
                wakeLock!!.release()
                wakeLock = null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing wakeLock", e)
        }

        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (e: Exception) {
            // ignore
        }
    }

    override fun onDestroy() {
        stopRingingAndRelease()
        super.onDestroy()
    }

    private fun createAlarmNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java) ?: return
            val channel = NotificationChannel(
                CHANNEL_ID_ALARM,
                "Focus Session Alarm",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Full-screen alarm alerts when study countdown or pomodoro finishes"
                setSound(null, null) // Audio is managed directly by AlarmService MediaPlayer on USAGE_ALARM stream
                enableVibration(false) // Vibration managed directly by AlarmService Vibrator
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            nm.createNotificationChannel(channel)
        }
    }
}
