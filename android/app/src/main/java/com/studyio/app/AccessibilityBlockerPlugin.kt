package com.studyio.app

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.text.TextUtils
import android.util.Log
import android.view.accessibility.AccessibilityManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "AccessibilityBlocker")
class AccessibilityBlockerPlugin : Plugin() {

    companion object {
        private const val TAG = "AccessibilityBlocker"
    }

    @PluginMethod
    fun enable(call: PluginCall) {
        ShortsReelsBlockerService.setBlockerEnabled(context, true)
        val res = JSObject().apply {
            put("enabled", true)
        }
        call.resolve(res)
    }

    @PluginMethod
    fun disable(call: PluginCall) {
        ShortsReelsBlockerService.setBlockerEnabled(context, false)
        val res = JSObject().apply {
            put("enabled", false)
        }
        call.resolve(res)
    }

    @PluginMethod
    fun isEnabled(call: PluginCall) {
        val enabled = ShortsReelsBlockerService.isBlockerEnabled(context)
        val res = JSObject().apply {
            put("enabled", enabled)
        }
        call.resolve(res)
    }

    @PluginMethod
    fun isServiceEnabled(call: PluginCall) {
        val isServiceActive = isAccessibilityServiceActive(context) || ShortsReelsBlockerService.isServiceRunning
        val res = JSObject().apply {
            put("isServiceEnabled", isServiceActive)
            put("isRunning", ShortsReelsBlockerService.isServiceRunning)
        }
        call.resolve(res)
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            call.resolve(JSObject().apply { put("success", true) })
        } catch (e: Exception) {
            call.reject("Failed to open accessibility settings: ${e.message}", e)
        }
    }

    private fun isAccessibilityServiceActive(context: Context): Boolean {
        // 1. Definite proof: service instance is currently bound and running in memory
        if (ShortsReelsBlockerService.isServiceRunning) {
            return true
        }

        val expectedServiceName = ShortsReelsBlockerService::class.java.name
        val expectedSimpleName = ShortsReelsBlockerService::class.java.simpleName
        val packageName = context.packageName

        // 2. Authoritative system setting: Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        try {
            val enabledServicesSetting = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            )
            if (!enabledServicesSetting.isNullOrEmpty()) {
                val colonSplitter = TextUtils.SimpleStringSplitter(':')
                colonSplitter.setString(enabledServicesSetting)
                while (colonSplitter.hasNext()) {
                    val componentNameString = colonSplitter.next()
                    if (componentNameString.contains(packageName, ignoreCase = true) &&
                        (componentNameString.contains(expectedServiceName, ignoreCase = true) ||
                         componentNameString.contains(expectedSimpleName, ignoreCase = true))
                    ) {
                        return true
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error checking Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES", e)
        }

        // 3. AccessibilityManager enabled services list fallback
        try {
            val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
            if (am != null) {
                val enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
                if (enabledServices != null) {
                    for (info in enabledServices) {
                        val sInfo = info.resolveInfo?.serviceInfo
                        val sPkg = sInfo?.packageName ?: ""
                        val sName = sInfo?.name ?: ""
                        val sId = info.id ?: ""

                        if (sId.contains(expectedSimpleName, ignoreCase = true) ||
                            (sPkg == packageName && (sName == expectedServiceName || sName.contains(expectedSimpleName, ignoreCase = true)))
                        ) {
                            return true
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error checking AccessibilityManager enabled list", e)
        }

        return false
    }
}
