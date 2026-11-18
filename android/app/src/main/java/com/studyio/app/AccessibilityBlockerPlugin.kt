package com.studyio.app

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "AccessibilityBlocker")
class AccessibilityBlockerPlugin : Plugin() {

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
        val isServiceActive = isAccessibilityServiceActive(context)
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
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager ?: return false
        val enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
        val myServiceClass = ShortsReelsBlockerService::class.java.name
        return enabledServices.any {
            it.resolveInfo?.serviceInfo?.name == myServiceClass ||
            it.id.contains("ShortsReelsBlockerService")
        }
    }
}
