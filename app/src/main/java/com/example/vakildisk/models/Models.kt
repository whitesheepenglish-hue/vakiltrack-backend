package com.example.vakildisk.models

import com.google.firebase.Timestamp

enum class UserRole {
    SENIOR, JUNIOR
}

data class User(
    val userId: String = "",
    val name: String = "",
    val phone: String = "",
    val role: UserRole = UserRole.SENIOR,
    val seniorId: String? = null,
    val fcmToken: String? = null
)

data class Case(
    val caseId: String = "",
    val caseNumber: String = "",
    val clientName: String = "",
    val clientPhone: String = "",
    val courtName: String = "",
    val seniorId: String = "",
    val juniorId: String? = null,
    val nextHearingDate: Timestamp? = null,
    val caseStatus: String = "ACTIVE",
    val createdAt: Timestamp = Timestamp.now()
)

data class Hearing(
    val hearingId: String = "",
    val caseId: String = "",
    val hearingDate: Timestamp? = null,
    val status: String = "PENDING",
    val notes: String = "",
    val updatedBy: String = ""
)
