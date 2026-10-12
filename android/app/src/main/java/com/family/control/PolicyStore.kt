package com.family.control

/** In-memory holder for the latest policy received from the backend. */
object PolicyStore {
    @Volatile
    var policy: Policy? = null

    val version: Int
        get() = policy?.policyVersion ?: 0

    val coins: Int
        get() = policy?.wallet?.coins ?: 0
}