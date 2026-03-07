package com.example.gpt

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import androidx.core.app.ActivityCompat
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.example.gpt.databinding.ActivityDashboardBinding
import com.example.gpt.databinding.LayoutDashboardActionsSheetBinding
import com.google.android.material.bottomsheet.BottomSheetDialog
import java.util.concurrent.TimeUnit

class DashboardActivity : BaseActivity() {

    private lateinit var binding: ActivityDashboardBinding
    private lateinit var hearingReminderManager: HearingReminderManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        hearingReminderManager = HearingReminderManager(this)

        requestNotificationPermission()
        setupNavigation()
        setupLanguageToggle()
        setupFabActions()
        scheduleAutomatedCourtUpdates()
        
        // Automatically check for today's hearings on app open
        hearingReminderManager.checkAndNotifyTodayHearings()
    }

    private fun setupNavigation() {
        val navHostFragment = supportFragmentManager
            .findFragmentById(R.id.nav_host_fragment) as NavHostFragment
        val navController = navHostFragment.navController
        binding.bottomNavigation.setupWithNavController(navController)
    }

    /**
     * Schedules the daily "Cron Job" to fetch active cases,
     * scrape eCourts, and update Firebase with new hearing dates.
     */
    private fun scheduleAutomatedCourtUpdates() {
        val workRequest = PeriodicWorkRequestBuilder<CourtUpdateWorker>(24, TimeUnit.HOURS)
            .setInitialDelay(1, TimeUnit.HOURS) // Run first sync after an hour
            .addTag("DailyCourtSync")
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "CourtUpdateSync",
            ExistingPeriodicWorkPolicy.KEEP, // Don't restart if already scheduled
            workRequest
        )
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                101
            )
        }
    }

    private fun setupLanguageToggle() {
        binding.ivLanguage.setOnClickListener {
            toggleLanguage()
        }
    }

    private fun setupFabActions() {
        binding.fabActions.setOnClickListener {
            showQuickActionsMenu()
        }
    }

    private fun showQuickActionsMenu() {
        val bottomSheetDialog = BottomSheetDialog(this, R.style.BottomSheetDialogTheme)
        val sheetBinding = LayoutDashboardActionsSheetBinding.inflate(LayoutInflater.from(this))
        bottomSheetDialog.setContentView(sheetBinding.root)

        sheetBinding.btnAddNewCase.setOnClickListener {
            startActivity(Intent(this, AddCaseActivity::class.java))
            bottomSheetDialog.dismiss()
        }

        sheetBinding.btnAddNotes.setOnClickListener {
            startActivity(Intent(this, AddNotesActivity::class.java))
            bottomSheetDialog.dismiss()
        }

        sheetBinding.btnAddJunior.setOnClickListener {
            startActivity(Intent(this, AddJuniorActivity::class.java))
            bottomSheetDialog.dismiss()
        }

        bottomSheetDialog.show()
    }
}
