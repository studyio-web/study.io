package com.studyio.app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat

class BootReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }
        Log.i(TAG, "BootReceiver triggered by action: $action")

        val now = System.currentTimeMillis()

        // 1. Release expired Ultra Strict lockdown if ultra_ends_at passed while device was powered down
        try {
            val timerPrefs = context.getSharedPreferences("studyio_timer_prefs", Context.MODE_PRIVATE)
            val ultraEndsAt = timerPrefs.getLong("ultra_ends_at", 0L)
            val isRunning = timerPrefs.getBoolean("is_running", false)
            val isPaused = timerPrefs.getBoolean("is_paused", false)

            if (ultraEndsAt in 1..now || (isRunning && timerPrefs.getString("mode", "") == "countdown" && timerPrefs.getInt("target_seconds", 0) > 0 && timerPrefs.getLong("started_at", 0L) + timerPrefs.getInt("target_seconds", 0) * 1000L <= now)) {
                val strictPrefs = context.getSharedPreferences("studyio_strict_prefs", Context.MODE_PRIVATE)
                strictPrefs.edit().putBoolean("is_ultra", false).apply()
                timerPrefs.edit()
                    .putBoolean("is_running", false)
                    .putBoolean("is_paused", false)
                    .putLong("ultra_ends_at", 0L)
                    .apply()
                Log.i(TAG, "Released Ultra Strict lock on boot because lockdown period expired while powered off.")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error checking expired Ultra Strict lock on reboot", e)
        }

        // 2. Re-arm or notify for pending countdown alarm
        val pending = AlarmScheduler.getPendingAlarm(context) ?: return

        if (pending.triggerAtMs > now) {
            Log.i(TAG, "Re-scheduling pending countdown alarm after reboot: ${pending.id} at ${pending.triggerAtMs}")
            AlarmScheduler.scheduleAlarm(
                context = context,
                id = pending.id,
                triggerAtMs = pending.triggerAtMs,
                label = pending.label,
                mode = pending.mode,
                phase = pending.phase,
                subject = pending.subject,
                durationSeconds = pending.durationSeconds
            )
        } else {
            Log.i(TAG, "Alarm ${pending.id} expired while device was offline. Posting missed alarm notification.")
            AlarmScheduler.clearPendingAlarm(context)

            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            if (nm != null) {
                val missedNotif = NotificationCompat.Builder(context, "timer_alerts")
                    .setSmallIcon(R.drawable.ic_stat_timer)
                    .setContentTitle("Missed Focus Countdown")
                    .setContentText("Your countdown session finished while device was restarting.")
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .build()
                nm.notify(1005, missedNotif)
            }
        }
    }
}
