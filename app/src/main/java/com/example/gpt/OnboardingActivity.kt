package com.example.gpt

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.example.gpt.databinding.ActivityOnboardingBinding
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

class OnboardingActivity : AppCompatActivity() {

    private lateinit var binding: ActivityOnboardingBinding
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            Toast.makeText(this, "Notifications enabled", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityOnboardingBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupListeners()
    }

    private fun setupListeners() {
        binding.btnAllowNotification.setOnClickListener {
            askNotificationPermission()
        }

        binding.btnSave.setOnClickListener {
            saveUserData()
        }
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            Toast.makeText(this, "Notifications are already enabled", Toast.LENGTH_SHORT).show()
        }
    }

    private fun saveUserData() {
        val name = binding.etName.text.toString().trim()
        val user = auth.currentUser

        if (name.isEmpty()) {
            binding.etName.error = "Name is required"
            return
        }

        if (user != null) {
            val userData = hashMapOf(
                "uid" to user.uid,
                "name" to name,
                "phone" to (user.phoneNumber ?: ""),
                "role" to "senior",
                "createdAt" to Timestamp.now(),
                "profileCompleted" to true
            )

            db.collection("users").document(user.uid)
                .set(userData)
                .addOnSuccessListener {
                    startActivity(Intent(this, DashboardActivity::class.java))
                    finish()
                }
                .addOnFailureListener { e ->
                    Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                }
        }
    }
}
