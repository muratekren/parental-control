package com.family.control

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class SetupActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        findViewById<EditText>(R.id.et_server).setText(Prefs.serverUrl(this))
        findViewById<EditText>(R.id.et_secret).setText(Prefs.apiSecret(this))
        findViewById<EditText>(R.id.et_name).setText(Prefs.deviceName(this))

        findViewById<Button>(R.id.btn_admin).setOnClickListener { enableAdmin() }
        findViewById<Button>(R.id.btn_usage).setOnClickListener {
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        }
        findViewById<Button>(R.id.btn_battery).setOnClickListener {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        }
        findViewById<Button>(R.id.btn_start).setOnClickListener { saveAndStart() }

        refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun saveAndStart() {
        Prefs.setServerUrl(this, findViewById<EditText>(R.id.et_server).text.toString())
        Prefs.setApiSecret(this, findViewById<EditText>(R.id.et_secret).text.toString())
        Prefs.setDeviceName(this, findViewById<EditText>(R.id.et_name).text.toString())
        Guard.startService(this)
        Thread { runCatching { ApiClient.register(this) } }.start()
        startActivity(Intent(this, HomeActivity::class.java))
    }

    private fun enableAdmin() {
        val i = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
        i.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, Guard.adminComponent(this))
        i.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Required to protect this device with limits, schedules, and content filtering.")
        startActivity(i)
    }

    private fun refreshStatus() {
        val sb = StringBuilder()
        sb.append("Device admin: ").append(if (Guard.isAdmin(this)) "✅ enabled" else "❌ not enabled").append('\n')
        sb.append("Device owner: ").append(if (Guard.isOwner(this)) "✅ yes (full protection)" else "⚠️ not owner — partial protection").append('\n')
        sb.append("Usage access: ").append(if (UsageTracker.hasUsageAccess(this)) "✅ granted" else "❌ missing").append('\n')
        sb.append("Battery exemption: ").append(if (ignoringBattery()) "✅ exempt" else "⚠️ recommended").append('\n')
        if (!Guard.isOwner(this)) {
            sb.append("\nTip: run the ADB Device Owner command (see docs/device-setup.md) for tamper-proof control.")
        }
        findViewById<TextView>(R.id.tv_status).text = sb.toString()
    }

    private fun ignoringBattery(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }
}