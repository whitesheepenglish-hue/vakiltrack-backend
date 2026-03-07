package com.example.gpt

import android.app.Activity
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.gpt.ui.theme.*
import com.google.firebase.auth.PhoneAuthProvider

@Composable
fun LoginScreen(
    viewModel: AuthViewModel = viewModel(),
    onAuthSuccess: (Boolean) -> Unit
) {
    val authState by viewModel.authState.collectAsState()
    val context = LocalContext.current
    var phoneNumber by remember { mutableStateOf("") }
    var otpCode by remember { mutableStateOf("") }
    var verificationId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(authState) {
        when (authState) {
            is AuthState.AuthSuccess -> {
                onAuthSuccess((authState as AuthState.AuthSuccess).isNewUser)
            }
            is AuthState.AuthError -> {
                Toast.makeText(context, (authState as AuthState.AuthError).message, Toast.LENGTH_LONG).show()
            }
            is AuthState.OtpSent -> {
                verificationId = (authState as AuthState.OtpSent).verificationId
                Toast.makeText(context, "OTP Sent", Toast.LENGTH_SHORT).show()
            }
            else -> {}
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(LightGray),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Logo Section
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .background(DarkBlue, shape = RoundedCornerShape(20.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Lock,
                    contentDescription = null,
                    tint = Gold,
                    modifier = Modifier.size(40.dp)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "VakilDisk",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = DarkBlue
            )

            Text(
                text = "Professional Case Management",
                fontSize = 14.sp,
                color = TextGray
            )

            Spacer(modifier = Modifier.height(40.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(24.dp)) {
                    if (verificationId == null) {
                        // Phone Number Entry
                        Text(
                            text = "Phone Number",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = DarkBlue,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )

                        OutlinedTextField(
                            value = phoneNumber,
                            onValueChange = { phoneNumber = it },
                            modifier = Modifier.fillMaxWidth(),
                            leadingIcon = { Icon(Icons.Outlined.Phone, contentDescription = null, tint = TextGray) },
                            placeholder = { Text("Enter 10 digit number", color = TextGray.copy(alpha = 0.5f)) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            shape = RoundedCornerShape(12.dp),
                            prefix = { Text("+91 ") }
                        )

                        Spacer(modifier = Modifier.height(32.dp))

                        Button(
                            onClick = {
                                if (phoneNumber.length == 10) {
                                    viewModel.sendOtp(phoneNumber, context as Activity)
                                } else {
                                    Toast.makeText(context, "Enter a valid phone number", Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = DarkBlue),
                            enabled = authState !is AuthState.Loading
                        ) {
                            if (authState is AuthState.Loading) {
                                CircularProgressIndicator(color = Gold, modifier = Modifier.size(24.dp))
                            } else {
                                Text("Send OTP", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Gold)
                            }
                        }
                    } else {
                        // OTP Entry
                        Text(
                            text = "Enter 6-digit OTP",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = DarkBlue,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )

                        OutlinedTextField(
                            value = otpCode,
                            onValueChange = { otpCode = it },
                            modifier = Modifier.fillMaxWidth(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            shape = RoundedCornerShape(12.dp)
                        )

                        Spacer(modifier = Modifier.height(32.dp))

                        Button(
                            onClick = {
                                if (otpCode.length == 6) {
                                    val credential = PhoneAuthProvider.getCredential(verificationId!!, otpCode)
                                    viewModel.signInWithCredential(credential)
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = DarkBlue),
                            enabled = authState !is AuthState.Loading
                        ) {
                            if (authState is AuthState.Loading) {
                                CircularProgressIndicator(color = Gold, modifier = Modifier.size(24.dp))
                            } else {
                                Text("Verify & Login", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Gold)
                            }
                        }
                    }
                }
            }
        }
    }
}
