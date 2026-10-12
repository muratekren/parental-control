package com.family.control

import com.google.gson.annotations.SerializedName

// Mirrors the JSON returned by the backend /api/.../heartbeat and /policy.
data class Policy(
    val policyVersion: Int = 0,
    val appRules: List<AppRule> = emptyList(),
    val schedules: List<AppSchedule> = emptyList(),
    val keywords: List<String> = emptyList(),
    val wallet: Wallet = Wallet(),
    val chores: List<Chore> = emptyList(),
    val rewards: List<Reward> = emptyList()
)

data class AppRule(
    @SerializedName("package") val pkg: String = "",
    val ruleType: String = "ALLOW",           // ALLOW | BLOCK | LIMIT
    val dailyLimitMinutes: Int? = null,
    val schedule: List<AppWindow>? = null
)

data class AppWindow(
    val startMinutes: Int = 0,
    val endMinutes: Int = 0
)

data class AppSchedule(
    val id: Long = 0,
    val name: String = "",
    val daysMask: Int = 127,
    val startMinutes: Int = 0,
    val endMinutes: Int = 0,
    val action: String = "BLOCK_ALL"          // BLOCK_ALL | ALLOW_ONLY | BEDTIME
)

data class Wallet(val coins: Int = 0)

data class Chore(
    val id: Long = 0,
    val title: String = "",
    val coinReward: Int = 0,
    val completed: Boolean = false
)

data class Reward(
    val id: Long = 0,
    val title: String = "",
    val coinCost: Int = 0,
    val redeemed: Boolean = false
)

// Outbound payloads
data class UsageEvent(
    @SerializedName("package") val pkg: String = "",
    val date: Long = 0,
    val minutes: Long = 0
)

data class HeartbeatStatus(
    val adminEnabled: Boolean = false,
    val powerSave: Boolean = false,
    val appVersion: String = ""
)