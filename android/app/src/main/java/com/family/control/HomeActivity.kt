package com.family.control

import android.content.Intent
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class HomeActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_home)
        findViewById<Button>(R.id.btn_rewards).setOnClickListener {
            startActivity(Intent(this, RewardsActivity::class.java))
        }
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    private fun render() {
        val p = PolicyStore.policy
        findViewById<TextView>(R.id.tv_coins).text = "🪙 ${p?.wallet?.coins ?: 0}"
        findViewById<TextView>(R.id.tv_summary).text =
            if (p == null) "Waiting for first sync…" else "Guard active · policy v${p.policyVersion}"

        val grid = findViewById<LinearLayout>(R.id.app_grid)
        grid.removeAllViews()
        val allowed = p?.appRules?.filter { it.ruleType == "ALLOW" }?.map { it.pkg } ?: emptyList()
        if (allowed.isEmpty()) {
            grid.addView(label("No allowed apps yet. Ask your parent to add some.", getColor(R.color.muted)))
        } else {
            allowed.forEach { pkg -> grid.addView(appButton(pkg)) }
        }
    }

    private fun appButton(pkg: String): Button {
        val b = Button(this)
        b.text = appLabel(pkg)
        b.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        b.setOnClickListener {
            runCatching { startActivity(packageManager.getLaunchIntentForPackage(pkg)) }
        }
        return b
    }

    private fun label(text: String, color: Int): TextView = TextView(this).apply {
        this.text = text
        setTextColor(color)
        textSize = 14f
    }

    private fun appLabel(pkg: String): String = runCatching {
        val ai = packageManager.getApplicationInfo(pkg, 0)
        packageManager.getApplicationLabel(ai).toString()
    }.getOrDefault(pkg)
}