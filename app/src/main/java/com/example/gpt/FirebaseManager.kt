package com.example.gpt

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Professional Firebase initialization helper for production use.
 * This class provides singletons for various Firebase services used throughout the app.
 */
object FirebaseManager {

    val auth: FirebaseAuth by lazy {
        FirebaseAuth.getInstance()
    }

    val db: FirebaseFirestore by lazy {
        FirebaseFirestore.getInstance()
    }

    val messaging: FirebaseMessaging by lazy {
        FirebaseMessaging.getInstance()
    }

    /**
     * Call this from your Application class or MainActivity to ensure
     * FCM token is available for push notifications.
     */
    fun initializePushNotifications(onTokenReceived: (String) -> Unit) {
        messaging.token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                task.result?.let { onTokenReceived(it) }
            }
        }
    }
}
