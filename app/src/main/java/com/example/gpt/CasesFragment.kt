package com.example.gpt

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.example.gpt.databinding.FragmentCasesBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class CasesFragment : Fragment() {

    private var _binding: FragmentCasesBinding? = null
    private val binding get() = _binding!!

    private val viewModel: QuickActionsViewModel by viewModels()
    private lateinit var casesAdapter: CasesAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCasesBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupRecyclerView()
        setupRefreshLayout()
        setupFab()
        observeViewModel()
    }

    private fun setupRecyclerView() {
        casesAdapter = CasesAdapter(
            onCaseClicked = { uiCase ->
                val intent = Intent(requireContext(), CaseDetailActivity::class.java)
                intent.putExtra("CASE_ID", uiCase.case.id)
                intent.putExtra("IS_SENIOR", true)
                startActivity(intent)
            },
            onDeleteClicked = { uiCase ->
                showDeleteConfirmation(uiCase)
            }
        )

        binding.recyclerViewCases.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = casesAdapter
        }
    }

    private fun showDeleteConfirmation(uiCase: UiCaseModel) {
        AlertDialog.Builder(requireContext())
            .setTitle("Delete Case")
            .setMessage("Are you sure you want to delete this case?")
            .setPositiveButton("Delete") { _, _ ->
                viewModel.deleteCase(uiCase.case.id)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun setupRefreshLayout() {
        binding.swipeRefreshLayout.apply {
            setColorSchemeResources(R.color.primary_navy, R.color.accent_gold)
            setOnRefreshListener {
                viewModel.refreshCases()
            }
        }
    }

    private fun setupFab() {
        binding.fabAddCase.setOnClickListener {
            startActivity(Intent(requireContext(), AddCaseActivity::class.java))
        }
    }

    private fun observeViewModel() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                // Observe Cases
                launch {
                    viewModel.uiCases.collectLatest { uiCases ->
                        if (uiCases.isEmpty() && viewModel.loading.value.not()) {
                            binding.recyclerViewCases.visibility = View.GONE
                            binding.tvNoCases.visibility = View.VISIBLE
                        } else {
                            binding.recyclerViewCases.visibility = if (viewModel.loading.value) View.GONE else View.VISIBLE
                            binding.tvNoCases.visibility = View.GONE
                            casesAdapter.submitList(uiCases)
                        }
                    }
                }

                // Observe Loading/Shimmer State
                launch {
                    viewModel.loading.collectLatest { isLoading ->
                        binding.shimmerLayout.visibility = if (isLoading) View.VISIBLE else View.GONE
                        if (isLoading) {
                            binding.recyclerViewCases.visibility = View.GONE
                            binding.tvNoCases.visibility = View.GONE
                        }
                    }
                }

                // Observe Refreshing State
                launch {
                    viewModel.isRefreshing.collectLatest { isRefreshing ->
                        binding.swipeRefreshLayout.isRefreshing = isRefreshing
                    }
                }

                // Observe Errors
                launch {
                    viewModel.error.collectLatest { errorMessage ->
                        errorMessage?.let {
                            Toast.makeText(requireContext(), it, Toast.LENGTH_LONG).show()
                            viewModel.clearError()
                        }
                    }
                }

                // Observe Success for deletion feedback
                launch {
                    viewModel.success.collectLatest { success ->
                        if (success) {
                            Snackbar.make(binding.root, "Case deleted successfully", Snackbar.LENGTH_LONG).show()
                            viewModel.resetSuccess()
                        }
                    }
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
