package com.studyio.app

import android.app.AppOpsManager
import android.app.admin.DevicePolicyManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Base64
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

@CapacitorPlugin(name = "StrictMode")
class StrictModePlugin : Plugin() {

    companion object {
        private const val TAG = "StrictModePlugin"
    }

    private val backgroundExecutor = Executors.newSingleThreadExecutor()

    /**
     * Check whether the app has been granted PACKAGE_USAGE_STATS permission
     */
    @PluginMethod
    fun hasUsagePermission(call: PluginCall) {
        try {
            val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
            if (appOps == null) {
                val res = JSObject().apply { put("granted", false) }
                call.resolve(res)
                return
            }

            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    context.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    context.packageName
                )
            }

            val granted = (mode == AppOpsManager.MODE_ALLOWED)
            val res = JSObject().apply { put("granted", granted) }
            call.resolve(res)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking usage stats permission", e)
            val res = JSObject().apply { put("granted", false) }
            call.resolve(res)
        }
    }

    /**
     * Direct the user to the Usage Access settings screen to grant permission
     */
    @PluginMethod
    fun requestUsagePermission(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                data = Uri.parse("package:" + context.packageName)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            // Some OEM ROMs reject the package-specific URI, fallback to the general list
            try {
                val fallbackIntent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(fallbackIntent)
                call.resolve()
            } catch (e2: Exception) {
                Log.e(TAG, "Error opening usage access settings", e2)
                call.reject("Cannot open usage settings: ${e2.message}", e2)
            }
        }
    }

    /**
     * Check if Display over other apps (SYSTEM_ALERT_WINDOW) is granted
     */
    @PluginMethod
    fun hasOverlayPermission(call: PluginCall) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }
        val res = JSObject().apply { put("granted", granted) }
        call.resolve(res)
    }

    /**
     * Request Display over other apps (SYSTEM_ALERT_WINDOW)
     */
    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + context.packageName)
                ).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
            }
            call.resolve()
        } catch (e: Exception) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val fallback = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(fallback)
                }
                call.resolve()
            } catch (e2: Exception) {
                Log.e(TAG, "Error opening overlay settings", e2)
                call.reject("Cannot open overlay settings: ${e2.message}", e2)
            }
        }
    }

    /**
     * Sync strict mode active state and allowed packages to SharedPreferences
     * and live TimerForegroundService
     */
    @PluginMethod
    fun syncStrictConfig(call: PluginCall) {
        try {
            val enabled = call.getBoolean("enabled", false) ?: false
            val isUltra = call.getBoolean("isUltraStrict", false) ?: false
            val uninstallProtection = call.getBoolean("uninstallProtection", true) ?: true
            val packagesArray = call.getArray("allowedPackages")
            val set = mutableSetOf<String>()
            if (packagesArray != null) {
                for (i in 0 until packagesArray.length()) {
                    val pkg = packagesArray.optString(i)
                    if (!pkg.isNullOrEmpty()) {
                        set.add(pkg)
                    }
                }
            }

            val prefs = context.getSharedPreferences("studyio_strict_prefs", Context.MODE_PRIVATE)
            prefs.edit()
                .putBoolean("enabled", enabled)
                .putBoolean("is_ultra", isUltra)
                .putBoolean("uninstall_protection", uninstallProtection)
                .putStringSet("allowed_packages", set)
                .apply()

            TimerForegroundService.updateStrictConfig(context, enabled, set, isUltra, uninstallProtection)

            // If Ultra Strict or Uninstall Protection is disabled, automatically release active Device Admin if no countdown session is active
            if (!isUltra || !uninstallProtection) {
                if (!StudyDeviceAdminReceiver.isUltraStrictSessionActive(context)) {
                    try {
                        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
                        val comp = ComponentName(context, StudyDeviceAdminReceiver::class.java)
                        if (dpm != null && dpm.isAdminActive(comp)) {
                            dpm.removeActiveAdmin(comp)
                            Log.i(TAG, "Device Admin automatically deactivated: Ultra Strict / Uninstall Protection disabled.")
                        }
                    } catch (eAdmin: Exception) {
                        Log.w(TAG, "Could not automatically remove active admin in syncStrictConfig", eAdmin)
                    }
                }
            }

            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error syncing strict config", e)
            call.reject("Failed to sync strict config: ${e.message}", e)
        }
    }

    /**
     * Check whether study.io is currently an active Device Administrator
     */
    @PluginMethod
    fun isDeviceAdminActive(call: PluginCall) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
            val comp = ComponentName(context, StudyDeviceAdminReceiver::class.java)
            val prefs = context.getSharedPreferences("studyio_strict_prefs", Context.MODE_PRIVATE)
            val isUltra = prefs.getBoolean("is_ultra", false)
            val uninstallProtection = prefs.getBoolean("uninstall_protection", false)

            if ((!isUltra || !uninstallProtection) && !StudyDeviceAdminReceiver.isUltraStrictSessionActive(context)) {
                if (dpm != null && dpm.isAdminActive(comp)) {
                    try {
                        dpm.removeActiveAdmin(comp)
                        Log.i(TAG, "Device Admin removed on isDeviceAdminActive check because Ultra Strict is disabled")
                    } catch (eRemove: Exception) {
                        Log.w(TAG, "Could not remove active admin in isDeviceAdminActive", eRemove)
                    }
                }
            }

            val active = (dpm?.isAdminActive(comp) ?: false) && isUltra && uninstallProtection
            val res = JSObject().apply { put("active", active) }
            call.resolve(res)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking device admin status", e)
            val res = JSObject().apply { put("active", false) }
            call.resolve(res)
        }
    }

    /**
     * Request the user to activate Device Administrator for Uninstall Protection
     */
    @PluginMethod
    fun requestDeviceAdmin(call: PluginCall) {
        try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
            val comp = ComponentName(context, StudyDeviceAdminReceiver::class.java)
            if (dpm != null && dpm.isAdminActive(comp)) {
                val res = JSObject().apply { put("active", true) }
                call.resolve(res)
                return
            }

            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, comp)
                putExtra(
                    DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "Enables Uninstall Protection for Ultra Strict Mode so you cannot delete, uninstall, or force stop study.io during an active study countdown timer."
                )
            }

            val currentActivity = activity ?: bridge?.activity
            if (currentActivity != null) {
                // DeviceAdminAdd checks (flags & FLAG_ACTIVITY_NEW_TASK) != 0 and immediately finishes if set.
                // It must be launched from the foreground Activity without FLAG_ACTIVITY_NEW_TASK.
                currentActivity.startActivity(intent)
                call.resolve(JSObject().apply { put("launched", true) })
            } else {
                try {
                    val fallbackIntent = Intent("android.settings.DEVICE_ADMIN_SETTINGS").apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(fallbackIntent)
                    call.resolve(JSObject().apply { put("launched", true) })
                } catch (e2: Exception) {
                    val secIntent = Intent(Settings.ACTION_SECURITY_SETTINGS).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(secIntent)
                    call.resolve(JSObject().apply { put("launched", true) })
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error opening device admin activation screen", e)
            try {
                val fallbackIntent = Intent(Settings.ACTION_SECURITY_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(fallbackIntent)
                call.resolve(JSObject().apply { put("launched", true) })
            } catch (e2: Exception) {
                call.reject("Cannot open device admin settings: ${e.message}", e)
            }
        }
    }

    /**
     * Deactivate Device Administrator (only allowed if NO active Ultra Strict countdown is running)
     */
    @PluginMethod
    fun deactivateDeviceAdmin(call: PluginCall) {
        try {
            if (StudyDeviceAdminReceiver.isUltraStrictSessionActive(context)) {
                call.reject("Cannot deactivate Device Admin while Ultra Strict study session is running!")
                return
            }
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
            val comp = ComponentName(context, StudyDeviceAdminReceiver::class.java)
            if (dpm != null && dpm.isAdminActive(comp)) {
                dpm.removeActiveAdmin(comp)
            }
            val prefs = context.getSharedPreferences("studyio_strict_prefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("uninstall_protection", false).apply()
            val res = JSObject().apply { put("success", true) }
            call.resolve(res)
        } catch (e: Exception) {
            Log.e(TAG, "Error deactivating device admin", e)
            call.reject("Failed to deactivate device admin: ${e.message}", e)
        }
    }

    /**
     * Check if Uninstall Protection is enabled in preferences
     */
    @PluginMethod
    fun isUninstallProtectionEnabled(call: PluginCall) {
        val prefs = context.getSharedPreferences("studyio_strict_prefs", Context.MODE_PRIVATE)
        val isUltra = prefs.getBoolean("is_ultra", false)
        val enabled = if (!isUltra) false else prefs.getBoolean("uninstall_protection", false)
        val res = JSObject().apply { put("enabled", enabled) }
        call.resolve(res)
    }

    /**
     * Set Uninstall Protection enabled preference
     */
    @PluginMethod
    fun setUninstallProtectionEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        val prefs = context.getSharedPreferences("studyio_strict_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("uninstall_protection", enabled).apply()

        if (!enabled && !StudyDeviceAdminReceiver.isUltraStrictSessionActive(context)) {
            try {
                val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
                val comp = ComponentName(context, StudyDeviceAdminReceiver::class.java)
                if (dpm != null && dpm.isAdminActive(comp)) {
                    dpm.removeActiveAdmin(comp)
                    Log.i(TAG, "Device Admin removed via setUninstallProtectionEnabled(false)")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error removing active admin in setUninstallProtectionEnabled", e)
            }
        }
        call.resolve()
    }

    /**
     * Launch BlockedAppActivity directly on screen
     */
    @PluginMethod
    fun blockAppDirect(call: PluginCall) {
        try {
            val pkg = call.getString("packageName", "") ?: ""
            val name = call.getString("name", "This app") ?: "This app"
            val isUltra = call.getBoolean("isUltraStrict", false) ?: false
            if (pkg.isNotEmpty()) {
                val intent = Intent(context, BlockedAppActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_CLEAR_TOP or
                            Intent.FLAG_ACTIVITY_NO_ANIMATION or
                            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    putExtra(BlockedAppActivity.EXTRA_BLOCKED_PACKAGE, pkg)
                    putExtra(BlockedAppActivity.EXTRA_BLOCKED_NAME, name)
                    putExtra(BlockedAppActivity.EXTRA_IS_ULTRA, isUltra)
                }
                context.startActivity(intent)
            }
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error launching BlockedAppActivity directly", e)
            call.reject("Failed to block app: ${e.message}", e)
        }
    }

    /**
     * Get list of user-launchable apps installed on the device so user can pick allowed apps
     */
    @PluginMethod
    fun getInstalledApps(call: PluginCall) {
        backgroundExecutor.execute {
            try {
                val pm = context.packageManager
                val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
                    addCategory(Intent.CATEGORY_LAUNCHER)
                }

                val resolveInfos = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    pm.queryIntentActivities(mainIntent, PackageManager.ResolveInfoFlags.of(0))
                } else {
                    pm.queryIntentActivities(mainIntent, 0)
                }

                val seenPackages = mutableSetOf<String>()
                val ourPackage = context.packageName

                data class AppEntry(val pkg: String, val name: String, val icon: String?)
                val list = mutableListOf<AppEntry>()

                for (info in resolveInfos) {
                    val pkg = info.activityInfo?.packageName ?: continue
                    if (pkg == ourPackage || seenPackages.contains(pkg)) continue
                    seenPackages.add(pkg)

                    val name = try {
                        info.loadLabel(pm).toString()
                    } catch (e: Exception) {
                        pkg
                    }

                    val icon = try {
                        val drawable = info.loadIcon(pm)
                        drawableToBase64(drawable)
                    } catch (e: Exception) {
                        null
                    }

                    list.add(AppEntry(pkg, name, icon))
                }

                list.sortBy { it.name.lowercase() }

                val appsArray = JSArray()
                for (entry in list) {
                    val obj = JSObject().apply {
                        put("packageName", entry.pkg)
                        put("name", entry.name)
                        if (entry.icon != null) {
                            put("icon", entry.icon)
                        }
                    }
                    appsArray.put(obj)
                }

                val result = JSObject().apply {
                    put("apps", appsArray)
                }
                call.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Error listing installed apps", e)
                call.reject("Failed to list installed apps: ${e.message}", e)
            }
        }
    }

    /**
     * Check which app is currently open on the user's screen
     */
    @PluginMethod
    fun getForegroundApp(call: PluginCall) {
        try {
            val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            if (usageStatsManager == null) {
                val res = JSObject().apply {
                    put("packageName", null)
                    put("name", null)
                    put("isSystemOrLauncher", false)
                }
                call.resolve(res)
                return
            }

            val endTime = System.currentTimeMillis()
            val startTime = endTime - 1000 * 20 // 20-second window

            var currentApp: String? = null
            var lastEventTime: Long = 0

            val events = usageStatsManager.queryEvents(startTime, endTime)
            val event = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(event)
                val type = event.eventType
                if (type == UsageEvents.Event.ACTIVITY_RESUMED ||
                    type == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                    if (event.timeStamp >= lastEventTime) {
                        currentApp = event.packageName
                        lastEventTime = event.timeStamp
                    }
                }
            }

            // Fallback to queryUsageStats if queryEvents had no events in window
            if (currentApp == null) {
                val stats = usageStatsManager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, endTime)
                if (!stats.isNullOrEmpty()) {
                    val recent = stats.maxByOrNull { it.lastTimeUsed }
                    if (recent != null && (endTime - recent.lastTimeUsed) < 30000) {
                        currentApp = recent.packageName
                    }
                }
            }

            val isSystemOrLauncher = if (currentApp != null) isLauncherOrSystem(currentApp) else false
            var appName: String? = null

            if (currentApp != null && !isSystemOrLauncher) {
                try {
                    val pm = context.packageManager
                    val appInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        pm.getApplicationInfo(currentApp, PackageManager.ApplicationInfoFlags.of(0))
                    } else {
                        pm.getApplicationInfo(currentApp, 0)
                    }
                    appName = pm.getApplicationLabel(appInfo).toString()
                } catch (e: Exception) {
                    appName = currentApp
                }
            }

            val res = JSObject().apply {
                put("packageName", currentApp)
                put("name", appName ?: currentApp)
                put("isSystemOrLauncher", isSystemOrLauncher)
            }
            call.resolve(res)
        } catch (e: Exception) {
            Log.e(TAG, "Error retrieving foreground app", e)
            val res = JSObject().apply {
                put("packageName", null)
                put("name", null)
                put("isSystemOrLauncher", false)
            }
            call.resolve(res)
        }
    }

    private fun isLauncherOrSystem(packageName: String): Boolean {
        if (packageName == context.packageName) return true
        if (packageName == "android" || packageName == "com.android.systemui") return true

        try {
            val intent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
            }
            val resolveInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.resolveActivity(intent, PackageManager.ResolveInfoFlags.of(0))
            } else {
                context.packageManager.resolveActivity(intent, 0)
            }
            val homePkg = resolveInfo?.activityInfo?.packageName
            if (homePkg != null && homePkg == packageName) {
                return true
            }
        } catch (e: Exception) {
            // Ignore intent resolution errors
        }

        // Common Android system and vendor launcher packages
        val lower = packageName.lowercase()
        if (lower.startsWith("com.android.launcher") ||
            lower.contains("nexuslauncher") ||
            lower.contains("quickstep") ||
            lower.contains("miui.home") ||
            lower.contains("sec.android.app.launcher") ||
            lower.contains("huawei.android.launcher") ||
            lower.contains("oppo.launcher") ||
            lower.contains("oneplus.launcher")) {
            return true
        }

        return false
    }

    private fun drawableToBase64(drawable: Drawable): String? {
        return try {
            val width = 48
            val height = 48
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            drawable.setBounds(0, 0, canvas.width, canvas.height)
            drawable.draw(canvas)
            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 85, stream)
            val bytes = stream.toByteArray()
            "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
        } catch (e: Exception) {
            null
        }
    }
}
