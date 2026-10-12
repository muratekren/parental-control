package com.family.control

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * YouTube content filter (Phase 2). Reads on-screen text inside the YouTube app
 * and blocks content whose text matches any of the family's blocked keywords.
 * NOTE: YouTube's UI changes often — expect to tune the keyword matching over time.
 */
class FilterService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString() ?: return
        if (pkg != "com.google.android.youtube") return
        val keywords = PolicyStore.policy?.keywords ?: return
        if (keywords.isEmpty()) return
        val text = collectText(rootInActiveWindow)
        val match = keywords.firstOrNull { text.contains(it, ignoreCase = true) } ?: return
        block(match)
    }

    override fun onInterrupt() {}

    private fun collectText(node: AccessibilityNodeInfo?): String {
        if (node == null) return ""
        val sb = StringBuilder()
        node.text?.let { sb.append(it).append(' ') }
        node.contentDescription?.let { sb.append(it).append(' ') }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            sb.append(collectText(child))
            child.recycle()
        }
        return sb.toString()
    }

    private fun block(keyword: String) {
        Alerts.post(this, "FILTER_BLOCK", "Blocked YouTube content matching: $keyword")
        runCatching { performGlobalAction(GLOBAL_ACTION_BACK) }
        val i = Intent(this, LockActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)
            .putExtra(LockActivity.EXTRA_REASON, "This video was filtered")
        runCatching { startActivity(i) }
    }
}