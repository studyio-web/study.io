package com.studyio.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log

class AlarmReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "AlarmReceiver"
        const val ACTION_TRIGGER_ALARM = "com.studyio.app.ACTION_TRIGGER_ALARM"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "AlarmReceiver triggered with action: ${intent.action}")

        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = powerManager?.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "studyio:AlarmReceiverWakeLock"
        )
        // Acquire wake lock for 15 seconds to ensure AlarmService starts safely
        wakeLock?.acquire(15 * 1000L)

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
            Log.i(TAG, "Successfully started AlarmService from AlarmReceiver")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start AlarmService", e)
        } finally {
            try {
                if (wakeLock != null && wakeLock.isHeld) {
                    wakeLock.release()
                }
            } catch (err: Exception) {
                // ignore
            }
        }
    }
}
