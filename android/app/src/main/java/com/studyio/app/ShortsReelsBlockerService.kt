package com.studyio.app

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.SharedPreferences
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Android Accessibility Service for study.io Digital Wellbeing.
 * Targets Instagram (com.instagram.android) and YouTube (com.google.android.youtube)
 * to block Reels and Shorts during active focus sessions.
 */
class ShortsReelsBlockerService : AccessibilityService() {

    companion object {
        private const val TAG = "ShortsReelsBlocker"
        const val PREFS_NAME = "studyio_accessibility_blocker_prefs"
        const val KEY_ENABLED = "is_blocker_enabled"

        private const val PKG_INSTAGRAM = "com.instagram.android"
        private const val PKG_YOUTUBE = "com.google.android.youtube"

        // Cooldown between back actions to prevent infinite/rapid consecutive back presses
        private const val BACK_ACTION_COOLDOWN_MS = 800L
        private var lastBackActionTime = 0L

        @Volatile
        var isServiceRunning = false

        fun isBlockerEnabled(context: Context): Boolean {
            val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getBoolean(KEY_ENABLED, false)
        }

        fun setBlockerEnabled(context: Context, enabled: Boolean) {
            val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean(KEY_ENABLED, enabled).apply()
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        isServiceRunning = true
        Log.i(TAG, "ShortsReelsBlockerService connected and active.")
    }

    override fun onDestroy() {
        super.onDestroy()
        isServiceRunning = false
        Log.i(TAG, "ShortsReelsBlockerService destroyed.")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        // 1. Verify blocking mode is toggled ON from study.io timer component
        if (!isBlockerEnabled(this)) return

        val packageName = event.packageName?.toString() ?: return
        if (packageName != PKG_INSTAGRAM && packageName != PKG_YOUTUBE) return

        when (event.eventType) {
            // Requirement 3: Block the Tabs (Detect click on Reels or Shorts tab/button)
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                handleViewClicked(event, packageName)
            }

            // Requirement 4: Block the Scrolling (Detect swipe/scroll while inside Reels/Shorts)
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                handleViewScrolled(event, packageName)
            }

            // Also check window state changes in case the user opens directly into Reels/Shorts
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                checkAndBlockIfInsidePlayer(packageName)
            }
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "ShortsReelsBlockerService interrupted by system.")
    }

    /**
     * Requirement 3: Block the Tabs
     * Detects if the user clicks a UI node with content description or text matching "Reels" or "Shorts".
     * If detected, immediately triggers performGlobalAction(GLOBAL_ACTION_BACK).
     */
    private fun handleViewClicked(event: AccessibilityEvent, packageName: String) {
        val sourceNode = event.source ?: return
        try {
            if (isReelsOrShortsClickTarget(sourceNode, packageName)) {
                Log.i(TAG, "Blocked click on Reels/Shorts UI element in $packageName. Triggering BACK.")
                triggerBackAction()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error evaluating clicked node", e)
        } finally {
            sourceNode.recycle()
        }
    }

    /**
     * Requirement 4: Block the Scrolling
     * Listens for TYPE_VIEW_SCROLLED events. If the user is currently inside a Reels/Shorts
     * video player view and attempts to swipe/scroll, triggers performGlobalAction(GLOBAL_ACTION_BACK).
     */
    private fun handleViewScrolled(event: AccessibilityEvent, packageName: String) {
        val rootNode = rootInActiveWindow ?: return
        try {
            val isInsidePlayer = when (packageName) {
                PKG_INSTAGRAM -> isInsideInstagramReels(rootNode)
                PKG_YOUTUBE -> isInsideYouTubeShorts(rootNode)
                else -> false
            }

            if (isInsidePlayer) {
                Log.i(TAG, "Blocked scrolling inside Reels/Shorts player in $packageName. Triggering BACK.")
                triggerBackAction()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error evaluating scroll event", e)
        } finally {
            rootNode.recycle()
        }
    }

    /**
     * Intercepts directly if the active window is already showing the Reels or Shorts player.
     */
    private fun checkAndBlockIfInsidePlayer(packageName: String) {
        val now = SystemClock.uptimeMillis()
        if (now - lastBackActionTime < BACK_ACTION_COOLDOWN_MS) return

        val rootNode = rootInActiveWindow ?: return
        try {
            val isInsidePlayer = when (packageName) {
                PKG_INSTAGRAM -> isInsideInstagramReels(rootNode)
                PKG_YOUTUBE -> isInsideYouTubeShorts(rootNode)
                else -> false
            }

            if (isInsidePlayer) {
                Log.i(TAG, "Detected active window inside Reels/Shorts player in $packageName. Triggering BACK.")
                triggerBackAction()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error evaluating window state", e)
        } finally {
            rootNode.recycle()
        }
    }

    /**
     * Inspects a clicked node (and its direct children) for text, contentDescription,
     * or resource view ID indicating Instagram Reels or YouTube Shorts tab buttons.
     */
    private fun isReelsOrShortsClickTarget(node: AccessibilityNodeInfo, packageName: String): Boolean {
        val text = node.text?.toString() ?: ""
        val desc = node.contentDescription?.toString() ?: ""
        val viewId = node.viewIdResourceName ?: ""

        if (packageName == PKG_INSTAGRAM) {
            // Instagram Reels tab or Reels button
            if (desc.contains("Reel", ignoreCase = true) || text.contains("Reel", ignoreCase = true)) {
                return true
            }
            if (viewId.contains("clips_tab", ignoreCase = true) || viewId.contains("reels_tab", ignoreCase = true)) {
                return true
            }
        } else if (packageName == PKG_YOUTUBE) {
            // YouTube Shorts tab or Shorts shelf entry
            if (desc.contains("Shorts", ignoreCase = true) || text.contains("Shorts", ignoreCase = true)) {
                return true
            }
            if (viewId.contains("pivot_shorts", ignoreCase = true) || viewId.contains("shorts_container", ignoreCase = true)) {
                return true
            }
        }

        // Recursively inspect shallow child hierarchy (e.g. icon or badge inside tab bar item)
        val childCount = node.childCount
        for (i in 0 until childCount) {
            val child = node.getChild(i) ?: continue
            try {
                if (isReelsOrShortsClickTarget(child, packageName)) {
                    return true
                }
            } finally {
                child.recycle()
            }
        }

        return false
    }

    /**
     * Evaluates whether the currently displayed screen in Instagram is the full-screen Reels viewer.
     */
    private fun isInsideInstagramReels(rootNode: AccessibilityNodeInfo): Boolean {
        // High-confidence view IDs found in Instagram's Reels (Clips) UI
        val instagramReelsIds = listOf(
            "com.instagram.android:id/clips_video_container",
            "com.instagram.android:id/clips_viewer_view_pager",
            "com.instagram.android:id/reel_viewer_root",
            "com.instagram.android:id/clips_swipe_refresh_container",
            "com.instagram.android:id/clips_item_container",
            "com.instagram.android:id/clips_view_pager"
        )

        for (id in instagramReelsIds) {
            val matchedNodes = rootNode.findAccessibilityNodeInfosByViewId(id)
            if (matchedNodes != null && matchedNodes.isNotEmpty()) {
                matchedNodes.forEach { it.recycle() }
                return true
            }
        }

        // Text & ContentDescription heuristic fallback for Reels full-screen player
        val textNodes = rootNode.findAccessibilityNodeInfosByText("Reels")
        if (textNodes != null && textNodes.isNotEmpty()) {
            val isReelsViewer = textNodes.any { node ->
                val desc = node.contentDescription?.toString() ?: ""
                val txt = node.text?.toString() ?: ""
                desc.contains("Reel", ignoreCase = true) || txt.equals("Reels", ignoreCase = true)
            }
            textNodes.forEach { it.recycle() }
            if (isReelsViewer) return true
        }

        return false
    }

    /**
     * Evaluates whether the currently displayed screen in YouTube is the full-screen Shorts player.
     */
    private fun isInsideYouTubeShorts(rootNode: AccessibilityNodeInfo): Boolean {
        // High-confidence view IDs found in YouTube's Shorts player UI
        val youtubeShortsIds = listOf(
            "com.google.android.youtube:id/shorts_container",
            "com.google.android.youtube:id/reel_recycler",
            "com.google.android.youtube:id/reel_player_page_view",
            "com.google.android.youtube:id/reel_player_view",
            "com.google.android.youtube:id/shorts_shelf_view"
        )

        for (id in youtubeShortsIds) {
            val matchedNodes = rootNode.findAccessibilityNodeInfosByViewId(id)
            if (matchedNodes != null && matchedNodes.isNotEmpty()) {
                matchedNodes.forEach { it.recycle() }
                return true
            }
        }

        // Action buttons unique to the YouTube Shorts feed (Remix, Sound, Subscribe overlay)
        val remixNodes = rootNode.findAccessibilityNodeInfosByText("Remix")
        if (remixNodes != null && remixNodes.isNotEmpty()) {
            remixNodes.forEach { it.recycle() }
            return true
        }

        val soundNodes = rootNode.findAccessibilityNodeInfosByText("Sound")
        if (soundNodes != null && soundNodes.isNotEmpty()) {
            soundNodes.forEach { it.recycle() }
            return true
        }

        return false
    }

    /**
     * Safely executes performGlobalAction(GLOBAL_ACTION_BACK) with rate-limiting debounce.
     */
    private fun triggerBackAction() {
        val now = SystemClock.uptimeMillis()
        if (now - lastBackActionTime < BACK_ACTION_COOLDOWN_MS) {
            return
        }
        lastBackActionTime = now
        val success = performGlobalAction(GLOBAL_ACTION_BACK)
        Log.d(TAG, "performGlobalAction(GLOBAL_ACTION_BACK) result: $success")
    }
}
