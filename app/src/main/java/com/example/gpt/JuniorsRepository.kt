package com.example.gpt

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class JuniorsRepository {
    private val firestore = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()

    suspend fun addJunior(juniorPhone: String, juniorName: String): Result<Unit> {
        val seniorId = auth.currentUser?.uid ?: return Result.failure(Exception("User not logged in"))
        val formattedPhone = if (juniorPhone.startsWith("+91")) juniorPhone else "+91$juniorPhone"
        
        return try {
            val userQuery = firestore.collection("users")
                .whereEqualTo("phone", formattedPhone)
                .get()
                .await()

            if (userQuery.isEmpty) {
                return Result.failure(Exception("No user found with this phone number. Please ensure they have registered on the app first."))
            }

            val juniorId = userQuery.documents[0].id
            val existingName = userQuery.documents[0].getString("name")

            val updates = mutableMapOf<String, Any>(
                "seniorId" to seniorId,
                "role" to "JUNIOR"
            )
            
            if (existingName.isNullOrBlank() && juniorName.isNotBlank()) {
                updates["name"] = juniorName
            }

            firestore.collection("users").document(juniorId)
                .update(updates)
                .await()

            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun getJuniors(): Flow<List<JuniorModel>> = callbackFlow {
        val seniorId = auth.currentUser?.uid
        if (seniorId == null) {
            trySend(emptyList())
            return@callbackFlow
        }

        val subscription = firestore.collection("users")
            .whereEqualTo("seniorId", seniorId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener
                if (snapshot != null) {
                    val juniors = snapshot.documents.mapNotNull { doc ->
                        val name = doc.getString("name")?.takeIf { it.isNotBlank() } ?: doc.getString("phone") ?: "Unknown"
                        val phone = doc.getString("phone") ?: ""
                        val email = doc.getString("email") ?: ""
                        
                        val initials = if (name.any { it.isLetter() }) {
                            name.split(" ")
                                .filter { it.isNotBlank() }
                                .map { it[0].uppercase() }
                                .joinToString("")
                                .take(2)
                        } else {
                            "?"
                        }

                        JuniorModel(
                            id = doc.id,
                            name = name,
                            phone = phone,
                            email = email,
                            initials = initials,
                            caseCount = 0
                        )
                    }
                    trySend(juniors)
                }
            }
        awaitClose { subscription.remove() }
    }
}
