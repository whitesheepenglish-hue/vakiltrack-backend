package com.example.gpt

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.gpt.data.repositories.CaseRepository
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.first
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class HearingUpdateWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val repository = CaseRepository()
            val cases = repository.getCases().first()
            val firestore = FirebaseFirestore.getInstance()

            val today = Date()
            val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())

            for (case in cases) {
                if (case.nextHearingDate.isNotEmpty()) {
                    val nextHearing = dateFormat.parse(case.nextHearingDate)
                    if (nextHearing != null && nextHearing.before(today) && case.hearingStatus != "Pending Update") {
                        firestore.collection("cases").document(case.id)
                            .update("hearingStatus", "Pending Update")
                    }
                }
            }
            Result.success()
        } catch (e: Exception) {
            Result.failure()
        }
    }
}
