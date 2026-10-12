package com.family.control

import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class RewardsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_rewards)
        findViewById<Button>(R.id.btn_back).setOnClickListener { finish() }
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    private fun render() {
        val p = PolicyStore.policy
        findViewById<TextView>(R.id.tv_balance).text = "🪙 ${p?.wallet?.coins ?: 0}"

        val chores = findViewById<LinearLayout>(R.id.chores_list)
        chores.removeAllViews()
        if (p == null || p.chores.isEmpty()) {
            chores.addView(emptyText("No chores yet — nice! 🎉"))
        } else {
            p.chores.forEach { chores.addView(choreRow(it)) }
        }

        val rewards = findViewById<LinearLayout>(R.id.rewards_list)
        rewards.removeAllViews()
        if (p == null || p.rewards.isEmpty()) {
            rewards.addView(emptyText("No rewards yet — ask your parent to add some."))
        } else {
            p.rewards.forEach { rewards.addView(rewardRow(it)) }
        }
    }

    private fun choreRow(c: Chore): LinearLayout {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val prefix = if (c.completed) "✅ " else "☐ "
        row.addView(
            TextView(this).apply {
                text = "$prefix${c.title}  ·  +${c.coinReward} \uD83E\uDE99"
                setTextColor(getColor(R.color.text))
                textSize = 15f
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        if (!c.completed) {
            row.addView(
                Button(this).apply {
                    text = "I did it"
                    setOnClickListener {
                        Alerts.post(this@RewardsActivity, "CHORE_REQUEST", "Child asks to confirm: ${c.title}")
                        text = "Asked!"
                        isEnabled = false
                    }
                }
            )
        }
        return row
    }

    private fun rewardRow(r: Reward): LinearLayout {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row.addView(
            TextView(this).apply {
                text = "${if (r.redeemed) "🎉 " else ""}${r.title}  ·  ${r.coinCost} \uD83E\uDE99"
                setTextColor(getColor(R.color.text))
                textSize = 15f
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        if (!r.redeemed) {
            row.addView(
                Button(this).apply {
                    text = "Ask parent"
                    setOnClickListener {
                        Alerts.post(this@RewardsActivity, "REWARD_REQUEST", "Child wants to redeem: ${r.title}")
                        text = "Asked!"
                        isEnabled = false
                    }
                }
            )
        }
        return row
    }

    private fun emptyText(s: String): TextView = TextView(this).apply {
        text = s
        setTextColor(getColor(R.color.muted))
        setPadding(0, 8, 0, 8)
    }
}