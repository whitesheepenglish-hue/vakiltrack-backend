package com.example.gpt.ui.viewmodels

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.gpt.HearingModel
import com.example.gpt.data.repositories.HearingRepository
import kotlinx.coroutines.launch

class HearingViewModel(private val repository: HearingRepository = HearingRepository()) : ViewModel() {
    private val _operationSuccess = MutableLiveData<Boolean>()
    val operationSuccess: LiveData<Boolean> = _operationSuccess

    fun createHearing(hearing: HearingModel) {
        viewModelScope.launch {
            val result = repository.createHearing(hearing)
            _operationSuccess.value = result.isSuccess
        }
    }

    fun updateStatus(hearingId: String, status: String) {
        viewModelScope.launch {
            val result = repository.updateHearingStatus(hearingId, status)
            _operationSuccess.value = result.isSuccess
        }
    }
}
