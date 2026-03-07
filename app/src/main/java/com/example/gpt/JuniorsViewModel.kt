package com.example.gpt

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

sealed class JuniorsState {
    object Loading : JuniorsState()
    data class Success(val juniors: List<JuniorModel>) : JuniorsState()
    data class Error(val message: String) : JuniorsState()
}

class JuniorsViewModel : ViewModel() {
    private val repository = JuniorsRepository()
    
    private val _uiState = MutableStateFlow<JuniorsState>(JuniorsState.Loading)
    val uiState: StateFlow<JuniorsState> = _uiState.asStateFlow()

    private val _addJuniorResult = MutableSharedFlow<Result<Unit>>()
    val addJuniorResult: SharedFlow<Result<Unit>> = _addJuniorResult.asSharedFlow()

    init {
        loadJuniors()
    }

    fun loadJuniors() {
        viewModelScope.launch {
            _uiState.value = JuniorsState.Loading
            repository.getJuniors().collectLatest { juniors ->
                _uiState.value = JuniorsState.Success(juniors)
            }
        }
    }

    fun addJunior(phone: String, name: String) {
        viewModelScope.launch {
            val result = repository.addJunior(phone, name)
            if (result.isSuccess) {
                // Manually trigger a reload to ensure the new junior appears
                loadJuniors()
            }
            _addJuniorResult.emit(result)
        }
    }
}
