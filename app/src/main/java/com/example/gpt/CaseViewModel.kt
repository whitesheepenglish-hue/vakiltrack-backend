package com.example.gpt

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

class CaseViewModel(private val repository: FirestoreRepository) : ViewModel() {

    private val _createCaseStatus = MutableLiveData<Result<String>>()
    val createCaseStatus: LiveData<Result<String>> = _createCaseStatus

    fun saveNewCase(
        caseNumber: String,
        clientName: String,
        clientPhone: String,
        courtName: String,
        seniorId: String,
        juniorId: String? = null,
        nextHearingDate: com.google.firebase.Timestamp? = null
    ) {
        val newCase = CaseModel(
            caseNumber = caseNumber,
            petitioner = clientName,
            courtName = courtName,
            seniorLawyerUID = seniorId,
            juniorLawyerUIDs = if (juniorId != null) listOf(juniorId) else emptyList(),
            nextHearingDate = nextHearingDate?.toDate()?.toString() ?: "",
            status = "ACTIVE",
            createdAt = com.google.firebase.Timestamp.now()
        )

        viewModelScope.launch {
            val result = repository.createCase(newCase)
            _createCaseStatus.value = result
        }
    }
}
