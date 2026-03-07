package com.example.gpt

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.gpt.data.repositories.AuthRepository
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    data class OtpSent(val verificationId: String) : AuthState()
    data class AuthSuccess(val isNewUser: Boolean) : AuthState()
    data class AuthError(val message: String) : AuthState()
}

class AuthViewModel(private val repository: AuthRepository = AuthRepository()) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState = _authState.asStateFlow()

    fun sendOtp(phoneNumber: String, activity: Activity) {
        _authState.value = AuthState.Loading
        val callbacks = object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
            override fun onVerificationCompleted(credential: PhoneAuthCredential) {
                signInWithCredential(credential)
            }

            override fun onVerificationFailed(e: com.google.firebase.FirebaseException) {
                _authState.value = AuthState.AuthError(e.message ?: "Verification failed")
            }

            override fun onCodeSent(verificationId: String, token: PhoneAuthProvider.ForceResendingToken) {
                _authState.value = AuthState.OtpSent(verificationId)
            }
        }
        repository.sendOtp(phoneNumber, activity, callbacks)
    }

    fun signInWithCredential(credential: PhoneAuthCredential) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            repository.signInWithCredential(credential)
                .onSuccess { isNewUser ->
                    _authState.value = AuthState.AuthSuccess(isNewUser)
                }
                .onFailure { e ->
                    _authState.value = AuthState.AuthError(e.message ?: "Sign-in failed")
                }
        }
    }
    
    fun isUserLoggedIn() = repository.isUserLoggedIn()

    fun getUserId() = repository.getUserId()
}
