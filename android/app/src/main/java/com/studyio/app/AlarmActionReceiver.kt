package com.studyio.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class AlarmActionReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "AlarmActionReceiver"
        const val ACTION_ALARM_STOP = "com.studyio.app.ACTION_ALARM_STOP"
        const val ACTION_ALARM_SNOOZE = "com.studyio.app.ACTION_ALARM_SNOOZE"
        const val ACTION_ALARM_SAVE = "com.studyio.app.ACTION_ALARM_SAVE"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "AlarmActionReceiver received: $action")

        // Stop the currently ringing foreground AlarmService
        AlarmService.stopAlarmService(context)

        when (action) {
            ACTION_ALARM_STOP -> {
                TimerNotificationPlugin.emitAlarmAction("stop")
            }
            ACTION_ALARM_SNOOZE -> {
                // Schedule alarm 5 minutes from now
                val snoozeTriggerAtMs = System.currentTimeMillis() + (5 * 60 * 1000L)
                AlarmScheduler.scheduleAlarm(
                    context = context,
                    id = "snooze_${System.currentTimeMillis()}",
                    triggerAtMs = snoozeTriggerAtMs,
                    label = "Snoozed Focus Session"
                )
                TimerNotificationPlugin.emitAlarmAction("snooze")
            }
            ACTION_ALARM_SAVE -> {
                // Open app directly to Timer tab to execute server-authoritative session save
                val launchIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra("alarmAction", "save")
                    putExtra("tab", "timer")
                }
                context.startActivity(launchIntent)
                TimerNotificationPlugin.emitAlarmAction("save")
            }
        }
    }
}
