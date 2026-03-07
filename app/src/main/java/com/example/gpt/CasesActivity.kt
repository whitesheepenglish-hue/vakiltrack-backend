package com.example.gpt

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.gpt.databinding.ActivityCasesBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class CasesActivity : BaseActivity() {

    private lateinit var binding: ActivityCasesBinding
    private lateinit var adapter: CasesAdapter
    private val viewModel: QuickActionsViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCasesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupRecyclerView()
        setupBottomNavigation()
        setupFab()
        setupLanguageToggle()
        observeViewModel()
    }

    private fun setupLanguageToggle() {
        binding.ivLanguage.setOnClickListener {
            toggleLanguage()
        }
    }

    private fun setupFab() {
        binding.fabAddCase.setOnClickListener {
            val intent = Intent(this, AddCaseActivity::class.java)
            startActivity(intent)
        }
    }

    private fun setupRecyclerView() {
        adapter = CasesAdapter(
            onCaseClicked = { uiCase ->
                val intent = Intent(this, CaseDetailActivity::class.java)
                intent.putExtra("CASE_ID", uiCase.case.id)
                intent.putExtra("IS_SENIOR", true)
                startActivity(intent)
            },
            onDeleteClicked = { uiCase ->
                showDeleteConfirmation(uiCase)
            }
        )
        binding.rvCases.layoutManager = LinearLayoutManager(this)
        binding.rvCases.adapter = adapter
    }

    private fun showDeleteConfirmation(uiCase: UiCaseModel) {
        AlertDialog.Builder(this)
            .setTitle("Delete Case")
            .setMessage("Are you sure you want to delete this case? This action cannot be undone.")
            .setPositiveButton("Delete") { _, _ ->
                viewModel.deleteCase(uiCase.case.id)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiCases.collectLatest { uiCases ->
                    if (uiCases.isEmpty() && viewModel.loading.value.not()) {
                        binding.rvCases.visibility = View.GONE
                        binding.tvNoCases.visibility = View.VISIBLE
                    } else {
                        binding.rvCases.visibility = if (viewModel.loading.value) View.GONE else View.VISIBLE
                        binding.tvNoCases.visibility = View.GONE
                        adapter.submitList(uiCases)
                    }
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.loading.collectLatest { isLoading ->
                    binding.progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.success.collectLatest { success ->
                    if (success) {
                        showGlobalSnackbar("Operation completed successfully")
                        viewModel.refreshCases()
                        viewModel.resetSuccess()
                    }
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.error.collectLatest { errorMessage ->
                    errorMessage?.let {
                        showGlobalSnackbar(it)
                        viewModel.clearError()
                    }
                }
            }
        }
    }

    private fun showGlobalSnackbar(message: String) {
        Snackbar.make(binding.root, message, Snackbar.LENGTH_LONG).show()
    }

    private fun setupBottomNavigation() {
        binding.bottomNavigation.selectedItemId = R.id.nav_cases
        binding.bottomNavigation.setOnItemSelectedListener { item ->
            val targetActivity = when (item.itemId) {
                R.id.nav_board -> DashboardActivity::class.java
                R.id.nav_cases -> null
                R.id.nav_juniors -> JuniorsActivity::class.java
                R.id.nav_profile -> ProfileActivity::class.java
                else -> null
            }
            
            if (targetActivity != null) {
                startActivity(Intent(this, targetActivity))
                finish()
                true
            } else {
                item.itemId == R.id.nav_cases
            }
        }
    }
}
