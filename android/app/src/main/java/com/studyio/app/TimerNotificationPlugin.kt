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

        /**
         * Emits an onAlarmAction event to JavaScript listeners in the web app (stop, snooze, save).
         */
        fun emitAlarmAction(action: String): Boolean {
            val inst = activeInstance
            if (inst != null) {
                val data = JSObject().apply {
                    put("action", action)
                }
                inst.notifyListeners("onAlarmAction", data)
                Log.d(TAG, "Dispatched onAlarmAction: $action to web layer")
                return true
            }
            Log.w(TAG, "Could not dispatch onAlarmAction ($action) - activeInstance is null")
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
    fun getServiceTimerState(call: PluginCall) {
        try {
            val state = TimerForegroundService.getLiveState(context)
            val ret = JSObject().apply {
                put("isServiceActive", state.isActive)
                put("isRunning", state.isRunning)
                put("isPaused", state.isPaused)
                put("isCompleted", state.isCompleted)
                put("mode", state.mode)
                put("phase", state.phase)
                put("startTime", state.startTime.toDouble())
                put("elapsedSeconds", state.elapsedSeconds)
                put("baseElapsedSeconds", state.baseElapsedSeconds)
                put("targetSeconds", state.targetSeconds)
                put("subject", state.subject)
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting service timer state", e)
            call.reject("Failed to get service timer state: ${e.message}", e)
        }
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

    @PluginMethod
    fun scheduleAlarm(call: PluginCall) {
        try {
            val id = call.getString("id", "timer_alarm_${System.currentTimeMillis()}") ?: "timer_alarm"
            val rawTrigger = call.getDouble("triggerAtMs")?.toLong() ?: call.getData().optLong("triggerAtMs", 0L)
            if (rawTrigger <= 0L) {
                call.reject("triggerAtMs is required and must be > 0")
                return
            }
            val triggerAtMs = rawTrigger
            val label = call.getString("label", "Session Complete") ?: "Session Complete"
            val mode = call.getString("mode", "countdown") ?: "countdown"
            val phase = call.getString("phase", "work") ?: "work"
            val subject = call.getString("subject", "") ?: ""
            val durationSeconds = call.getInt("durationSeconds", 0)?.toLong() ?: 0L

            Log.d(TAG, "scheduleAlarm called from plugin: id=$id, triggerAtMs=$triggerAtMs, mode=$mode, phase=$phase")
            val scheduled = AlarmScheduler.scheduleAlarm(
                context = context,
                id = id,
                triggerAtMs = triggerAtMs,
                label = label,
                mode = mode,
                phase = phase,
                subject = subject,
                durationSeconds = durationSeconds
            )

            val ret = JSObject().apply {
                put("success", scheduled)
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error in scheduleAlarm", e)
            call.reject("Failed to schedule alarm: ${e.message}", e)
        }
    }

    @PluginMethod
    fun cancelAlarm(call: PluginCall) {
        try {
            val id = call.getString("id")
            Log.d(TAG, "cancelAlarm called from plugin: id=$id")
            AlarmScheduler.cancelAlarm(context, id)
            (activity as? MainActivity)?.clearAlarmWindowFlags()
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error in cancelAlarm", e)
            call.reject("Failed to cancel alarm: ${e.message}", e)
        }
    }

    @PluginMethod
    fun stopAlarm(call: PluginCall) {
        try {
            Log.d(TAG, "stopAlarm called from plugin: stopping AlarmService and clearing ringing state")
            AlarmService.stopAlarmService(context)
            (activity as? MainActivity)?.clearAlarmWindowFlags()
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error in stopAlarm", e)
            call.reject("Failed to stop alarm: ${e.message}", e)
        }
    }

    @PluginMethod
    fun setAlarmEnabled(call: PluginCall) {
        try {
            val enabled = call.getBoolean("enabled", true) ?: true
            Log.d(TAG, "setAlarmEnabled called from plugin: enabled=$enabled")
            AlarmScheduler.setAlarmEnabled(context, enabled)
            if (!enabled) {
                AlarmScheduler.cancelAlarm(context)
                AlarmService.stopAlarmService(context)
            }
            val ret = JSObject().apply {
                put("success", true)
                put("enabled", enabled)
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error in setAlarmEnabled", e)
            call.reject("Failed to set alarm enabled: ${e.message}", e)
        }
    }

    @PluginMethod
    fun isAlarmEnabled(call: PluginCall) {
        try {
            val enabled = AlarmScheduler.isAlarmEnabled(context)
            val ret = JSObject().apply {
                put("enabled", enabled)
            }
            call.resolve(ret)
        } catch (e: Exception) {
            call.resolve(JSObject().put("enabled", true))
        }
    }

    @PluginMethod
    fun getAlarmState(call: PluginCall) {
        try {
            val isRinging = AlarmService.isRinging
            val now = System.currentTimeMillis()
            val startedAt = AlarmService.alarmStartedAtMs
            val elapsedAlarmSeconds = if (isRinging && startedAt > 0) Math.max(0, ((now - startedAt) / 1000).toInt()) else 0
            val remainingSilenceSeconds = Math.max(0, 300 - elapsedAlarmSeconds)

            val ret = JSObject().apply {
                put("isRinging", isRinging)
                put("remainingSilenceSeconds", remainingSilenceSeconds)
                put("mode", AlarmService.alarmMode)
                put("phase", AlarmService.alarmPhase)
                put("subject", AlarmService.alarmSubject)
                put("durationSeconds", AlarmService.alarmDurationSeconds)
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error in getAlarmState", e)
            call.reject("Failed to get alarm state: ${e.message}", e)
        }
    }

    @PluginMethod
    fun getDeviceManufacturer(call: PluginCall) {
        val ret = JSObject().apply {
            put("manufacturer", Build.MANUFACTURER ?: "")
            put("model", Build.MODEL ?: "")
            put("sdkInt", Build.VERSION.SDK_INT)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun openNotificationSettings(call: PluginCall) {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
            }
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error opening notification settings", e)
            call.reject("Failed to open notification settings: ${e.message}", e)
        }
    }

    @PluginMethod
    fun snooze(call: PluginCall) {
        try {
            val minutes = call.getInt("minutes", 5) ?: 5
            AlarmService.stopAlarmService(context)
            val triggerAtMs = System.currentTimeMillis() + (minutes * 60 * 1000L)
            AlarmScheduler.scheduleAlarm(
                context = context,
                id = "snooze_${System.currentTimeMillis()}",
                triggerAtMs = triggerAtMs,
                label = "Snoozed Focus Session"
            )
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error in snooze", e)
            call.reject("Failed to snooze alarm: ${e.message}", e)
        }
    }

    @PluginMethod
    fun checkAlarmPermissions(call: PluginCall) {
        try {
            val exactAlarm = AlarmScheduler.canScheduleExact(context)

            val fullScreen = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
                nm?.canUseFullScreenIntent() ?: true
            } else {
                true
            }

            val nmCompat = androidx.core.app.NotificationManagerCompat.from(context)
            val notifications = nmCompat.areNotificationsEnabled()

            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val batteryOptimized = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && pm != null) {
                !pm.isIgnoringBatteryOptimizations(context.packageName)
            } else {
                false
            }

            val ret = JSObject().apply {
                put("exactAlarm", exactAlarm)
                put("fullScreen", fullScreen)
                put("notifications", notifications)
                put("batteryOptimized", batteryOptimized)
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error in checkAlarmPermissions", e)
            call.reject("Failed to check alarm permissions: ${e.message}", e)
        }
    }

    @PluginMethod
    fun requestExactAlarmPermission(call: PluginCall) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
            }
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting exact alarm permission", e)
            call.reject("Failed to open exact alarm settings: ${e.message}", e)
        }
    }

    @PluginMethod
    fun requestFullScreenPermission(call: PluginCall) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
            }
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting full screen permission", e)
            call.reject("Failed to open full screen intent settings: ${e.message}", e)
        }
    }

    @PluginMethod
    fun testAlarm(call: PluginCall) {
        try {
            val delaySeconds = call.getInt("seconds", 10) ?: 10
            val triggerAtMs = System.currentTimeMillis() + (delaySeconds * 1000L)
            Log.d(TAG, "testAlarm requested: scheduling AlarmClock in ${delaySeconds}s (triggerAtMs=$triggerAtMs)")
            val scheduled = AlarmScheduler.scheduleAlarm(
                context = context,
                id = "test_alarm_${System.currentTimeMillis()}",
                triggerAtMs = triggerAtMs,
                label = "Test Alarm (${delaySeconds}s)",
                mode = "countdown",
                phase = "work",
                subject = "Alarm Verification",
                durationSeconds = 60L
            )
            val ret = JSObject().apply {
                put("success", scheduled)
                put("delaySeconds", delaySeconds)
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error scheduling test alarm", e)
            call.reject("Failed to schedule test alarm: ${e.message}", e)
        }
    }
}
