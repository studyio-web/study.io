package com.studyio.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class TimerNotificationReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "TimerNotifReceiver"
        const val ACTION_TIMER_PAUSE = "com.studyio.app.ACTION_TIMER_PAUSE"
        const val ACTION_TIMER_RESUME = "com.studyio.app.ACTION_TIMER_RESUME"
        const val ACTION_TIMER_STOP = "com.studyio.app.ACTION_TIMER_STOP"
        const val ACTION_NOTIFICATION_DELETED = "com.studyio.app.ACTION_NOTIFICATION_DELETED"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.d(TAG, "onReceive action: $action")

        when (action) {
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
}
