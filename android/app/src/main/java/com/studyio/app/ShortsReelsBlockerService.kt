package com.studyio.app

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Android Accessibility Service for study.io Digital Wellbeing.
 * Targets Instagram (com.instagram.android) and YouTube (com.google.android.youtube)
 * to block Reels and Shorts during active focus sessions.
 *
 * Requirements:
 * 1. Never close Instagram on launch or during feed/DM browsing.
 * 2. Allow watching single Reels sent in Direct Messages (DMs).
 * 3. Block clicking the dedicated Reels and Shorts bottom navigation bar tabs.
 * 4. Anti-Doomscrolling: If the user tries to scroll/swipe away from a single reel to the next reel,
 *    trigger performGlobalAction(GLOBAL_ACTION_BACK) to return to DM chat.
 */
class ShortsReelsBlockerService : AccessibilityService() {

    companion object {
        private const val TAG = "ShortsReelsBlocker"
        const val PREFS_NAME = "studyio_accessibility_blocker_prefs"
        const val KEY_ENABLED = "is_blocker_enabled"

        private const val PKG_INSTAGRAM = "com.instagram.android"
        private const val PKG_YOUTUBE = "com.google.android.youtube"

        // Cooldown between back actions to prevent infinite/rapid consecutive back presses
        private const val BACK_ACTION_COOLDOWN_MS = 1000L
        private var lastBackActionTime = 0L

        // Grace period after opening a reel viewer so initial layout/rendering does not trigger back
        private const val REEL_OPEN_GRACE_PERIOD_MS = 1500L
        private var lastReelViewerOpenTime = 0L

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
        val packageName = event.packageName?.toString() ?: return

        // 1. Instagram Reels & YouTube Shorts Blocker
        if (packageName == PKG_INSTAGRAM || packageName == PKG_YOUTUBE) {
            if (!isBlockerEnabled(this)) return
            when (event.eventType) {
                // Block clicking dedicated Reels or Shorts bottom navigation bar tabs
                AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                    handleViewClicked(event, packageName)
                }

                // Anti-Doomscrolling: Block scrolling away from a single reel to the next video
                AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                    handleViewScrolled(event, packageName)
                }

                // Detect window transitions (entering reel viewer, or startup redirect)
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                    handleWindowStateChanged(event, packageName)
                }
            }
            return
        }

        // 2. Ultra Strict Uninstall & Turn-Off Protection
        if (StudyDeviceAdminReceiver.isUltraStrictSessionActive(this)) {
            handleUninstallProtectionEvent(event, packageName)
        }
    }

    private var lastUninstallBlockTime = 0L

    private fun handleUninstallProtectionEvent(event: AccessibilityEvent, packageName: String) {
        val now = SystemClock.uptimeMillis()
        if (now - lastUninstallBlockTime < 600L) return

        val lowerPkg = packageName.lowercase()
        val isTargetPkg = lowerPkg == "com.android.settings" ||
                lowerPkg.contains("packageinstaller") ||
                lowerPkg.contains("safecenter") ||
                lowerPkg.contains("securitycenter") ||
                lowerPkg.contains("systemmanager") ||
                lowerPkg == "com.android.vending"

        if (!isTargetPkg) return

        var shouldBlock = false

        if (lowerPkg.contains("packageinstaller")) {
            shouldBlock = true
        } else if (lowerPkg == "com.android.settings") {
            val root = rootInActiveWindow
            if (root != null) {
                try {
                    shouldBlock = inspectNodeForSettingsBypass(root)
                } finally {
                    root.recycle()
                }
            } else {
                shouldBlock = true
            }
        } else if (lowerPkg == "com.android.vending") {
            val root = rootInActiveWindow
            if (root != null) {
                try {
                    shouldBlock = inspectNodeForPlayStoreBypass(root)
                } finally {
                    root.recycle()
                }
            }
        } else {
            shouldBlock = true
        }

        if (shouldBlock) {
            lastUninstallBlockTime = now
            Log.w(TAG, "Ultra Strict Uninstall Protection triggered in Accessibility for $packageName. Blocking.")
            performGlobalAction(GLOBAL_ACTION_HOME)
            try {
                val blockIntent = Intent(this, BlockedAppActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_CLEAR_TOP or
                            Intent.FLAG_ACTIVITY_NO_ANIMATION or
                            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP
                    putExtra(BlockedAppActivity.EXTRA_BLOCKED_PACKAGE, packageName)
                    putExtra(BlockedAppActivity.EXTRA_BLOCKED_NAME, "Settings & App Management")
                    putExtra(BlockedAppActivity.EXTRA_IS_ULTRA, true)
                    putExtra(BlockedAppActivity.EXTRA_IS_SETTINGS_OR_UNINSTALL, true)
                }
                startActivity(blockIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start BlockedAppActivity from accessibility", e)
            }
        }
    }

    private fun inspectNodeForSettingsBypass(node: AccessibilityNodeInfo): Boolean {
        val text = node.text?.toString()?.lowercase() ?: ""
        val desc = node.contentDescription?.toString()?.lowercase() ?: ""
        val combined = "$text $desc"

        if (combined.contains("study.io") ||
            combined.contains("com.studyio.app") ||
            combined.contains("uninstall") ||
            combined.contains("force stop") ||
            combined.contains("clear storage") ||
            combined.contains("clear data") ||
            combined.contains("device admin") ||
            combined.contains("accessibility")) {
            return true
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                if (inspectNodeForSettingsBypass(child)) return true
            } finally {
                child.recycle()
            }
        }
        return false
    }

    private fun inspectNodeForPlayStoreBypass(node: AccessibilityNodeInfo): Boolean {
        val text = node.text?.toString()?.lowercase() ?: ""
        val desc = node.contentDescription?.toString()?.lowercase() ?: ""
        val combined = "$text $desc"

        if ((combined.contains("study.io") || combined.contains("com.studyio.app")) &&
            (combined.contains("uninstall") || combined.contains("open"))) {
            return true
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                if (inspectNodeForPlayStoreBypass(child)) return true
            } finally {
                child.recycle()
            }
        }
        return false
    }

    override fun onInterrupt() {
        Log.w(TAG, "ShortsReelsBlockerService interrupted by system.")
    }

    /**
     * Requirement 3: Block Bottom Navigation Bar Tabs
     * Detects if the user taps the dedicated Reels or Shorts tab button in the bottom navigation bar.
     * Clicks on media cards inside Direct Message (DM) chat threads are explicitly permitted.
     */
    private fun handleViewClicked(event: AccessibilityEvent, packageName: String) {
        val sourceNode = event.source ?: return
        try {
            if (isBottomReelsOrShortsTab(sourceNode, packageName)) {
                Log.i(TAG, "Blocked click on Reels/Shorts bottom tab in $packageName. Triggering action.")
                if (packageName == PKG_INSTAGRAM) {
                    // Try redirecting directly to Home feed tab if possible, else trigger BACK
                    val root = rootInActiveWindow
                    if (root != null) {
                        try {
                            val feedTabNodes = root.findAccessibilityNodeInfosByViewId("com.instagram.android:id/feed_tab")
                            if (feedTabNodes.isNotEmpty()) {
                                feedTabNodes[0].performAction(AccessibilityNodeInfo.ACTION_CLICK)
                                feedTabNodes.forEach { it.recycle() }
                                return
                            }
                        } finally {
                            root.recycle()
                        }
                    }
                }
                triggerBackAction()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error evaluating clicked node", e)
        } finally {
            sourceNode.recycle()
        }
    }

    /**
     * Requirement 4: Anti-Doomscrolling (Block scrolling away from single reel)
     * When watching a reel sent in DMs, the user is permitted to watch and loop that reel.
     * If the user swipes up/down to scroll to the NEXT reel, triggers GLOBAL_ACTION_BACK
     * to return the user directly to the DM chat.
     */
    private fun handleViewScrolled(event: AccessibilityEvent, packageName: String) {
        val now = SystemClock.uptimeMillis()

        // 1. Enforce initial grace period so loading/settling does not trigger back
        if (now - lastReelViewerOpenTime < REEL_OPEN_GRACE_PERIOD_MS) {
            return
        }

        // 2. Cooldown check
        if (now - lastBackActionTime < BACK_ACTION_COOLDOWN_MS) {
            return
        }

        val source = event.source ?: return
        try {
            val sourceId = source.viewIdResourceName ?: ""
            val sourceClass = source.className?.toString() ?: ""

            val isPagerScrolled = when (packageName) {
                PKG_INSTAGRAM -> isInstagramReelsPagerScrolled(source, sourceId, sourceClass)
                PKG_YOUTUBE -> isYouTubeShortsPagerScrolled(source, sourceId, sourceClass)
                else -> false
            }

            if (isPagerScrolled) {
                Log.i(TAG, "Anti-doomscrolling: User swiped away from single reel in $packageName. Returning to DM.")
                triggerBackAction()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error evaluating scroll event", e)
        } finally {
            source.recycle()
        }
    }

    /**
     * Handles window transitions:
     * - When entering the full-screen reel viewer (e.g. from DM), activate grace period.
     * - If Instagram restores on startup with Reels tab selected, redirect to Home feed
     *   instead of triggering BACK (which would exit Instagram).
     */
    private fun handleWindowStateChanged(event: AccessibilityEvent, packageName: String) {
        val rootNode = rootInActiveWindow ?: return
        try {
            if (packageName == PKG_INSTAGRAM) {
                // Check if user entered full-screen clips viewer (e.g. from DM)
                val isViewer = rootNode.findAccessibilityNodeInfosByViewId("com.instagram.android:id/clips_viewer_root").isNotEmpty() ||
                               rootNode.findAccessibilityNodeInfosByViewId("com.instagram.android:id/clips_viewer_fragment_container").isNotEmpty() ||
                               rootNode.findAccessibilityNodeInfosByViewId("com.instagram.android:id/clips_video_container").isNotEmpty()

                val hasFeedTab = rootNode.findAccessibilityNodeInfosByViewId("com.instagram.android:id/feed_tab").isNotEmpty()

                if (isViewer && !hasFeedTab) {
                    lastReelViewerOpenTime = SystemClock.uptimeMillis()
                    Log.d(TAG, "Entered full-screen Instagram Reels viewer. Grace period active.")
                    return
                }

                // If user lands on the Reels tab in bottom navigation bar on startup:
                // Redirect to Home tab instead of pressing BACK (which would close Instagram)
                val clipsTabNodes = rootNode.findAccessibilityNodeInfosByViewId("com.instagram.android:id/clips_tab")
                if (clipsTabNodes.isNotEmpty()) {
                    val isClipsSelected = clipsTabNodes.any { it.isSelected }
                    clipsTabNodes.forEach { it.recycle() }

                    if (isClipsSelected) {
                        val feedTabNodes = rootNode.findAccessibilityNodeInfosByViewId("com.instagram.android:id/feed_tab")
                        if (feedTabNodes.isNotEmpty()) {
                            Log.i(TAG, "Reels tab was selected on startup. Redirecting to Home feed.")
                            feedTabNodes[0].performAction(AccessibilityNodeInfo.ACTION_CLICK)
                            feedTabNodes.forEach { it.recycle() }
                            return
                        }
                    }
                }
            } else if (packageName == PKG_YOUTUBE) {
                val isShorts = rootNode.findAccessibilityNodeInfosByViewId("com.google.android.youtube:id/shorts_container").isNotEmpty() ||
                               rootNode.findAccessibilityNodeInfosByViewId("com.google.android.youtube:id/reel_player_view").isNotEmpty()
                val hasPivotBar = rootNode.findAccessibilityNodeInfosByViewId("com.google.android.youtube:id/pivot_bar").isNotEmpty()

                if (isShorts && !hasPivotBar) {
                    lastReelViewerOpenTime = SystemClock.uptimeMillis()
                    Log.d(TAG, "Entered full-screen YouTube Shorts viewer. Grace period active.")
                    return
                }

                val pivotShortsNodes = rootNode.findAccessibilityNodeInfosByViewId("com.google.android.youtube:id/pivot_shorts")
                if (pivotShortsNodes.isNotEmpty()) {
                    val isShortsSelected = pivotShortsNodes.any { it.isSelected }
                    pivotShortsNodes.forEach { it.recycle() }

                    if (isShortsSelected) {
                        Log.i(TAG, "Shorts tab selected. Triggering BACK.")
                        triggerBackAction()
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error evaluating window state", e)
        } finally {
            rootNode.recycle()
        }
    }

    /**
     * Determines whether the scrolled view is the vertical Reels ViewPager in full-screen mode.
     * Critically ensures Home feed and DM chat scrolling are NEVER intercepted.
     */
    private fun isInstagramReelsPagerScrolled(source: AccessibilityNodeInfo, sourceId: String, sourceClass: String): Boolean {
        // High confidence: view ID specifically contains clips view pager
        if (sourceId.contains("clips_viewer_view_pager", ignoreCase = true) ||
            sourceId.contains("clips_view_pager", ignoreCase = true)
        ) {
            return true
        }

        // If it's a ViewPager or RecyclerView, verify it is inside the full-screen reel player
        if (sourceClass.contains("ViewPager", ignoreCase = true) ||
            sourceClass.contains("RecyclerView", ignoreCase = true)
        ) {
            val root = rootInActiveWindow ?: return false
            try {
                // Must have clips viewer element
                val hasClipsViewer = root.findAccessibilityNodeInfosByViewId("com.instagram.android:id/clips_viewer_root").isNotEmpty() ||
                                     root.findAccessibilityNodeInfosByViewId("com.instagram.android:id/clips_viewer_fragment_container").isNotEmpty() ||
                                     root.findAccessibilityNodeInfosByViewId("com.instagram.android:id/clips_video_container").isNotEmpty()

                // And MUST NOT be the main feed (feed_tab is only present when bottom bar is visible)
                val hasFeedTab = root.findAccessibilityNodeInfosByViewId("com.instagram.android:id/feed_tab").isNotEmpty()

                // And MUST NOT be a DM conversation
                val isDirectChat = root.findAccessibilityNodeInfosByViewId("com.instagram.android:id/direct_thread_list").isNotEmpty() ||
                                   root.findAccessibilityNodeInfosByViewId("com.instagram.android:id/row_thread_composer").isNotEmpty()

                return hasClipsViewer && !hasFeedTab && !isDirectChat
            } finally {
                root.recycle()
            }
        }

        return false
    }

    /**
     * Determines whether the scrolled view is the YouTube Shorts vertical pager.
     */
    private fun isYouTubeShortsPagerScrolled(source: AccessibilityNodeInfo, sourceId: String, sourceClass: String): Boolean {
        if (sourceId.contains("shorts_container", ignoreCase = true) ||
            sourceId.contains("reel_recycler", ignoreCase = true) ||
            sourceId.contains("reel_player_page_view", ignoreCase = true)
        ) {
            return true
        }

        if (sourceClass.contains("ViewPager", ignoreCase = true) ||
            sourceClass.contains("RecyclerView", ignoreCase = true)
        ) {
            val root = rootInActiveWindow ?: return false
            try {
                val hasShortsPlayer = root.findAccessibilityNodeInfosByViewId("com.google.android.youtube:id/reel_player_view").isNotEmpty() ||
                                      root.findAccessibilityNodeInfosByViewId("com.google.android.youtube:id/shorts_container").isNotEmpty()
                val hasPivotBar = root.findAccessibilityNodeInfosByViewId("com.google.android.youtube:id/pivot_bar").isNotEmpty()

                return hasShortsPlayer && !hasPivotBar
            } finally {
                root.recycle()
            }
        }

        return false
    }

    /**
     * Inspects a clicked node to check if it is the dedicated Reels or Shorts tab
     * in the bottom navigation bar.
     * Accurately distinguishes between the bottom bar tab and messages/cards in DMs.
     */
    private fun isBottomReelsOrShortsTab(node: AccessibilityNodeInfo, packageName: String): Boolean {
        val viewId = node.viewIdResourceName ?: ""
        val desc = node.contentDescription?.toString() ?: ""
        val text = node.text?.toString() ?: ""

        if (packageName == PKG_INSTAGRAM) {
            // Direct viewId match on Instagram's bottom tab
            if (viewId.contains("clips_tab", ignoreCase = true) || viewId.contains("reels_tab", ignoreCase = true)) {
                return true
            }

            // Content description match ONLY if node is verified to be in the bottom navigation bar
            if (desc.equals("Reels", ignoreCase = true) || desc.equals("Reels tab", ignoreCase = true) || text.equals("Reels", ignoreCase = true)) {
                // Ignore chat messages and cards
                if (viewId.contains("message", ignoreCase = true) ||
                    viewId.contains("direct", ignoreCase = true) ||
                    viewId.contains("chat", ignoreCase = true) ||
                    viewId.contains("row", ignoreCase = true) ||
                    viewId.contains("bubble", ignoreCase = true)
                ) {
                    return false
                }

                // Check parent for navigation bar structure or sibling tabs (Home, Search, Profile)
                val parent = node.parent
                if (parent != null) {
                    try {
                        val parentId = parent.viewIdResourceName ?: ""
                        if (parentId.contains("tab", ignoreCase = true) ||
                            parentId.contains("bar", ignoreCase = true) ||
                            parentId.contains("nav", ignoreCase = true)
                        ) {
                            return true
                        }
                        for (i in 0 until parent.childCount) {
                            val sib = parent.getChild(i) ?: continue
                            try {
                                val sId = sib.viewIdResourceName ?: ""
                                val sDesc = sib.contentDescription?.toString() ?: ""
                                if (sId.contains("feed_tab", ignoreCase = true) ||
                                    sId.contains("search_tab", ignoreCase = true) ||
                                    sId.contains("profile_tab", ignoreCase = true) ||
                                    sDesc.contains("Home", ignoreCase = true) ||
                                    sDesc.contains("Search", ignoreCase = true) ||
                                    sDesc.contains("Profile", ignoreCase = true)
                                ) {
                                    return true
                                }
                            } finally {
                                sib.recycle()
                            }
                        }
                    } finally {
                        parent.recycle()
                    }
                }
            }
        } else if (packageName == PKG_YOUTUBE) {
            if (viewId.contains("pivot_shorts", ignoreCase = true)) {
                return true
            }
            if (desc.equals("Shorts", ignoreCase = true) || desc.equals("Shorts tab", ignoreCase = true) || text.equals("Shorts", ignoreCase = true)) {
                val parent = node.parent
                if (parent != null) {
                    try {
                        val parentId = parent.viewIdResourceName ?: ""
                        if (parentId.contains("pivot", ignoreCase = true) ||
                            parentId.contains("bar", ignoreCase = true) ||
                            parentId.contains("nav", ignoreCase = true)
                        ) {
                            return true
                        }
                        for (i in 0 until parent.childCount) {
                            val sib = parent.getChild(i) ?: continue
                            try {
                                val sDesc = sib.contentDescription?.toString() ?: ""
                                if (sDesc.contains("Home", ignoreCase = true) ||
                                    sDesc.contains("Subscriptions", ignoreCase = true)
                                ) {
                                    return true
                                }
                            } finally {
                                sib.recycle()
                            }
                        }
                    } finally {
                        parent.recycle()
                    }
                }
            }
        }

        // Recursively inspect shallow direct children (e.g. icon or badge inside tab)
        val childCount = node.childCount
        for (i in 0 until childCount) {
            val child = node.getChild(i) ?: continue
            try {
                if (isBottomReelsOrShortsTab(child, packageName)) {
                    return true
                }
            } finally {
                child.recycle()
            }
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
