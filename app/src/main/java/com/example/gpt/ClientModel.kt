package com.example.gpt

data class ClientModel(
    val id: String = "",
    val name: String = "",
    val phone: String = "",
    val email: String = "",
    val address: String = "",
    val totalFee: Double = 0.0,
    val paidFee: Double = 0.0,
    val pendingFee: Double = 0.0,
    val activeCases: Int = 0,
    val nextHearingDate: String = "",
    val caseStage: String = "",
    val createdAt: Long = System.currentTimeMillis()
)
