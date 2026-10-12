package com.family.control

import android.content.Context
import android.os.Build
import java.util.UUID

object Prefs {
    private const val FILE = "guard_prefs"
    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun deviceId(ctx: Context): String {
        val sp = sp(ctx)
        var id = sp.getString("device_id", null)
        if (id == null) {
            id = UUID.randomUUID().toString()
            sp.edit().putString("device_id", id).apply()
        }
        return id
    }

    fun serverUrl(ctx: Context): String =
        sp(ctx).getString("server_url", "") ?: ""

    fun setServerUrl(ctx: Context, url: String) =
        sp(ctx).edit().putString("server_url", url.trim()).apply()

    fun apiSecret(ctx: Context): String =
        sp(ctx).getString("api_secret", "") ?: ""

    fun setApiSecret(ctx: Context, secret: String) =
        sp(ctx).edit().putString("api_secret", secret.trim()).apply()

    fun deviceName(ctx: Context): String =
        sp(ctx).getString("device_name", Build.MODEL) ?: Build.MODEL

    fun setDeviceName(ctx: Context, name: String) =
        sp(ctx).edit().putString("device_name", name.trim()).apply()

    fun configured(ctx: Context): Boolean =
        serverUrl(ctx).isNotBlank() && apiSecret(ctx).isNotBlank()
}