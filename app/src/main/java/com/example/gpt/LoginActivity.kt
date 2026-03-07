package com.example.gpt

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.viewModels
import androidx.lifecycle.lifecycleScope
import com.example.gpt.databinding.ActivityLoginBinding
import com.google.firebase.auth.PhoneAuthProvider
import kotlinx.coroutines.flow.collectLatest

class LoginActivity : BaseActivity() {

    private lateinit var binding: ActivityLoginBinding
    private val viewModel: AuthViewModel by viewModels()
    private var verificationId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupListeners()
        observeViewModel()
    }

    private fun setupListeners() {
        binding.btnSendOtp.setOnClickListener {
            val phone = binding.etPhoneNumber.text.toString().trim()
            if (phone.length == 10) {
                viewModel.sendOtp(phone, this)
            } else {
                binding.etPhoneNumber.error = "Enter valid 10-digit number"
            }
        }

        binding.btnVerify.setOnClickListener {
            val otp = binding.etOtp.text.toString().trim()
            if (otp.length == 6 && verificationId != null) {
                val credential = PhoneAuthProvider.getCredential(verificationId!!, otp)
                viewModel.signInWithCredential(credential)
            } else {
                binding.etOtp.error = "Enter valid 6-digit OTP"
            }
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launchWhenStarted {
            viewModel.authState.collectLatest { state ->
                when (state) {
                    is AuthState.Loading -> {
                        binding.progressBar.visibility = View.VISIBLE
                    }
                    is AuthState.OtpSent -> {
                        binding.progressBar.visibility = View.GONE
                        verificationId = state.verificationId
                        binding.phoneInputLayout.visibility = View.GONE
                        binding.otpInputLayout.visibility = View.VISIBLE
                        Toast.makeText(this@LoginActivity, "OTP Sent", Toast.LENGTH_SHORT).show()
                    }
                    is AuthState.AuthSuccess -> {
                        binding.progressBar.visibility = View.GONE
                        if (state.isNewUser) {
                            startActivity(Intent(this@LoginActivity, OnboardingActivity::class.java))
                        } else {
                            startActivity(Intent(this@LoginActivity, DashboardActivity::class.java))
                        }
                        finish()
                    }
                    is AuthState.AuthError -> {
                        binding.progressBar.visibility = View.GONE
                        Toast.makeText(this@LoginActivity, state.message, Toast.LENGTH_LONG).show()
                    }
                    else -> {
                        binding.progressBar.visibility = View.GONE
                    }
                }
            }
        }
    }
}
