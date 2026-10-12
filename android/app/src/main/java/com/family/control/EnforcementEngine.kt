package com.family.control

import android.content.Context
import android.content.Intent
import java.util.Calendar

/**
 * Applies the current policy: suspends blocked apps (Device Owner only),
 * enforces daily limits and schedule windows, and shows a full-screen lock when needed.
 */
class EnforcementEngine(private val ctx: Context) {

    private val selfPkg = ctx.packageName
    private var lastSuspended: Set<String> = emptySet()
    private var lastLockAt = 0L

    fun enforce() {
        val p = PolicyStore.policy ?: return
        val foreground = UsageTracker.foregroundPackage(ctx)
        val blockWindow = inBlockWindow(p)
        val allowed = p.appRules.filter { it.ruleType == "ALLOW" }.map { it.pkg }.toSet() + selfPkg

        // 1) Decide which packages to suspend.
        val toSuspend = HashSet<String>()
        for (rule in p.appRules) {
            when (rule.ruleType) {
                "BLOCK" -> toSuspend.add(rule.pkg)
                "LIMIT" -> {
                    val used = UsageTracker.minutesToday(ctx, rule.pkg)
                    val limit = rule.dailyLimitMinutes ?: 0
                    if (limit > 0 && used >= limit) toSuspend.add(rule.pkg)
                    if (blockWindow) toSuspend.add(rule.pkg)
                }
            }
        }
        toSuspend.remove(selfPkg)
        applySuspension(toSuspend)

        // 2) If a blocked app is in the foreground, bounce to the lock screen.
        val blockedForeground = if (foreground == null) {
            false
        } else if (blockWindow) {
            foreground !in allowed
        } else {
            foreground in toSuspend
        }
        if (blockedForeground) {
            val reason = if (blockWindow) "Time's up for now" else "Daily limit reached"
            showLock(reason)
        }
    }

    private fun applySuspension(desired: Set<String>) {
        if (!Guard.isOwner(ctx)) return          // suspension requires Device Owner
        val toSuspend = desired - lastSuspended
        val toResume = lastSuspended - desired
        val dpm = Guard.dpm(ctx)
        val admin = Guard.adminComponent(ctx)
        runCatching {
            if (toSuspend.isNotEmpty()) dpm.setPackagesSuspended(admin, toSuspend.toTypedArray(), true)
            if (toResume.isNotEmpty()) dpm.setPackagesSuspended(admin, toResume.toTypedArray(), false)
        }
        lastSuspended = desired
    }

    private fun showLock(reason: String) {
        val now = System.currentTimeMillis()
        if (now - lastLockAt < 5_000L) return
        lastLockAt = now
        val i = Intent(ctx, LockActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)
            .putExtra(LockActivity.EXTRA_REASON, reason)
        runCatching { ctx.startActivity(i) }
    }

    // ---------- schedule helpers ----------
    private fun inBlockWindow(p: Policy): Boolean =
        p.schedules.any { s ->
            (s.action == "BLOCK_ALL" || s.action == "BEDTIME") &&
                (s.daysMask and currentDayBit()) != 0 &&
                withinWindow(s.startMinutes, s.endMinutes, nowMinutes())
        }

    private fun nowMinutes(): Int {
        val c = Calendar.getInstance()
        return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE)
    }

    private fun currentDayBit(): Int {
        val c = Calendar.getInstance()
        return 1 shl (c.get(Calendar.DAY_OF_WEEK) - 1) // 0 = Sunday .. 6 = Saturday
    }

    private fun withinWindow(start: Int, end: Int, now: Int): Boolean =
        if (start <= end) now in start..end else now >= start || now <= end
}