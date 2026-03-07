package com.example.gpt

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class FirestoreRepository(private val db: FirebaseFirestore) {

    suspend fun createUser(user: UserModel): Result<Void?> {
        return try {
            db.collection("users").document(user.id).set(user).await()
            Result.success(null)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getUser(userId: String): Result<UserModel?> {
        return try {
            val snapshot = db.collection("users").document(userId).get().await()
            Result.success(snapshot.toObject(UserModel::class.java))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateFcmToken(userId: String, token: String): Result<Void?> {
        return try {
            db.collection("users").document(userId).update("fcmToken", token).await()
            Result.success(null)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createCase(case: CaseModel): Result<String> {
        return try {
            val ref = db.collection("cases").document()
            val newCase = case.copy(id = ref.id)
            ref.set(newCase).await()
            Result.success(ref.id)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun getCasesForSenior(seniorId: String): Flow<List<CaseModel>> = callbackFlow {
        val subscription = db.collection("cases")
            .whereEqualTo("seniorLawyerUID", seniorId)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener
                if (snapshot != null) {
                    trySend(snapshot.toObjects(CaseModel::class.java))
                }
            }
        awaitClose { subscription.remove() }
    }

    fun getCasesForJunior(juniorId: String): Flow<List<CaseModel>> = callbackFlow {
        val subscription = db.collection("cases")
            .whereArrayContains("juniorLawyerUIDs", juniorId)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener
                if (snapshot != null) {
                    trySend(snapshot.toObjects(CaseModel::class.java))
                }
            }
        awaitClose { subscription.remove() }
    }

    suspend fun addHearing(hearing: HearingModel): Result<Void?> {
        return try {
            val ref = db.collection("hearings").document()
            val newHearing = hearing.copy(id = ref.id)
            db.runBatch { batch ->
                batch.set(ref, newHearing)
                // Also update the nextHearingDate in the Case document
                val caseRef = db.collection("cases").document(hearing.caseId)
                batch.update(caseRef, "nextHearingDate", hearing.date)
            }.await()
            Result.success(null)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun assignJuniorToCase(caseId: String, juniorId: String): Result<Void?> {
        return try {
            db.collection("cases").document(caseId)
                .update("juniorLawyerUIDs", FieldValue.arrayUnion(juniorId))
                .await()
            Result.success(null)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}