package com.studyio.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log

class AlarmReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "StudyAlarm"
        const val ACTION_TRIGGER_ALARM = "com.studyio.app.ACTION_TRIGGER_ALARM"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "AlarmReceiver fired! action=${intent.action}, mode=${intent.getStringExtra("mode")}, phase=${intent.getStringExtra("phase")}")

        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = powerManager?.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "studyio:AlarmReceiverWakeLock"
        )
        // Acquire 30s wake lock so CPU stays awake until AlarmService completes startForeground()
        wakeLock?.acquire(30 * 1000L)

        val serviceIntent = Intent(context, AlarmService::class.java).apply {
            action = AlarmService.ACTION_START_ALARM
            putExtras(intent)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            Log.d(TAG, "AlarmReceiver: successfully invoked startForegroundService for AlarmService")
        } catch (e: Exception) {
            Log.e(TAG, "AlarmReceiver: failed to start AlarmService", e)
        }
    }
}
