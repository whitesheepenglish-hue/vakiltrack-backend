package com.example.gpt

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.gpt.databinding.ActivityClientsBinding

class ClientsActivity : AppCompatActivity() {

    private lateinit var binding: ActivityClientsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityClientsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupRecyclerView()
        setupBottomNavigation()
    }

    private fun setupRecyclerView() {
        val mockClients = listOf(
            ClientModel(
                id = "1", 
                name = "Arun Pandian", 
                phone = "+91 98765 43210", 
                email = "arun@email.com", 
                totalFee = 50000.0, 
                paidFee = 30000.0, 
                address = "Chennai", 
                activeCases = 2,
                nextHearingDate = "24 Feb 2024",
                caseStage = "EVIDENCE"
            ),
            ClientModel(
                id = "2", 
                name = "Bala Murali", 
                phone = "+91 98765 43211", 
                email = "bala@email.com", 
                totalFee = 75000.0, 
                paidFee = 75000.0, 
                address = "Madurai", 
                activeCases = 1,
                nextHearingDate = "15 Mar 2024",
                caseStage = "ARGUMENTS"
            ),
            ClientModel(
                id = "3", 
                name = "Chitra Devi", 
                phone = "+91 98765 43212", 
                email = "chitra@email.com", 
                totalFee = 40000.0, 
                paidFee = 10000.0, 
                address = "Salem", 
                activeCases = 3,
                nextHearingDate = "10 Nov 2024",
                caseStage = "ORDER"
            )
        )
        binding.rvClients.layoutManager = LinearLayoutManager(this)
        binding.rvClients.adapter = ClientsAdapter(mockClients) { client ->
            // Handle client click
        }
    }

    private fun setupBottomNavigation() {
        // Clients is no longer in the bottom navigation menu
        binding.bottomNavigation.selectedItemId = Menu.NONE
        binding.bottomNavigation.setOnItemSelectedListener { item ->
            val targetActivity = when (item.itemId) {
                R.id.nav_board -> DashboardActivity::class.java
                R.id.nav_cases -> CasesActivity::class.java
                R.id.nav_juniors -> JuniorsActivity::class.java
                R.id.nav_profile -> ProfileActivity::class.java
                else -> null
            }
            
            if (targetActivity != null) {
                startActivity(Intent(this, targetActivity))
                finish()
                true
            } else {
                false
            }
        }
    }
}
