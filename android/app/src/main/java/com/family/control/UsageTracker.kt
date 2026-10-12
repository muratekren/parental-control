package com.family.control

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process
import java.util.Calendar

object UsageTracker {
    private fun usm(ctx: Context) =
        ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

    fun hasUsageAccess(ctx: Context): Boolean {
        val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    fun startOfDay(): Long {
        val c = Calendar.getInstance()
        c.set(Calendar.HOUR_OF_DAY, 0)
        c.set(Calendar.MINUTE, 0)
        c.set(Calendar.SECOND, 0)
        c.set(Calendar.MILLISECOND, 0)
        return c.timeInMillis
    }

    /** YYYYMMDD integer key used by the backend for the usage roll-up. */
    fun todayKey(): Long {
        val c = Calendar.getInstance()
        return (c.get(Calendar.YEAR) * 10_000L +
            (c.get(Calendar.MONTH) + 1) * 100L +
            c.get(Calendar.DAY_OF_MONTH))
    }

    /** Best-effort foreground package via most-recently-used in the last 2 minutes. */
    fun foregroundPackage(ctx: Context): String? = runCatching {
        val now = System.currentTimeMillis()
        val stats = usm(ctx).queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 120_000, now)
        stats?.maxByOrNull { it.lastTimeUsed }?.packageName
    }.getOrNull()

    /** Minutes spent in foreground today for a given package. */
    fun minutesToday(ctx: Context, pkg: String): Long {
        val now = System.currentTimeMillis()
        val stats = usm(ctx).queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startOfDay(), now) ?: return 0
        return (stats.firstOrNull { it.packageName == pkg }?.totalTimeInForeground ?: 0L) / 60_000L
    }

    /** All packages with their minutes-in-foreground today. */
    fun usageToday(ctx: Context): Map<String, Long> {
        val now = System.currentTimeMillis()
        val stats = usm(ctx).queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startOfDay(), now) ?: return emptyMap()
        val map = HashMap<String, Long>()
        stats.forEach { if (it.totalTimeInForeground > 0) map[it.packageName] = it.totalTimeInForeground / 60_000L }
        return map
    }
}