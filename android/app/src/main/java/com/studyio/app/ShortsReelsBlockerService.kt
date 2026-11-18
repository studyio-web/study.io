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

            // Requirement 4: Anti-Doomscrolling: Block scrolling away from a reel/short
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                handleViewScrolled(event, packageName)
            }

            // Block direct navigation into the dedicated Reels/Shorts tab section
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                checkAndBlockIfInReelsOrShortsTab(packageName)
            }
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "ShortsReelsBlockerService interrupted by system.")
    }

    /**
     * Requirement 3: Block the Tabs
     * Detects if the user clicks the dedicated Reels or Shorts tab button on the main navigation bar.
     * Clicks on shared reels inside Direct Message (DM) chat threads are explicitly permitted.
     */
    private fun handleViewClicked(event: AccessibilityEvent, packageName: String) {
        val sourceNode = event.source ?: return
        try {
            if (isReelsOrShortsClickTarget(sourceNode, packageName)) {
                Log.i(TAG, "Blocked click on Reels/Shorts tab button in $packageName. Triggering BACK.")
                triggerBackAction()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error evaluating clicked node", e)
        } finally {
            sourceNode.recycle()
        }
    }

    /**
     * Requirement 4: Block the Scrolling (Anti-Doomscrolling)
     * Listens for TYPE_VIEW_SCROLLED events. If the user is currently inside a Reels/Shorts
     * video player view (e.g. watching a reel sent by a friend in DM) and attempts to swipe/scroll
     * to the next video, triggers performGlobalAction(GLOBAL_ACTION_BACK) immediately.
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
                Log.i(TAG, "Anti-doomscrolling: Blocked scroll inside Reels/Shorts player in $packageName. Triggering BACK.")
                triggerBackAction()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error evaluating scroll event", e)
        } finally {
            rootNode.recycle()
        }
    }

    /**
     * Blocks access if the active window is the dedicated Reels tab or Shorts tab.
     * Crucially allows standalone reels opened from Direct Messages (DMs) to play.
     */
    private fun checkAndBlockIfInReelsOrShortsTab(packageName: String) {
        val now = SystemClock.uptimeMillis()
        if (now - lastBackActionTime < BACK_ACTION_COOLDOWN_MS) return

        val rootNode = rootInActiveWindow ?: return
        try {
            val isInTabSection = when (packageName) {
                PKG_INSTAGRAM -> isInstagramReelsTabActive(rootNode)
                PKG_YOUTUBE -> isYouTubeShortsTabActive(rootNode)
                else -> false
            }

            if (isInTabSection) {
                Log.i(TAG, "Blocked access to Reels/Shorts tab section in $packageName. Triggering BACK.")
                triggerBackAction()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error evaluating window state", e)
        } finally {
            rootNode.recycle()
        }
    }

    /**
     * Checks if a node or any of its ancestors is part of Instagram's Direct Message (DM) chat interface.
     * This ensures clicking reels sent by friends in DMs is never blocked.
     */
    private fun isInsideDirectMessageThread(node: AccessibilityNodeInfo): Boolean {
        var current: AccessibilityNodeInfo? = node
        var depth = 0
        while (current != null && depth < 8) {
            val viewId = current.viewIdResourceName ?: ""
            if (viewId.contains("direct", ignoreCase = true) ||
                viewId.contains("message", ignoreCase = true) ||
                viewId.contains("thread", ignoreCase = true) ||
                viewId.contains("chat", ignoreCase = true) ||
                viewId.contains("inbox", ignoreCase = true)
            ) {
                if (current != node) {
                    current.recycle()
                }
                return true
            }
            val parent = current.parent
            if (current != node) {
                current.recycle()
            }
            current = parent
            depth++
        }
        current?.let { if (it != node) it.recycle() }
        return false
    }

    /**
     * Inspects a clicked node (and its direct children) for text, contentDescription,
     * or resource view ID indicating Instagram Reels or YouTube Shorts tab buttons.
     * Ignores clicks inside Direct Message (DM) chat threads so shared reels can be opened.
     */
    private fun isReelsOrShortsClickTarget(node: AccessibilityNodeInfo, packageName: String): Boolean {
        // Allow clicks inside Direct Messages (DMs) so users can tap and watch friend-sent reels
        if (packageName == PKG_INSTAGRAM && isInsideDirectMessageThread(node)) {
            return false
        }

        val text = node.text?.toString() ?: ""
        val desc = node.contentDescription?.toString() ?: ""
        val viewId = node.viewIdResourceName ?: ""

        if (packageName == PKG_INSTAGRAM) {
            // Instagram Reels tab or Reels button on the bottom navigation bar
            if (viewId.contains("clips_tab", ignoreCase = true) ||
                viewId.contains("reels_tab", ignoreCase = true) ||
                desc.contains("Reels tab", ignoreCase = true) ||
                desc.equals("Reels", ignoreCase = true) ||
                text.equals("Reels", ignoreCase = true)
            ) {
                return true
            }
        } else if (packageName == PKG_YOUTUBE) {
            // YouTube Shorts tab on the bottom navigation bar
            if (viewId.contains("pivot_shorts", ignoreCase = true) ||
                desc.contains("Shorts tab", ignoreCase = true) ||
                desc.equals("Shorts", ignoreCase = true) ||
                text.equals("Shorts", ignoreCase = true)
            ) {
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
     * Checks if the user is currently on the main Instagram Reels tab (the algorithmic doomscroll section).
     * This is true only when the bottom navigation bar has the Reels tab selected.
     */
    private fun isInstagramReelsTabActive(rootNode: AccessibilityNodeInfo): Boolean {
        val clipsTabNodes = rootNode.findAccessibilityNodeInfosByViewId("com.instagram.android:id/clips_tab")
        if (clipsTabNodes != null && clipsTabNodes.isNotEmpty()) {
            val isSelected = clipsTabNodes.any { it.isSelected }
            clipsTabNodes.forEach { it.recycle() }
            if (isSelected) return true
        }

        val textNodes = rootNode.findAccessibilityNodeInfosByText("Reels")
        if (textNodes != null && textNodes.isNotEmpty()) {
            val isSelectedReelsTab = textNodes.any { node ->
                node.isSelected && (
                    node.contentDescription?.toString()?.contains("Reel", ignoreCase = true) == true ||
                    node.text?.toString()?.equals("Reels", ignoreCase = true) == true
                )
            }
            textNodes.forEach { it.recycle() }
            if (isSelectedReelsTab) return true
        }

        return false
    }

    /**
     * Checks if the user is currently on the main YouTube Shorts tab in the bottom bar.
     */
    private fun isYouTubeShortsTabActive(rootNode: AccessibilityNodeInfo): Boolean {
        val pivotShortsNodes = rootNode.findAccessibilityNodeInfosByViewId("com.google.android.youtube:id/pivot_shorts")
        if (pivotShortsNodes != null && pivotShortsNodes.isNotEmpty()) {
            val isSelected = pivotShortsNodes.any { it.isSelected }
            pivotShortsNodes.forEach { it.recycle() }
            if (isSelected) return true
        }

        return false
    }

    /**
     * Evaluates whether the currently displayed screen in Instagram is the full-screen Reels viewer.
     * Matches both shared reels in DM and full-screen clips viewers for scroll interception.
     */
    private fun isInsideInstagramReels(rootNode: AccessibilityNodeInfo): Boolean {
        // 1. High-confidence view IDs exclusive to Instagram's Reels (Clips) viewer
        val instagramClipsViewerIds = listOf(
            "com.instagram.android:id/clips_viewer_view_pager",
            "com.instagram.android:id/clips_video_container",
            "com.instagram.android:id/clips_swipe_refresh_container",
            "com.instagram.android:id/clips_item_container",
            "com.instagram.android:id/clips_view_pager",
            "com.instagram.android:id/clips_viewer_fragment_container",
            "com.instagram.android:id/clips_viewer_root"
        )

        for (id in instagramClipsViewerIds) {
            val matchedNodes = rootNode.findAccessibilityNodeInfosByViewId(id)
            if (matchedNodes != null && matchedNodes.isNotEmpty()) {
                matchedNodes.forEach { it.recycle() }
                return true
            }
        }

        // 2. Action overlays unique to Reels (Audio pill, Remix button)
        val reelsOverlayIds = listOf(
            "com.instagram.android:id/clips_audio_pill",
            "com.instagram.android:id/audio_attribution_label",
            "com.instagram.android:id/clips_remix_button"
        )
        for (id in reelsOverlayIds) {
            val matchedNodes = rootNode.findAccessibilityNodeInfosByViewId(id)
            if (matchedNodes != null && matchedNodes.isNotEmpty()) {
                matchedNodes.forEach { it.recycle() }
                return true
            }
        }

        // 3. Reels tab selected in bottom bar
        if (isInstagramReelsTabActive(rootNode)) {
            return true
        }

        return false
    }

    /**
     * Evaluates whether the currently displayed screen in YouTube is the full-screen Shorts player.
     */
    private fun isInsideYouTubeShorts(rootNode: AccessibilityNodeInfo): Boolean {
        // 1. High-confidence view IDs found in YouTube's Shorts player UI
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

        // 2. Shorts tab selected in bottom bar
        if (isYouTubeShortsTabActive(rootNode)) {
            return true
        }

        // 3. Action buttons unique to the YouTube Shorts feed (Remix, Sound)
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
