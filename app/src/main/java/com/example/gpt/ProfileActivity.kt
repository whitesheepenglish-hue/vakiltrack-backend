package com.example.gpt

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import coil.load
import com.example.gpt.databinding.ActivityProfileBinding
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage

class ProfileActivity : BaseActivity() {

    private lateinit var binding: ActivityProfileBinding
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()
    private val storage = FirebaseStorage.getInstance()
    private lateinit var prefs: SharedPreferences

    private val getContent = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            uploadProfileImage(it)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityProfileBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = getSharedPreferences("app_settings", Context.MODE_PRIVATE)

        setupToolbar()
        loadUserProfile()
        setupNotificationSettings()
        setupListeners()
    }

    private fun setupToolbar() {
        binding.tvToolbarTitle.text = "Profile"
        binding.ivLanguage.setOnClickListener { toggleLanguage() }
    }

    private fun loadUserProfile() {
        val user = auth.currentUser ?: return
        
        db.collection("users").document(user.uid).get()
            .addOnSuccessListener { document ->
                if (document.exists()) {
                    val name = document.getString("name") ?: "Advocate"
                    val phone = document.getString("phone") ?: user.phoneNumber ?: ""
                    val email = document.getString("email") ?: ""
                    val district = document.getString("district") ?: ""
                    val role = document.getString("role") ?: "Senior"
                    val photoUrl = document.getString("photoUrl")
                    
                    binding.tvUserName.text = name
                    binding.tvUserRole.text = role.replaceFirstChar { it.uppercase() }
                    binding.tvEmail.text = email.ifBlank { "Not provided" }
                    binding.tvPhone.text = phone
                    binding.tvLocation.text = district.ifBlank { "Not provided" }

                    if (!photoUrl.isNullOrEmpty()) {
                        binding.ivProfile.load(photoUrl) {
                            crossfade(true)
                            placeholder(R.drawable.ic_profile)
                            error(R.drawable.ic_profile)
                        }
                    }
                }
            }
            .addOnFailureListener {
                Toast.makeText(this, "Failed to load profile", Toast.LENGTH_SHORT).show()
            }
    }

    private fun uploadProfileImage(uri: Uri) {
        val user = auth.currentUser ?: return
        val profileRef = storage.reference.child("profile_images/${user.uid}.jpg")

        Toast.makeText(this, "Uploading image...", Toast.LENGTH_SHORT).show()

        profileRef.putFile(uri)
            .addOnSuccessListener {
                profileRef.downloadUrl.addOnSuccessListener { downloadUri ->
                    updateProfilePhotoUrl(downloadUri.toString())
                }
            }
            .addOnFailureListener {
                Toast.makeText(this, "Upload failed: ${it.message}", Toast.LENGTH_SHORT).show()
            }
    }

    private fun updateProfilePhotoUrl(url: String) {
        val user = auth.currentUser ?: return
        db.collection("users").document(user.uid)
            .update("photoUrl", url)
            .addOnSuccessListener {
                Toast.makeText(this, "Profile updated successfully", Toast.LENGTH_SHORT).show()
                binding.ivProfile.load(url) {
                    crossfade(true)
                }
            }
            .addOnFailureListener {
                Toast.makeText(this, "Failed to update profile data", Toast.LENGTH_SHORT).show()
            }
    }

    private fun setupNotificationSettings() {
        binding.switchAutoAlerts.isChecked = prefs.getBoolean("auto_hearing_alerts", true)
        binding.switchNotifyJuniors.isChecked = prefs.getBoolean("notify_juniors", true)

        binding.switchAutoAlerts.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean("auto_hearing_alerts", isChecked).apply()
        }

        binding.switchNotifyJuniors.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean("notify_juniors", isChecked).apply()
        }
    }

    private fun setupListeners() {
        binding.btnChangePhoto.setOnClickListener {
            getContent.launch("image/*")
        }

        binding.btnLogout.setOnClickListener {
            auth.signOut()
            val intent = Intent(this, LoginActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            finish()
        }

        binding.bottomNavigation.selectedItemId = R.id.nav_profile
        binding.bottomNavigation.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_board -> {
                    startActivity(Intent(this, DashboardActivity::class.java))
                    finish()
                    true
                }
                R.id.nav_cases -> {
                    startActivity(Intent(this, CasesActivity::class.java))
                    finish()
                    true
                }
                R.id.nav_juniors -> {
                    startActivity(Intent(this, JuniorsActivity::class.java))
                    finish()
                    true
                }
                R.id.nav_profile -> true
                else -> false
            }
        }
    }
}
