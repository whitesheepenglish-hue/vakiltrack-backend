package com.example.gpt

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.example.gpt.databinding.ActivityMainBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.firebase.FirebaseException
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.messaging.FirebaseMessaging
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var auth: FirebaseAuth
    private var storedVerificationId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        auth = FirebaseAuth.getInstance()

        binding.sendOtpButton.setOnClickListener {
            val phoneNumber = binding.phoneEditText.text.toString().trim()
            if (phoneNumber.length == 10) {
                val formattedPhone = "+91$phoneNumber"
                sendVerificationCode(formattedPhone)
            } else {
                Toast.makeText(this, "Please enter a valid 10-digit phone number", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun sendVerificationCode(phoneNumber: String) {
        setLoading(true)
        
        val options = PhoneAuthOptions.newBuilder(auth)
            .setPhoneNumber(phoneNumber)
            .setTimeout(60L, TimeUnit.SECONDS)
            .setActivity(this)
            .setCallbacks(object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
                override fun onVerificationCompleted(credential: PhoneAuthCredential) {
                    setLoading(false)
                    signInWithPhoneAuthCredential(credential)
                }
                override fun onVerificationFailed(e: FirebaseException) {
                    setLoading(false)
                    Toast.makeText(this@MainActivity, "Verification Failed: ${e.message}", Toast.LENGTH_LONG).show()
                }
                override fun onCodeSent(verificationId: String, token: PhoneAuthProvider.ForceResendingToken) {
                    setLoading(false)
                    storedVerificationId = verificationId
                    Toast.makeText(this@MainActivity, "OTP Sent", Toast.LENGTH_SHORT).show()
                    showOtpVerificationDialog()
                }
            })
            .build()
        PhoneAuthProvider.verifyPhoneNumber(options)
    }

    private fun setLoading(isLoading: Boolean) {
        binding.sendOtpButton.isEnabled = !isLoading
        binding.loginProgress.visibility = if (isLoading) View.VISIBLE else View.GONE
    }

    private fun showOtpVerificationDialog() {
        val dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_verify_otp_custom, null)
        val etOtp = dialogView.findViewById<EditText>(R.id.etOtp)
        val btnCancel = dialogView.findViewById<View>(R.id.btnCancel)
        val btnVerify = dialogView.findViewById<View>(R.id.btnVerify)

        val dialog = MaterialAlertDialogBuilder(this)
            .setView(dialogView)
            .setCancelable(false)
            .create()

        // Ensure the dialog background is transparent so the card's corners are visible
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        btnCancel.setOnClickListener {
            dialog.dismiss()
        }

        btnVerify.setOnClickListener {
            val code = etOtp.text.toString().trim()
            if (code.length == 6) {
                dialog.dismiss()
                verifyOtp(code)
            } else {
                Toast.makeText(this, "Please enter a valid 6-digit OTP", Toast.LENGTH_SHORT).show()
            }
        }

        dialog.show()
    }

    private fun verifyOtp(code: String) {
        setLoading(true)
        storedVerificationId?.let { verificationId ->
            val credential = PhoneAuthProvider.getCredential(verificationId, code)
            signInWithPhoneAuthCredential(credential)
        }
    }

    private fun signInWithPhoneAuthCredential(credential: PhoneAuthCredential) {
        auth.signInWithCredential(credential)
            .addOnCompleteListener(this) { task ->
                if (task.isSuccessful) {
                    val user = auth.currentUser
                    if (user != null) {
                        saveUserToFirestore(user.uid, user.phoneNumber ?: "")
                    } else {
                        setLoading(false)
                        Toast.makeText(this, "Login Success, but user is null", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    setLoading(false)
                    Toast.makeText(this, "Login Failed: ${task.exception?.message}", Toast.LENGTH_SHORT).show()
                }
            }
    }

    private fun saveUserToFirestore(userId: String, phoneNumber: String) {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            val fcmToken = if (task.isSuccessful) task.result else ""
            
            val userData = hashMapOf(
                "id" to userId,
                "phone" to phoneNumber,
                "role" to "SENIOR",
                "fcmToken" to fcmToken,
                "createdAt" to Timestamp.now()
            )

            FirebaseFirestore.getInstance().collection("users")
                .document(userId)
                .set(userData, SetOptions.merge())
                .addOnCompleteListener { firestoreTask ->
                    setLoading(false)
                    if (firestoreTask.isSuccessful) {
                        Toast.makeText(this, "Welcome to VakilTrack", Toast.LENGTH_SHORT).show()
                        val intent = Intent(this, DashboardActivity::class.java)
                        startActivity(intent)
                        finish()
                    } else {
                        Toast.makeText(this, "Error saving user data: ${firestoreTask.exception?.message}", Toast.LENGTH_SHORT).show()
                        val intent = Intent(this, DashboardActivity::class.java)
                        startActivity(intent)
                        finish()
                    }
                }
        }
    }
}
