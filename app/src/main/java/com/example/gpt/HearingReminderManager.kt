package com.example.gpt

import android.content.Context
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.*

/**
 * Manager class to handle local hearing reminders by checking Firestore.
 * In a full production app, this logic is usually better handled by a
 * Backend/Cloud Function using FCM to save battery and ensure reliability.
 */
class HearingReminderManager(private val context: Context) {

    private val db = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()
    private val scope = CoroutineScope(Dispatchers.IO)

    fun checkAndNotifyTodayHearings() {
        val currentUser = auth.currentUser ?: return
        
        scope.launch {
            try {
                // Get start and end of today
                val calendar = Calendar.getInstance()
                calendar.set(Calendar.HOUR_OF_DAY, 0)
                calendar.set(Calendar.MINUTE, 0)
                calendar.set(Calendar.SECOND, 0)
                calendar.set(Calendar.MILLISECOND, 0)
                val startOfToday = Timestamp(calendar.time)

                calendar.set(Calendar.HOUR_OF_DAY, 23)
                calendar.set(Calendar.MINUTE, 59)
                calendar.set(Calendar.SECOND, 59)
                val endOfToday = Timestamp(calendar.time)

                // Query cases for the current user (as senior or junior) scheduled for today
                val seniorCases = db.collection("cases")
                    .whereEqualTo("seniorId", currentUser.uid)
                    .whereGreaterThanOrEqualTo("nextHearingDate", startOfToday)
                    .whereLessThanOrEqualTo("nextHearingDate", endOfToday)
                    .get().await()

                val juniorCases = db.collection("cases")
                    .whereEqualTo("juniorId", currentUser.uid)
                    .whereGreaterThanOrEqualTo("nextHearingDate", startOfToday)
                    .whereLessThanOrEqualTo("nextHearingDate", endOfToday)
                    .get().await()

                val allCases = seniorCases.documents + juniorCases.documents
                
                allCases.distinctBy { it.id }.forEach { doc ->
                    val caseNumber = doc.getString("caseNumber") ?: "Unknown"
                    sendLocalNotification(caseNumber)
                }

            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun sendLocalNotification(caseNumber: String) {
        val helper = NotificationHelper(context)
        helper.sendNotification(
            "Hearing Today!",
            "You have a hearing today for case: $caseNumber"
        )
    }
}

class NotificationHelper(private val context: Context) {
    fun sendNotification(title: String, body: String) {
        val channelId = "hearing_notifications"
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                channelId, "Hearing Reminders",
                android.app.NotificationManager.IMPORTANCE_HIGH
            )
            notificationManager.createNotificationChannel(channel)
        }

        val builder = androidx.core.app.NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)

        notificationManager.notify(System.currentTimeMillis().toInt(), builder.build())
    }
}
