package com.family.control

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class LockActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_REASON = "reason"
    }

    private val handler = Handler(Looper.getMainLooper())

    private val clockRunner = object : Runnable {
        override fun run() {
            updateClock()
            handler.postDelayed(this, 30_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_lock)

        val reason = intent.getStringExtra(EXTRA_REASON) ?: "Time's up ✋"
        findViewById<TextView>(R.id.tv_lock_title).text = reason

        val coins = PolicyStore.coins
        findViewById<TextView>(R.id.tv_lock_coins).text =
            if (coins > 0) "You have $coins coins saved 🪙 — chores earn you screen time back" else ""

        findViewById<Button>(R.id.btn_lock_ok).setOnClickListener { goHome() }
        updateClock()
    }

    override fun onResume() {
        super.onResume()
        handler.post(clockRunner)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(clockRunner)
    }

    private fun updateClock() {
        findViewById<TextView>(R.id.tv_lock_clock).text =
            SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
    }

    private fun goHome() {
        startActivity(
            Intent(this, HomeActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
        finish()
    }

    // Block the hardware/screen back button so the lock screen can't be bypassed.
    override fun onBackPressed() { /* swallowed */ }
}