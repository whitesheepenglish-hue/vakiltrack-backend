package com.example.gpt

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class HearingReminderWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val caseId = inputData.getString("caseId") ?: return Result.failure()
        val caseNumber = inputData.getString("caseNumber") ?: "Unknown"

        sendNotification(caseNumber)
        return Result.success()
    }

    private fun sendNotification(caseNumber: String) {
        val channelId = "hearing_reminders"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Hearing Reminders"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(channelId, name, importance)
            val notificationManager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }

        val builder = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Upcoming Hearing")
            .setContentText("Reminder for case: $caseNumber")
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        NotificationManagerCompat.from(applicationContext).notify(System.currentTimeMillis().toInt(), builder.build())
    }
}
