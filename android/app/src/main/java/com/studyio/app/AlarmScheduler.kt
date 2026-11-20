package com.studyio.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.util.Log

data class PendingAlarmData(
    val id: String,
    val triggerAtMs: Long,
    val label: String,
    val mode: String,
    val phase: String,
    val subject: String,
    val durationSeconds: Long
)

object AlarmScheduler {
    private const val TAG = "StudyAlarm"
    private const val PREFS_NAME = "studyio_alarm_prefs"
    private const val KEY_ALARM_ID = "alarm_id"
    private const val KEY_TRIGGER_AT = "alarm_trigger_at"
    private const val KEY_LABEL = "alarm_label"
    private const val KEY_MODE = "alarm_mode"
    private const val KEY_PHASE = "alarm_phase"
    private const val KEY_SUBJECT = "alarm_subject"
    private const val KEY_DURATION = "alarm_duration"

    fun canScheduleExact(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            val can = alarmManager?.canScheduleExactAlarms() ?: false
            Log.d(TAG, "canScheduleExactAlarms check: $can")
            return can
        }
        return true
    }

    fun scheduleAlarm(
        context: Context,
        id: String,
        triggerAtMs: Long,
        label: String = "Session Complete",
        mode: String = "countdown",
        phase: String = "work",
        subject: String = "",
        durationSeconds: Long = 0
    ): Boolean {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager not available on this device")
            return false
        }

        // Cancel any existing pending alarm first (guarantees strictly only one pending alarm)
        cancelAlarm(context, id)

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = AlarmReceiver.ACTION_TRIGGER_ALARM
            putExtra("id", id)
            putExtra("label", label)
            putExtra("mode", mode)
            putExtra("phase", phase)
            putExtra("subject", subject)
            putExtra("durationSeconds", durationSeconds)
            putExtra("triggerAtMs", triggerAtMs)
        }

        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)

        val operation = PendingIntent.getBroadcast(context, 1001, intent, pendingFlags)

        // Show Intent for AlarmClockInfo: opens MainActivity directly on click in status bar/clock
        val showIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("tab", "timer")
        }
        val showOperation = PendingIntent.getActivity(context, 1002, showIntent, pendingFlags)

        try {
            val alarmClockInfo = AlarmManager.AlarmClockInfo(triggerAtMs, showOperation)
            alarmManager.setAlarmClock(alarmClockInfo, operation)
            val diffSec = (triggerAtMs - System.currentTimeMillis()) / 1000
            Log.d(TAG, "Scheduled AlarmClock for '$id' at $triggerAtMs (fires in ${diffSec}s, mode=$mode, phase=$phase)")

            // Persist to SharedPreferences for device reboot recovery
            savePendingAlarm(
                context,
                PendingAlarmData(
                    id = id,
                    triggerAtMs = triggerAtMs,
                    label = label,
                    mode = mode,
                    phase = phase,
                    subject = subject,
                    durationSeconds = durationSeconds
                )
            )
            return true
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException scheduling exact alarm. Permission missing.", e)
            return false
        } catch (e: Exception) {
            Log.e(TAG, "Error scheduling alarm clock", e)
            return false
        }
    }

    fun triggerAlarmNow(
        context: Context,
        id: String = "immediate_alarm",
        label: String = "Session Complete",
        mode: String = "countdown",
        phase: String = "work",
        subject: String = "",
        durationSeconds: Long = 0
    ) {
        Log.d(TAG, "triggerAlarmNow requested: starting AlarmService immediately (mode=$mode, phase=$phase)")
        val intent = Intent(context, AlarmService::class.java).apply {
            action = AlarmService.ACTION_START_ALARM
            putExtra("id", id)
            putExtra("label", label)
            putExtra("mode", mode)
            putExtra("phase", phase)
            putExtra("subject", subject)
            putExtra("durationSeconds", durationSeconds)
            putExtra("triggerAtMs", System.currentTimeMillis())
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start AlarmService in triggerAlarmNow", e)
        }
    }

    fun cancelAlarm(context: Context, id: String? = null) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = AlarmReceiver.ACTION_TRIGGER_ALARM
        }
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        val operation = PendingIntent.getBroadcast(context, 1001, intent, pendingFlags)

        if (alarmManager != null && operation != null) {
            alarmManager.cancel(operation)
            operation.cancel()
            Log.i(TAG, "Canceled pending AlarmClock")
        }
        clearPendingAlarm(context)
    }

    fun savePendingAlarm(context: Context, data: PendingAlarmData) {
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString(KEY_ALARM_ID, data.id)
            putLong(KEY_TRIGGER_AT, data.triggerAtMs)
            putString(KEY_LABEL, data.label)
            putString(KEY_MODE, data.mode)
            putString(KEY_PHASE, data.phase)
            putString(KEY_SUBJECT, data.subject)
            putLong(KEY_DURATION, data.durationSeconds)
            apply()
        }
    }

    fun getPendingAlarm(context: Context): PendingAlarmData? {
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val id = prefs.getString(KEY_ALARM_ID, null) ?: return null
        val triggerAt = prefs.getLong(KEY_TRIGGER_AT, 0L)
        if (triggerAt <= 0L) return null

        return PendingAlarmData(
            id = id,
            triggerAtMs = triggerAt,
            label = prefs.getString(KEY_LABEL, "Session Complete") ?: "Session Complete",
            mode = prefs.getString(KEY_MODE, "countdown") ?: "countdown",
            phase = prefs.getString(KEY_PHASE, "work") ?: "work",
            subject = prefs.getString(KEY_SUBJECT, "") ?: "",
            durationSeconds = prefs.getLong(KEY_DURATION, 0L)
        )
    }

    fun clearPendingAlarm(context: Context) {
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().clear().apply()
    }
}
