package com.studyio.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class TimerNotificationReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "TimerNotifReceiver"
        const val STILL_STUDYING_NOTIF_ID = 8890
        const val ACTION_TIMER_PAUSE = "com.studyio.app.ACTION_TIMER_PAUSE"
        const val ACTION_TIMER_RESUME = "com.studyio.app.ACTION_TIMER_RESUME"
        const val ACTION_TIMER_STOP = "com.studyio.app.ACTION_TIMER_STOP"
        const val ACTION_NOTIFICATION_DELETED = "com.studyio.app.ACTION_NOTIFICATION_DELETED"
        const val ACTION_TIMER_EXACT_FINISH = "com.studyio.app.ACTION_TIMER_EXACT_FINISH"
        const val ACTION_STILL_STUDYING_ALERT = "com.studyio.app.ACTION_STILL_STUDYING_ALERT"
        const val ACTION_CONFIRM_STILL_STUDYING = "com.studyio.app.ACTION_CONFIRM_STILL_STUDYING"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.d(TAG, "onReceive action: $action")

        when (action) {
            ACTION_STILL_STUDYING_ALERT -> {
                Log.d(TAG, "12-hour stopwatch check fired: displaying Still Studying prompt notification")
                showStillStudyingNotification(context)
            }
            ACTION_CONFIRM_STILL_STUDYING -> {
                Log.d(TAG, "User confirmed still studying from notification")
                dismissStillStudyingNotification(context)
                val delivered = TimerNotificationPlugin.emitTimerAction("confirm_still_studying")
                if (!delivered) {
                    launchMainActivityWithAction(context, "confirm_still_studying")
                }
            }
            ACTION_TIMER_EXACT_FINISH -> {
                Log.d(TAG, "Exact timer finish triggered by AlarmManager while device was idle/locked!")
                TimerForegroundService.onTargetReachedDirect(context)
            }
            ACTION_TIMER_PAUSE -> {
                // Update notification UI immediately to paused
                TimerForegroundService.pauseDirect(context)
                // Deliver action to Capacitor web layer
                val delivered = TimerNotificationPlugin.emitTimerAction("pause")
                if (!delivered) {
                    launchMainActivityWithAction(context, "pause")
                }
            }

            ACTION_TIMER_RESUME -> {
                // Update notification UI immediately to running
                TimerForegroundService.resumeDirect(context)
                // Deliver action to Capacitor web layer
                val delivered = TimerNotificationPlugin.emitTimerAction("resume")
                if (!delivered) {
                    launchMainActivityWithAction(context, "resume")
                }
            }

            ACTION_TIMER_STOP -> {
                // Remove notification and stop service immediately
                TimerForegroundService.stopDirect(context)
                // Deliver action to Capacitor web layer to save session
                val delivered = TimerNotificationPlugin.emitTimerAction("stop")
                if (!delivered) {
                    // App was killed/in background without active bridge — launch MainActivity to save
                    launchMainActivityWithAction(context, "stop")
                }
            }

            ACTION_NOTIFICATION_DELETED -> {
                Log.d(TAG, "Notification dismissed by user. Checking recovery status...")
                // If service is running, re-post the ongoing notification (Android 14 dismissal recovery)
                TimerForegroundService.recoverNotification(context)
            }
        }
    }

    private fun launchMainActivityWithAction(context: Context, timerAction: String) {
        try {
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("timerAction", timerAction)
                putExtra("tab", "timer")
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch MainActivity with action: $timerAction", e)
        }
    }

    private fun showStillStudyingNotification(context: Context) {
        try {
            val notifManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager ?: return

            val channelId = "timer_alerts"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = android.app.NotificationChannel(
                    channelId,
                    "Timer Alerts",
                    android.app.NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Alerts for long-running focus sessions and confirmations"
                    enableVibration(true)
                }
                notifManager.createNotificationChannel(channel)
            }

            // Confirm action intent
            val confirmIntent = Intent(context, TimerNotificationReceiver::class.java).apply {
                action = ACTION_CONFIRM_STILL_STUDYING
            }
            val confirmPending = android.app.PendingIntent.getBroadcast(
                context,
                8891,
                confirmIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            // Stop action intent
            val stopIntent = Intent(context, TimerNotificationReceiver::class.java).apply {
                action = ACTION_TIMER_STOP
            }
            val stopPending = android.app.PendingIntent.getBroadcast(
                context,
                8892,
                stopIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            val openAppIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("tab", "timer")
            }
            val contentPending = android.app.PendingIntent.getActivity(
                context,
                8893,
                openAppIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )

            val notification = androidx.core.app.NotificationCompat.Builder(context, channelId)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("Still studying? ⏱️")
                .setContentText("Your stopwatch has reached 12 hours. Tap to confirm and continue.")
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setCategory(androidx.core.app.NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(contentPending)
                .addAction(android.R.drawable.ic_media_play, "Yes, continue", confirmPending)
                .addAction(android.R.drawable.ic_delete, "Stop & Save", stopPending)
                .build()

            notifManager.notify(STILL_STUDYING_NOTIF_ID, notification)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show Still Studying notification", e)
        }
    }

    private fun dismissStillStudyingNotification(context: Context) {
        try {
            val notifManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
            notifManager?.cancel(STILL_STUDYING_NOTIF_ID)
        } catch (_: Exception) {}
    }
}
