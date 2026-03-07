package com.example.gpt.data.repositories

import android.app.Activity
import com.example.gpt.UserModel
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit

class AuthRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance()
) {
    fun isUserLoggedIn() = auth.currentUser != null
    fun getUserId() = auth.currentUser?.uid ?: ""

    fun sendOtp(
        phoneNumber: String,
        activity: Activity,
        callbacks: PhoneAuthProvider.OnVerificationStateChangedCallbacks
    ) {
        val options = PhoneAuthOptions.newBuilder(auth)
            .setPhoneNumber("+91$phoneNumber")
            .setTimeout(60L, TimeUnit.SECONDS)
            .setActivity(activity)
            .setCallbacks(callbacks)
            .build()
        PhoneAuthProvider.verifyPhoneNumber(options)
    }

    suspend fun signInWithCredential(credential: PhoneAuthCredential): Result<Boolean> {
        return try {
            val result = auth.signInWithCredential(credential).await()
            val isNewUser = result.additionalUserInfo?.isNewUser ?: false
            if (isNewUser) {
                val user = UserModel(
                    id = result.user?.uid ?: "",
                    userId = result.user?.uid ?: "",
                    phone = result.user?.phoneNumber ?: ""
                )
                saveUserToFirestore(user)
            }
            Result.success(isNewUser)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun saveUserToFirestore(user: UserModel): Result<Unit> {
        return try {
            val uid = if (user.id.isNotEmpty()) user.id else user.userId
            db.collection("users").document(uid).set(user).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun getCurrentUser() = auth.currentUser

    suspend fun getUserData(uid: String): UserModel? {
        return try {
            db.collection("users").document(uid).get().await().toObject(UserModel::class.java)
        } catch (e: Exception) {
            null
        }
    }

    suspend fun updateFcmToken(token: String) {
        val uid = auth.currentUser?.uid ?: return
        try {
            db.collection("users").document(uid).update("fcmToken", token).await()
        } catch (e: Exception) {
            // Handle failure
        }
    }
}
