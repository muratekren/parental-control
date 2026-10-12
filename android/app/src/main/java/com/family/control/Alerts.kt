package com.family.control

import android.content.Context

object Alerts {
    /** Fire-and-forget tamper/event reporting to the backend. */
    fun post(ctx: Context, type: String, message: String) {
        Thread {
            runCatching { ApiClient.sendAlert(ctx, type, message) }
        }.start()
    }
}