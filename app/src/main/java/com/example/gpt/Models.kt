package com.example.gpt

import com.google.firebase.Timestamp

enum class UserRole {
    SENIOR, JUNIOR
}

/**
 * Single source of truth for all Data Models.
 */
data class CaseModel(
    val id: String = "",
    val caseNumber: String = "",
    val cnrNumber: String = "",
    val caseYear: String = "",
    val caseType: String = "",
    val caseDisplayNumber: String = "",
    val petitioner: String = "",
    val respondent: String = "",
    val clientName: String = "",
    val clientPhone: String = "",
    val courtName: String = "",
    val district: String = "",
    val filingDate: Long = 0L,
    val hearingDate: Long = 0L,
    val hearingStatus: String = "Filed",
    val nextHearingDate: String = "",
    val purpose: String = "",
    val status: String = "ACTIVE",
    val advocateId: String = "",
    val seniorLawyerUID: String? = null,
    val juniorLawyerUIDs: List<String> = emptyList(),
    val createdAt: Timestamp = Timestamp.now(),
    val updatedAt: Long = System.currentTimeMillis(),
    val lastSyncedAt: Long = System.currentTimeMillis(),
    val tasks: MutableList<TaskModel> = mutableListOf()
)

data class CaseStats(
    val active: Int = 0,
    val upcoming: Int = 0,
    val disposed: Int = 0
)

sealed class DashboardUiState {
    object Loading : DashboardUiState()
    data class Success(
        val todayHearings: List<CaseModel>,
        val upcomingHearings: List<CaseModel>,
        val stats: CaseStats
    ) : DashboardUiState()
    data class Error(val message: String) : DashboardUiState()
    object Empty : DashboardUiState()
}

data class UserModel(
    val id: String = "",
    val userId: String = "", // For compatibility with older code
    val name: String = "",
    val phone: String = "",
    val role: String = "SENIOR",
    val seniorId: String? = null,
    val fcmToken: String = "",
    val officeName: String = "",
    val district: String = "",
    val profileCompleted: Boolean = false,
    val photoUrl: String? = null,
    val createdAt: Timestamp = Timestamp.now()
)

data class UiCaseModel(
    val case: CaseModel,
    val clientName: String,
    val juniorName: String? = null
)

data class HearingModel(
    val id: String = "",
    val hearingId: String = "", // For compatibility
    val caseId: String = "",
    val caseNumber: String = "",
    val hearingDate: Long = 0L,
    val hearingTime: String = "",
    val hearingStatus: String = "Pending",
    val purpose: String = "",
    val date: String = "",
    val notes: String = "",
    val updatedAt: Long = 0L,
    val updatedBy: String = ""
)

data class NoteModel(
    val id: String = "",
    val caseId: String = "",
    val title: String = "",
    val content: String = "",
    val nextStepDate: Long? = null,
    val attachmentUrl: String? = null,
    val attachmentType: String? = null,
    val createdAt: Timestamp = Timestamp.now()
)

enum class TaskStatus {
    PENDING, IN_PROGRESS, COMPLETED, VERIFIED
}

enum class TaskPriority {
    NORMAL, URGENT
}

enum class TaskType(val displayName: String) {
    DRAFTING("Drafting"),
    FILING("Filing"),
    RESEARCH("Research"),
    CLIENT_MEETING("Client Meeting"),
    COURT_APPEARANCE("Court Appearance"),
    OTHER("Other")
}

data class TaskModel(
    var id: String = "",
    var caseId: String = "",
    var title: String = "",
    var description: String = "",
    var type: TaskType = TaskType.OTHER,
    var priority: TaskPriority = TaskPriority.NORMAL,
    var status: TaskStatus = TaskStatus.PENDING,
    var dueDate: String? = null,
    var assignedJuniorId: String? = null,
    var assignedJuniorName: String? = null,
    var completionNote: String? = null,
    var createdBy: String = "",
    var lastUpdatedAt: Long = System.currentTimeMillis(),
    var createdAt: Long = System.currentTimeMillis()
)

data class JuniorModel(
    val id: String = "",
    val name: String = "",
    val phone: String = "",
    val email: String = "",
    val initials: String = "",
    val caseCount: Int = 0,
    val officeName: String = "",
    val role: String = "JUNIOR",
    val profileImageUrl: String? = null,
    val createdAt: Timestamp = Timestamp.now()
)
