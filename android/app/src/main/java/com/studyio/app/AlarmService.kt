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
import android.media.AudioFocusRequest
import android.media.AudioManager
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
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AlarmService : Service() {

    companion object {
        const val TAG = "StudyAlarm"
        const val CHANNEL_ID_ALARM = "timer_alarm"
        const val NOTIFICATION_ID_ALARM = 2001
        const val NOTIFICATION_ID_MISSED = 2002

        const val ACTION_START_ALARM = "com.studyio.app.ACTION_START_ALARM"
        const val ACTION_STOP_ALARM = "com.studyio.app.ACTION_STOP_ALARM"

        @Volatile
        var isRinging = false
            private set

        @Volatile
        var alarmStartedAtMs = 0L
            private set

        @Volatile
        var alarmMode = "countdown"
            private set

        @Volatile
        var alarmPhase = "work"
            private set

        @Volatile
        var alarmSubject = ""
            private set

        @Volatile
        var alarmDurationSeconds = 0L
            private set

        fun stopAlarmService(context: Context) {
            Log.d(TAG, "stopAlarmService requested")
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
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var previousAlarmVolume: Int = -1
    private val handler = Handler(Looper.getMainLooper())

    private var volumeRampStep = 0
    private val volumeRampRunnable = object : Runnable {
        override fun run() {
            if (mediaPlayer == null || !isRinging) return
            volumeRampStep++
            // 15-second linear volume ramp from 0.35f to 1.0f (audible from start)
            val currentVol = Math.min(1.0f, 0.35f + (0.65f * (volumeRampStep / 15.0f)))
            try {
                mediaPlayer?.setVolume(currentVol, currentVol)
            } catch (_: Exception) {}
            if (volumeRampStep < 15) {
                handler.postDelayed(this, 1000L)
            }
        }
    }

    private val autoSilenceRunnable = Runnable {
        Log.d(TAG, "Alarm auto-silence triggered after 5 minutes (300s)")
        handleAutoSilence()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "AlarmService onCreate")
        audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        createAlarmNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            Log.d(TAG, "AlarmService onStartCommand: null intent, stopping")
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent.action == ACTION_STOP_ALARM) {
            Log.d(TAG, "AlarmService onStartCommand: ACTION_STOP_ALARM received")
            stopRingingAndRelease()
            stopSelf()
            return START_NOT_STICKY
        }

        if (!AlarmScheduler.isAlarmEnabled(this)) {
            Log.d(TAG, "AlarmService onStartCommand: alarm disabled by user setting, stopping immediately")
            stopRingingAndRelease()
            stopSelf()
            return START_NOT_STICKY
        }

        startRingingAlarm(intent)
        return START_NOT_STICKY
    }

    private fun startRingingAlarm(intent: Intent) {
        if (isRinging) {
            Log.d(TAG, "AlarmService is already ringing - ignoring duplicate start")
            return
        }
        isRinging = true
        alarmStartedAtMs = System.currentTimeMillis()

        alarmMode = intent.getStringExtra("mode") ?: "countdown"
        alarmPhase = intent.getStringExtra("phase") ?: "work"
        alarmSubject = intent.getStringExtra("subject") ?: ""
        alarmDurationSeconds = intent.getLongExtra("durationSeconds", 0L)

        Log.d(TAG, "startRingingAlarm: mode=$alarmMode, phase=$alarmPhase, subject=$alarmSubject, duration=$alarmDurationSeconds")

        // 1. Acquire partial wake lock with safety timeout (6 minutes)
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
            wakeLock = powerManager?.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "studyio:AlarmServiceWakeLock"
            )?.apply {
                acquire(6 * 60 * 1000L)
            }
            Log.d(TAG, "Acquired 6-minute partial wake lock for AlarmService")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire wake lock in AlarmService", e)
        }

        // 2. Build full-screen intent & notification
        val notification = buildAlarmNotification(alarmMode, alarmPhase, alarmSubject, alarmDurationSeconds)

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val fgsType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                } else {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                }
                startForeground(NOTIFICATION_ID_ALARM, notification, fgsType)
            } else {
                startForeground(NOTIFICATION_ID_ALARM, notification)
            }
            Log.d(TAG, "AlarmService startForeground posted successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to startForeground for AlarmService", e)
        }

        // 3. Elevate alarm stream volume if 0 and request audio focus
        ensureAudibleAlarmVolume()
        requestAlarmAudioFocus()

        // 4. Play audio on USAGE_ALARM stream with ramp
        startAlarmAudio()

        // 5. Start repeating vibration
        startAlarmVibration()

        // 6. Schedule 5-minute auto silence
        handler.postDelayed(autoSilenceRunnable, 300_000L)
    }

    private fun ensureAudibleAlarmVolume() {
        try {
            val am = audioManager ?: return
            val currentVol = am.getStreamVolume(AudioManager.STREAM_ALARM)
            val maxVol = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            Log.d(TAG, "Current STREAM_ALARM volume: $currentVol / $maxVol")

            // If volume is 0 or less than 50%, elevate to 70% of max
            if (currentVol < (maxVol * 0.5f).toInt()) {
                previousAlarmVolume = currentVol
                val targetVol = Math.max(1, (maxVol * 0.7f).toInt())
                am.setStreamVolume(AudioManager.STREAM_ALARM, targetVol, 0)
                Log.d(TAG, "Elevated STREAM_ALARM from $currentVol to $targetVol (will restore on stop)")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not adjust STREAM_ALARM volume", e)
        }
    }

    private fun restoreAlarmVolume() {
        try {
            if (previousAlarmVolume >= 0) {
                audioManager?.setStreamVolume(AudioManager.STREAM_ALARM, previousAlarmVolume, 0)
                Log.d(TAG, "Restored STREAM_ALARM to previous volume: $previousAlarmVolume")
                previousAlarmVolume = -1
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not restore STREAM_ALARM volume", e)
        }
    }

    private fun requestAlarmAudioFocus() {
        try {
            val am = audioManager ?: return
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val focusReq = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(audioAttributes)
                    .setAcceptsDelayedFocusGain(false)
                    .setOnAudioFocusChangeListener { focusChange ->
                        Log.d(TAG, "Alarm audio focus changed: $focusChange")
                    }
                    .build()
                audioFocusRequest = focusReq
                val res = am.requestAudioFocus(focusReq)
                Log.d(TAG, "Requested audio focus (API 26+): result=$res")
            } else {
                @Suppress("DEPRECATION")
                val res = am.requestAudioFocus(
                    null,
                    AudioManager.STREAM_ALARM,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
                )
                Log.d(TAG, "Requested audio focus (legacy): result=$res")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not request audio focus", e)
        }
    }

    private fun releaseAlarmAudioFocus() {
        try {
            val am = audioManager ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest?.let { am.abandonAudioFocusRequest(it) }
                audioFocusRequest = null
            } else {
                @Suppress("DEPRECATION")
                am.abandonAudioFocus(null)
            }
            Log.d(TAG, "Released audio focus")
        } catch (e: Exception) {
            Log.w(TAG, "Could not release audio focus", e)
        }
    }

    private fun buildAlarmNotification(
        mode: String,
        phase: String,
        subject: String,
        durationSeconds: Long
    ): Notification {
        val isBreak = mode == "pomodoro" && phase == "break"
        val title = if (isBreak) "Break Finished" else "Time's up"
        val content = if (subject.isNotBlank()) "Focus block finished: $subject" else "Your focus session is complete."

        val contentIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openAlarm", true)
            putExtra("alarmMode", mode)
            putExtra("alarmPhase", phase)
            putExtra("alarmSubject", subject)
            putExtra("alarmDuration", durationSeconds)
        }

        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)

        val contentPendingIntent = PendingIntent.getActivity(this, 3001, contentIntent, pendingFlags)

        // Action: Stop
        val stopIntent = Intent(this, AlarmActionReceiver::class.java).apply {
            action = AlarmActionReceiver.ACTION_ALARM_STOP
        }
        val stopPendingIntent = PendingIntent.getBroadcast(this, 3002, stopIntent, pendingFlags)

        return NotificationCompat.Builder(this, CHANNEL_ID_ALARM)
            .setSmallIcon(R.drawable.ic_stat_timer)
            .setContentTitle(title)
            .setContentText(content)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(contentPendingIntent)
            .addAction(0, "Stop", stopPendingIntent)
            .build()
    }

    private fun startAlarmAudio() {
        val soundUris = getAlarmSoundCandidates()
        var started = false

        for (uri in soundUris) {
            try {
                Log.d(TAG, "Attempting alarm audio playback with source: $uri")
                mediaPlayer?.release()
                mediaPlayer = MediaPlayer().apply {
                    setDataSource(this@AlarmService, uri)
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    isLooping = true
                    setVolume(0.35f, 0.35f) // audible from start
                    setOnErrorListener { _, what, extra ->
                        Log.e(TAG, "MediaPlayer error during playback: what=$what, extra=$extra, attempting fallback")
                        playFallbackRingtone()
                        true
                    }
                    prepare()
                    start()
                }
                started = true
                Log.d(TAG, "MediaPlayer successfully started playback with source: $uri")
                break
            } catch (e: Exception) {
                Log.w(TAG, "Failed to initialize MediaPlayer with source: $uri", e)
            }
        }

        if (!started) {
            Log.e(TAG, "All primary audio sources failed, attempting emergency fallback ringtone")
            playFallbackRingtone()
        }

        volumeRampStep = 0
        handler.postDelayed(volumeRampRunnable, 1000L)
    }

    private fun playFallbackRingtone() {
        try {
            val fallbackUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ?: Settings.System.DEFAULT_ALARM_ALERT_URI
            mediaPlayer?.release()
            mediaPlayer = MediaPlayer().apply {
                setDataSource(this@AlarmService, fallbackUri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                setVolume(0.5f, 0.5f)
                prepare()
                start()
            }
            Log.d(TAG, "Emergency fallback MediaPlayer started with: $fallbackUri")
        } catch (e: Exception) {
            Log.e(TAG, "Emergency fallback MediaPlayer also failed", e)
        }
    }

    private fun getAlarmSoundCandidates(): List<Uri> {
        val list = mutableListOf<Uri>()

        // 1. Bundled res/raw/alarm_sound
        val rawResId = resources.getIdentifier("alarm_sound", "raw", packageName)
        if (rawResId != 0) {
            list.add(Uri.parse("android.resource://$packageName/$rawResId"))
        }

        // 2. System default alarm
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)?.let { list.add(it) }

        // 3. System default notification
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)?.let { list.add(it) }

        // 4. System default ringtone
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)?.let { list.add(it) }

        // 5. Settings DEFAULT_ALARM_ALERT_URI
        list.add(Settings.System.DEFAULT_ALARM_ALERT_URI)

        return list
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
            Log.d(TAG, "Started repeating alarm vibration")
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
        Log.d(TAG, "stopRingingAndRelease called: halting sound, vibration, wake lock, and resetting state")
        isRinging = false
        alarmStartedAtMs = 0L
        handler.removeCallbacks(autoSilenceRunnable)
        handler.removeCallbacks(volumeRampRunnable)

        try {
            if (mediaPlayer != null) {
                if (mediaPlayer!!.isPlaying) {
                    mediaPlayer!!.stop()
                }
                mediaPlayer!!.release()
                mediaPlayer = null
                Log.d(TAG, "MediaPlayer stopped and released")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing MediaPlayer", e)
        }

        releaseAlarmAudioFocus()
        restoreAlarmVolume()

        try {
            vibrator?.cancel()
            vibrator = null
            Log.d(TAG, "Vibrator cancelled")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping vibrator", e)
        }

        try {
            if (wakeLock != null && wakeLock!!.isHeld) {
                wakeLock!!.release()
                wakeLock = null
                Log.d(TAG, "AlarmService partial wake lock released")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing wakeLock", e)
        }

        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        Log.d(TAG, "AlarmService onDestroy")
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
                setBypassDnd(true)
            }
            nm.createNotificationChannel(channel)
        }
    }
}
