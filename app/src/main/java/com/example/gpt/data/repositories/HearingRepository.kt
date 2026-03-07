package com.example.gpt.data.repositories

import com.example.gpt.HearingModel
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.tasks.await

class HearingRepository(private val db: FirebaseFirestore = FirebaseFirestore.getInstance()) {
    
    suspend fun createHearing(hearing: HearingModel): Result<Unit> {
        return try {
            val docRef = db.collection("hearings").document()
            val finalHearing = hearing.copy(id = docRef.id, hearingId = docRef.id)
            docRef.set(finalHearing).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun getHearingsByCase(caseId: String) = db.collection("hearings")
        .whereEqualTo("caseId", caseId)
        .orderBy("hearingDate", Query.Direction.DESCENDING)

    suspend fun updateHearingStatus(hearingId: String, status: String): Result<Unit> {
        return try {
            db.collection("hearings").document(hearingId).update("hearingStatus", status).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
