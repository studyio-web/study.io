package com.studyio.app

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * DeviceAdminReceiver for study.io Uninstall Protection.
 * When enabled as an active Device Administrator:
 * 1. Android OS package manager disables and blocks uninstallation of study.io.
 * 2. If the user attempts to deactivate Device Admin while an Ultra Strict countdown timer
 *    is running, onDisableRequested intercepts the request and warns the user with a lockdown alert.
 */
class StudyDeviceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        private const val TAG = "StudyDeviceAdmin"

        /**
         * Checks whether an Ultra Strict study countdown session is actively running or paused.
         */
        fun isUltraStrictSessionActive(context: Context): Boolean {
            return try {
                val timerPrefs = context.getSharedPreferences("studyio_timer_prefs", Context.MODE_PRIVATE)
                val isRunning = timerPrefs.getBoolean("is_running", false)
                val isPaused = timerPrefs.getBoolean("is_paused", false)
                val mode = timerPrefs.getString("mode", "stopwatch") ?: "stopwatch"

                val strictPrefs = context.getSharedPreferences("studyio_strict_prefs", Context.MODE_PRIVATE)
                val isStrict = strictPrefs.getBoolean("enabled", false)
                val isUltra = strictPrefs.getBoolean("is_ultra", false)

                (isRunning || isPaused) && isStrict && isUltra && mode == "countdown"
            } catch (e: Exception) {
                Log.w(TAG, "Error checking active Ultra Strict session", e)
                false
            }
        }
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "Study.io Device Administrator enabled. Uninstall Protection is now active.")
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence? {
        if (isUltraStrictSessionActive(context)) {
            Log.w(TAG, "Device Admin deactivation attempted while Ultra Strict timer is running! Blocking.")
            return "🚨 ULTRA STRICT LOCKDOWN ACTIVE!\n\nYou cannot deactivate or uninstall study.io while your countdown focus session is in progress. The app will remain locked until your timer reaches 00:00:00."
        }
        return null
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.i(TAG, "Study.io Device Administrator disabled.")
    }
}
