package com.example.gpt

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

sealed class ProfileState {
    object Idle : ProfileState()
    object Loading : ProfileState()
    object Success : ProfileState()
    data class Error(val message: String) : ProfileState()
}

class ProfileViewModel(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance()
) : ViewModel() {

    private val _profileState = MutableStateFlow<ProfileState>(ProfileState.Idle)
    val profileState = _profileState.asStateFlow()

    fun saveProfile(name: String, officeName: String, district: String, role: UserRole) {
        val userId = auth.currentUser?.uid ?: return
        
        viewModelScope.launch {
            _profileState.value = ProfileState.Loading
            try {
                val userUpdate = mapOf(
                    "name" to name,
                    "officeName" to officeName,
                    "district" to district,
                    "role" to role.name,
                    "profileCompleted" to true
                )
                db.collection("users").document(userId).update(userUpdate).await()
                _profileState.value = ProfileState.Success
            } catch (e: Exception) {
                _profileState.value = ProfileState.Error(e.message ?: "Failed to update profile")
            }
        }
    }
}
