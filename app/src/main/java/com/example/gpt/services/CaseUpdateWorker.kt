package com.example.gpt.services

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.gpt.data.repositories.CaseRepository
import com.example.gpt.utils.NotificationHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class CaseUpdateWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    private val repository = CaseRepository()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val cases = repository.getAllCasesOnce()
            
            for (case in cases) {
                val newDate = repository.fetchAndUpdateCaseStatus(
                    caseId = case.id,
                    caseNumber = case.caseNumber,
                    courtName = case.courtName,
                    oldDate = case.nextHearingDate
                )
                
                if (newDate != null) {
                    NotificationHelper.showHearingUpdateNotification(
                        applicationContext,
                        case.caseDisplayNumber.ifEmpty { case.caseNumber },
                        newDate
                    )
                }
            }
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }
}
