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

        val pending = AlarmScheduler.getPendingAlarm(context) ?: return
        val now = System.currentTimeMillis()

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
