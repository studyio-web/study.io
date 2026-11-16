package com.studyio.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "TimerNotification")
class TimerNotificationPlugin : Plugin() {

    companion object {
        private const val TAG = "TimerNotifPlugin"

        @Volatile
        private var activeInstance: TimerNotificationPlugin? = null

        /**
         * Emits an onTimerAction event to JavaScript listeners in the web app.
         * Returns true if active instance is present and listener event was dispatched.
         */
        fun emitTimerAction(action: String): Boolean {
            val inst = activeInstance
            if (inst != null) {
                val data = JSObject().apply {
                    put("action", action)
                }
                inst.notifyListeners("onTimerAction", data)
                Log.d(TAG, "Dispatched onTimerAction: $action to web layer")
                return true
            }
            Log.w(TAG, "Could not dispatch onTimerAction ($action) - activeInstance is null")
            return false
        }
    }

    override fun load() {
        super.load()
        activeInstance = this
        Log.d(TAG, "TimerNotificationPlugin loaded")
    }

    override fun handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null
        }
        super.handleOnDestroy()
    }

    @PluginMethod
    fun start(call: PluginCall) {
        try {
            val mode = call.getString("mode", "stopwatch")
            val phase = call.getString("phase", "work")
            val startTime = call.getDouble("startTime", System.currentTimeMillis().toDouble())?.toLong()
                ?: System.currentTimeMillis()
            val elapsedSeconds = call.getInt("elapsedSeconds", 0) ?: 0
            val targetSeconds = call.getInt("targetSeconds", 0) ?: 0
            val subject = call.getString("subject", "")

            val context = context
            val intent = Intent(context, TimerForegroundService::class.java).apply {
                action = TimerForegroundService.ACTION_START
                putExtra(TimerForegroundService.EXTRA_MODE, mode)
                putExtra(TimerForegroundService.EXTRA_PHASE, phase)
                putExtra(TimerForegroundService.EXTRA_START_TIME, startTime)
                putExtra(TimerForegroundService.EXTRA_ELAPSED_SECONDS, elapsedSeconds)
                putExtra(TimerForegroundService.EXTRA_TARGET_SECONDS, targetSeconds)
                putExtra(TimerForegroundService.EXTRA_SUBJECT, subject)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }

            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error starting TimerForegroundService", e)
            call.reject("Failed to start timer notification service: ${e.message}", e)
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        try {
            TimerForegroundService.pauseDirect(context)
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error pausing TimerForegroundService", e)
            call.reject("Failed to pause timer: ${e.message}", e)
        }
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        try {
            TimerForegroundService.resumeDirect(context)
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error resuming TimerForegroundService", e)
            call.reject("Failed to resume timer: ${e.message}", e)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        try {
            TimerForegroundService.stopDirect(context)
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping TimerForegroundService", e)
            call.reject("Failed to stop timer: ${e.message}", e)
        }
    }

    @PluginMethod
    fun update(call: PluginCall) {
        try {
            val mode = call.getString("mode")
            val phase = call.getString("phase")
            val startTime = call.getDouble("startTime")?.toLong()
            val elapsedSeconds = call.getInt("elapsedSeconds")
            val targetSeconds = call.getInt("targetSeconds")
            val subject = call.getString("subject")

            val context = context
            val intent = Intent(context, TimerForegroundService::class.java).apply {
                action = TimerForegroundService.ACTION_UPDATE
                mode?.let { putExtra(TimerForegroundService.EXTRA_MODE, it) }
                phase?.let { putExtra(TimerForegroundService.EXTRA_PHASE, it) }
                startTime?.let { putExtra(TimerForegroundService.EXTRA_START_TIME, it) }
                elapsedSeconds?.let { putExtra(TimerForegroundService.EXTRA_ELAPSED_SECONDS, it) }
                targetSeconds?.let { putExtra(TimerForegroundService.EXTRA_TARGET_SECONDS, it) }
                subject?.let { putExtra(TimerForegroundService.EXTRA_SUBJECT, it) }
            }

            context.startService(intent)
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error updating TimerForegroundService", e)
            call.reject("Failed to update timer notification: ${e.message}", e)
        }
    }

    @PluginMethod
    fun isServiceRunning(call: PluginCall) {
        val ret = JSObject().apply {
            put("isRunning", TimerForegroundService.isServiceRunning)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun isBatteryOptimized(call: PluginCall) {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val isIgnoring = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && pm != null) {
                pm.isIgnoringBatteryOptimizations(context.packageName)
            } else {
                true
            }
            val ret = JSObject().apply {
                put("isIgnoringBatteryOptimizations", isIgnoring)
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking battery optimization", e)
            call.reject("Failed to check battery optimization", e)
        }
    }

    @PluginMethod
    fun requestIgnoreBatteryOptimization(call: PluginCall) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent().apply {
                    action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
            }
            call.resolve()
        } catch (e: Exception) {
            Log.w(TAG, "Direct ignore battery prompt failed, falling back to battery settings list", e)
            try {
                val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(fallbackIntent)
                call.resolve()
            } catch (err: Exception) {
                call.reject("Cannot open battery optimization settings: ${err.message}", err)
            }
        }
    }
}
