package com.family.control

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restarts the protection service after a reboot (including OEM quick-boot variants). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON" -> Guard.startService(context)
        }
    }
}