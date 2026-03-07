package com.example.gpt

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.gpt.utils.NotificationHelper
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Automated worker to sync active cases with eCourts data daily.
 * This acts as the mobile "Cron Job" for VakilTrack.
 */
class CourtUpdateWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val db = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()
    private val notificationHelper = NotificationHelper(appContext)
    private val scraperService = CourtScraperService()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val currentUser = auth.currentUser
        if (currentUser == null) {
            Log.d("CourtUpdateWorker", "User not logged in. Skipping sync.")
            return@withContext Result.failure()
        }

        try {
            Log.d("CourtUpdateWorker", "Starting daily sync for user: ${currentUser.uid}")

            // 1. Fetch only ACTIVE cases belonging to the current user
            val snapshot = db.collection("cases")
                .whereEqualTo("advocateId", currentUser.uid)
                .whereEqualTo("status", "ACTIVE")
                .get()
                .await()
            
            val cases = snapshot.toObjects(CaseModel::class.java)
            Log.d("CourtUpdateWorker", "Found ${cases.size} active cases to sync")

            for (case in cases) {
                // Ensure we have enough data to query eCourts
                if (case.caseNumber.isNotBlank() && case.district.isNotBlank()) {
                    
                    // 2. Scrape eCourts for latest data
                    val (newDate, newStatus) = scraperService.getNextHearingDate(
                        case.caseNumber, 
                        case.district
                    )
                    
                    if (newDate != null) {
                        // 3. Compare next hearing date or status with Firestore
                        val isDateChanged = newDate != case.nextHearingDate
                        val isStatusChanged = newStatus != null && newStatus != case.hearingStatus

                        if (isDateChanged || isStatusChanged) {
                            Log.d("CourtUpdateWorker", "Update found for Case: ${case.caseNumber}")
                            
                            val updates = mutableMapOf<String, Any>(
                                "nextHearingDate" to newDate,
                                "lastSyncedAt" to System.currentTimeMillis(),
                                "updatedAt" to System.currentTimeMillis()
                            )
                            newStatus?.let { updates["hearingStatus"] = it }

                            // 4. Update Firebase with new eCourts data
                            db.collection("cases").document(case.id)
                                .update(updates)
                                .await()

                            // 5. Trigger notification for the user
                            notificationHelper.sendNotification(
                                "eCourts Sync: ${case.caseDisplayNumber.ifEmpty { case.caseNumber }}",
                                "New hearing scheduled for $newDate"
                            )
                        }
                    }
                }
            }
            
            Log.d("CourtUpdateWorker", "Daily sync completed successfully")
            Result.success()
        } catch (e: Exception) {
            Log.e("CourtUpdateWorker", "Error during court sync: ${e.message}")
            // Exponential backoff will handle retries automatically
            Result.retry()
        }
    }
}
