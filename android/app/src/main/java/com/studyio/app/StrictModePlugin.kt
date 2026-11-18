package com.studyio.app

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
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
