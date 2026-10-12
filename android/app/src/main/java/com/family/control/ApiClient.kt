package com.family.control

import android.content.Context
import com.google.gson.Gson
import com.google.gson.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

object ApiClient {
    private val gson = Gson()
    private val JSON = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private fun base(ctx: Context): String = Prefs.serverUrl(ctx).trimEnd('/')

    private fun post(ctx: Context, path: String, body: Map<String, Any?>): JsonObject? = runCatching {
        val url = base(ctx) + path
        val rb = gson.toJson(body).toRequestBody(JSON)
        val req = Request.Builder()
            .url(url)
            .addHeader("x-api-key", Prefs.apiSecret(ctx))
            .post(rb)
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return null
            val text = resp.body?.string() ?: return null
            gson.fromJson(text, JsonObject::class.java)
        }
    }.getOrNull()

    fun register(ctx: Context): Policy? {
        val body = mapOf(
            "device_id" to Prefs.deviceId(ctx),
            "name" to Prefs.deviceName(ctx),
            "model" to android.os.Build.MODEL
        )
        val resp = post(ctx, "/devices/register", body) ?: return null
        return gson.fromJson(resp.get("policy"), Policy::class.java)
    }

    fun heartbeat(ctx: Context, status: HeartbeatStatus): Policy? {
        val body = mapOf(
            "adminEnabled" to status.adminEnabled,
            "powerSave" to status.powerSave,
            "appVersion" to status.appVersion
        )
        val resp = post(ctx, "/devices/${Prefs.deviceId(ctx)}/heartbeat", body) ?: return null
        return gson.fromJson(resp.get("policy"), Policy::class.java)
    }

    fun reportUsage(ctx: Context, events: List<UsageEvent>): Boolean {
        val body = mapOf("events" to events)
        return post(ctx, "/devices/${Prefs.deviceId(ctx)}/report", body) != null
    }

    fun sendAlert(ctx: Context, type: String, message: String): Boolean {
        val body = mapOf("type" to type, "message" to message)
        return post(ctx, "/devices/${Prefs.deviceId(ctx)}/alert", body) != null
    }
}