package com.example.gpt

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.activity.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.gpt.databinding.ActivityJuniorsBinding
import kotlinx.coroutines.launch

class JuniorsActivity : BaseActivity() {

    private lateinit var binding: ActivityJuniorsBinding
    private val viewModel: JuniorsViewModel by viewModels()
    private lateinit var adapter: JuniorsAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityJuniorsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupRecyclerView()
        setupBottomNavigation()
        setupFab()
        observeViewModel()
    }

    private fun setupFab() {
        binding.fabAddJunior.setOnClickListener {
            val bottomSheet = AddJuniorBottomSheet()
            bottomSheet.show(supportFragmentManager, "AddJuniorBottomSheet")
        }
    }

    private fun setupRecyclerView() {
        adapter = JuniorsAdapter { _ ->
            // Handle junior click if needed
        }
        binding.rvJuniors.layoutManager = LinearLayoutManager(this)
        binding.rvJuniors.adapter = adapter
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { state ->
                    when (state) {
                        is JuniorsState.Loading -> {
                            binding.progressBar.visibility = View.VISIBLE
                            binding.rvJuniors.visibility = View.GONE
                            binding.layoutEmpty.visibility = View.GONE
                        }
                        is JuniorsState.Success -> {
                            binding.progressBar.visibility = View.GONE
                            if (state.juniors.isEmpty()) {
                                binding.rvJuniors.visibility = View.GONE
                                binding.layoutEmpty.visibility = View.VISIBLE
                            } else {
                                binding.rvJuniors.visibility = View.VISIBLE
                                binding.layoutEmpty.visibility = View.GONE
                                adapter.submitList(state.juniors)
                            }
                        }
                        is JuniorsState.Error -> {
                            binding.progressBar.visibility = View.GONE
                            binding.rvJuniors.visibility = View.GONE
                            binding.layoutEmpty.visibility = View.VISIBLE
                        }
                    }
                }
            }
        }
    }

    private fun setupBottomNavigation() {
        binding.bottomNavigation.selectedItemId = R.id.nav_juniors
        binding.bottomNavigation.setOnItemSelectedListener { item ->
            val targetActivity = when (item.itemId) {
                R.id.nav_board -> DashboardActivity::class.java
                R.id.nav_cases -> CasesActivity::class.java
                R.id.nav_juniors -> null
                R.id.nav_profile -> ProfileActivity::class.java
                else -> null
            }
            
            if (targetActivity != null) {
                startActivity(Intent(this, targetActivity))
                finish()
                true
            } else {
                item.itemId == R.id.nav_juniors
            }
        }
    }
}
