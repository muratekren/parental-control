package com.family.control

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/**
 * Device Administrator receiver. The key tamper signals fire here:
 * - onDisabled: someone removed us (or safe mode / OEM power saver dumped admin) -> alert + restart.
 * - onLockTaskModeExiting: the child escaped the kiosk -> alert.
 */
class DeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        Alerts.post(context, "ADMIN_ENABLED", "Device admin enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Alerts.post(context, "ADMIN_DISABLED", "Device admin was disabled — possible tampering")
        Guard.startService(context)
    }

    override fun onLockTaskModeEntering(context: Context, intent: Intent, pkg: String) {
        Alerts.post(context, "LOCK_TASK_ENTER", "Lock-task (kiosk) mode entered")
    }

    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        Alerts.post(context, "LOCK_TASK_EXIT", "Lock-task (kiosk) mode exited — possible tampering")
    }
}