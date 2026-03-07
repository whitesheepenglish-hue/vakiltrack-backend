package com.example.gpt

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.gpt.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileSetupScreen(
    viewModel: ProfileViewModel = viewModel(),
    onProfileSaved: () -> Unit
) {
    val profileState by viewModel.profileState.collectAsState()
    val context = LocalContext.current

    var name by remember { mutableStateOf("") }
    var officeName by remember { mutableStateOf("") }
    var district by remember { mutableStateOf("") }
    var selectedRole by remember { mutableStateOf(UserRole.SENIOR) }

    LaunchedEffect(profileState) {
        if (profileState is ProfileState.Success) {
            onProfileSaved()
        } else if (profileState is ProfileState.Error) {
            Toast.makeText(context, (profileState as ProfileState.Error).message, Toast.LENGTH_LONG).show()
        }
    }

    Box(
        modifier = Modifier.fillMaxSize().background(LightGray),
        contentAlignment = Alignment.TopCenter
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(40.dp))
            Text("Complete Your Profile", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = DarkBlue)
            Text("Help us set up your digital diary", fontSize = 14.sp, color = TextGray)
            
            Spacer(modifier = Modifier.height(32.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Column(modifier = Modifier.padding(24.dp)) {
                    Text("Full Name", fontWeight = FontWeight.Bold, color = DarkBlue)
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Adv. Your Name") },
                        shape = RoundedCornerShape(12.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text("Office Name", fontWeight = FontWeight.Bold, color = DarkBlue)
                    OutlinedTextField(
                        value = officeName,
                        onValueChange = { officeName = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("e.g., Justice Law Chambers") },
                        shape = RoundedCornerShape(12.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text("District", fontWeight = FontWeight.Bold, color = DarkBlue)
                    OutlinedTextField(
                        value = district,
                        onValueChange = { district = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("e.g., Chennai, Madurai") },
                        shape = RoundedCornerShape(12.dp)
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    Text("I am a:", fontWeight = FontWeight.Bold, color = DarkBlue)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = selectedRole == UserRole.SENIOR, onClick = { selectedRole = UserRole.SENIOR })
                        Text("Senior Lawyer")
                        Spacer(modifier = Modifier.width(16.dp))
                        RadioButton(selected = selectedRole == UserRole.JUNIOR, onClick = { selectedRole = UserRole.JUNIOR })
                        Text("Junior Lawyer")
                    }

                    Spacer(modifier = Modifier.height(32.dp))

                    Button(
                        onClick = {
                            if (name.isNotBlank() && officeName.isNotBlank() && district.isNotBlank()) {
                                viewModel.saveProfile(name, officeName, district, selectedRole)
                            } else {
                                Toast.makeText(context, "Please fill all fields", Toast.LENGTH_SHORT).show()
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = DarkBlue),
                        enabled = profileState !is ProfileState.Loading
                    ) {
                        if (profileState is ProfileState.Loading) {
                            CircularProgressIndicator(color = Gold, modifier = Modifier.size(24.dp))
                        } else {
                            Text("Save & Continue", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Gold)
                        }
                    }
                }
            }
        }
    }
}
