package com.example.gpt.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.gpt.CaseModel
import com.example.gpt.data.repositories.CaseRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class CaseViewModel(private val repository: CaseRepository = CaseRepository()) : ViewModel() {

    private val _cases = MutableStateFlow<List<CaseModel>>(emptyList())
    val cases: StateFlow<List<CaseModel>> = _cases

    fun createCase(case: CaseModel) {
        viewModelScope.launch {
            repository.createCase(case)
        }
    }

    fun updateStatus(caseId: String, status: String) {
        viewModelScope.launch {
            repository.updateCaseStatus(caseId, status)
        }
    }
}
