package com.family.control

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class PolicyService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private val workExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private lateinit var engine: EnforcementEngine
    private var lastHeartbeatAt = 0L
    private var receiverRegistered = false

    private val tick = object : Runnable {
        override fun run() {
            workExecutor.execute {
                runCatching { engine.enforce() }
                if (System.currentTimeMillis() - lastHeartbeatAt >= HEARTBEAT_MS) {
                    lastHeartbeatAt = System.currentTimeMillis()
                    runCatching { sync() }
                }
            }
            handler.postDelayed(this, TICK_MS)
        }
    }

    private val powerReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                PowerManager.ACTION_POWER_SAVE_MODE_CHANGED -> {
                    val saving = (getSystemService(Context.POWER_SERVICE) as PowerManager).isPowerSaveMode
                    Alerts.post(this@PolicyService, "POWER_SAVE", if (saving) "Power-save mode ON" else "Power-save mode OFF")
                    if (saving) workExecutor.execute { runCatching { engine.enforce() } }
                }
                Intent.ACTION_SCREEN_ON -> workExecutor.execute { runCatching { engine.enforce() } }
                Intent.ACTION_BATTERY_LOW ->
                    Alerts.post(this@PolicyService, "BATTERY_LOW", "Battery low — device may throttle the guard")
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        engine = EnforcementEngine(this)
        startAsForeground()
        registerPowerReceiver()
        handler.post(tick)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        unregisterPowerReceiver()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Alerts.post(this, "TASK_REMOVED", "Service task removed; restarting")
        Guard.startService(this)
        super.onTaskRemoved(rootIntent)
    }

    private fun sync() {
        if (!Prefs.configured(this)) return
        val status = HeartbeatStatus(
            adminEnabled = Guard.isAdmin(this),
            powerSave = (getSystemService(Context.POWER_SERVICE) as PowerManager).isPowerSaveMode,
            appVersion = APP_VERSION
        )
        val p = ApiClient.heartbeat(this, status) ?: ApiClient.register(this)
        if (p != null) PolicyStore.policy = p
        val events = UsageTracker.usageToday(this).map { (pkg, min) ->
            UsageEvent(pkg, UsageTracker.todayKey(), min)
        }
        if (events.isNotEmpty()) runCatching { ApiClient.reportUsage(this, events) }
    }

    // ---------- foreground / notification ----------
    private fun startAsForeground() {
        createChannel()
        val homeIntent = PendingIntent.getActivity(
            this, 0, Intent(this, HomeActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        val n = builder
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setContentIntent(homeIntent)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, n)
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(CHANNEL_ID, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW)
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
    }

    private fun registerPowerReceiver() {
        if (receiverRegistered) return
        val filter = IntentFilter().apply {
            addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_BATTERY_LOW)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(powerReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(powerReceiver, filter)
        }
        receiverRegistered = true
    }

    private fun unregisterPowerReceiver() {
        if (receiverRegistered) {
            runCatching { unregisterReceiver(powerReceiver) }
            receiverRegistered = false
        }
    }

    companion object {
        private const val TICK_MS = 10_000L
        private const val HEARTBEAT_MS = 60_000L
        private const val CHANNEL_ID = "guard_status"
        private const val NOTIF_ID = 1001
        const val APP_VERSION = "0.1.0"
    }
}