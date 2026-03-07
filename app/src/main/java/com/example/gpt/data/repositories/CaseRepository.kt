package com.example.gpt.data.repositories

import com.example.gpt.CaseModel
import com.example.gpt.data.api.RetrofitClient
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class CaseRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
) {
    private val currentUserId: String get() = auth.currentUser?.uid ?: ""

    fun getCasesStream(): Flow<List<CaseModel>> = callbackFlow {
        if (currentUserId.isEmpty()) {
            trySend(emptyList())
            return@callbackFlow
        }

        val subscription = db.collection("cases")
            .whereEqualTo("advocateId", currentUserId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    return@addSnapshotListener
                }

                val cases = snapshot?.toObjects(CaseModel::class.java) ?: emptyList()
                trySend(cases)
            }

        awaitClose { subscription.remove() }
    }

    suspend fun getAllCasesOnce(): List<CaseModel> {
        if (currentUserId.isEmpty()) return emptyList()
        return try {
            db.collection("cases")
                .whereEqualTo("advocateId", currentUserId)
                .get()
                .await()
                .toObjects(CaseModel::class.java)
        } catch (e: Exception) {
            emptyList()
        }
    }

    suspend fun fetchAndUpdateCaseStatus(caseId: String, caseNumber: String, courtName: String, oldDate: String): String? {
        return try {
            val response = RetrofitClient.instance.getCaseStatus(caseNumber, courtName)
            if (response.success && response.data != null) {
                val newDate = response.data.nextHearingDate
                val caseStage = response.data.stage
                
                if (newDate != oldDate) {
                    db.collection("cases").document(caseId).update(
                        "nextHearingDate", newDate,
                        "hearingStatus", caseStage,
                        "lastSyncedAt", System.currentTimeMillis()
                    ).await()
                    newDate
                } else {
                    null
                }
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    suspend fun createCase(case: CaseModel): Result<Unit> {
        return try {
            val docRef = db.collection("cases").document()
            val finalCase = case.copy(id = docRef.id)
            docRef.set(finalCase).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateCaseStatus(caseId: String, status: String): Result<Unit> {
        return try {
            db.collection("cases").document(caseId).update("hearingStatus", status).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deleteCase(caseId: String): Result<Unit> {
        return try {
            db.collection("cases").document(caseId).delete().await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun getCases(): Flow<List<CaseModel>> = getCasesStream()
}
