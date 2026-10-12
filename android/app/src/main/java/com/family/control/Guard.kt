package com.family.control

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build

object Guard {
    fun adminComponent(ctx: Context): ComponentName =
        ComponentName(ctx, DeviceAdminReceiver::class.java)

    fun dpm(ctx: Context): DevicePolicyManager =
        ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    fun isAdmin(ctx: Context): Boolean =
        dpm(ctx).isAdminActive(adminComponent(ctx))

    fun isOwner(ctx: Context): Boolean =
        isAdmin(ctx) && dpm(ctx).isDeviceOwnerApp(ctx.packageName)

    fun startService(ctx: Context) {
        val intent = Intent(ctx, PolicyService::class.java)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent)
            } else {
                ctx.startService(intent)
            }
        } catch (_: Exception) {
            // Ignore: e.g. ForegroundServiceStartNotAllowedException while app backgrounded;
            // the sticky service and boot receiver will retry.
        }
    }
}