package com.example.gpt

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.gpt.databinding.FragmentDashboardBinding
import com.google.android.material.snackbar.Snackbar
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class DashboardFragment : Fragment() {
    private var _binding: FragmentDashboardBinding? = null
    private val binding get() = _binding!!

    private val viewModel: QuickActionsViewModel by viewModels()
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()

    private lateinit var todayAdapter: CasesAdapter
    private lateinit var upcomingAdapter: CasesAdapter 

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupRecyclerViews()
        loadUserProfile()
        observeViewModel()

        binding.btnTestBackend.setOnClickListener {
            startActivity(Intent(requireContext(), ApiTestActivity::class.java))
        }
    }

    private fun setupRecyclerViews() {
        todayAdapter = CasesAdapter(
            onCaseClicked = { uiCase -> openCaseDetails(uiCase.case.id) },
            onDeleteClicked = { uiCase -> showDeleteConfirmation(uiCase) }
        )
        binding.rvTodayHearings.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = todayAdapter
        }

        upcomingAdapter = CasesAdapter(
            onCaseClicked = { uiCase -> openCaseDetails(uiCase.case.id) },
            onDeleteClicked = { uiCase -> showDeleteConfirmation(uiCase) }
        )
        binding.rvUpcomingHearings.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = upcomingAdapter
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

    private fun openCaseDetails(caseId: String) {
        val intent = Intent(requireContext(), CaseDetailActivity::class.java)
        intent.putExtra("CASE_ID", caseId)
        startActivity(intent)
    }

    private fun loadUserProfile() {
        val user = auth.currentUser
        if (user != null) {
            db.collection("users").document(user.uid).get()
                .addOnSuccessListener { doc ->
                    val name = doc.getString("name") ?: "Advocate"
                    binding.tvWelcomeName.text = "Vanakkam, $name"
                }
        }
    }

    private fun observeViewModel() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    viewModel.uiState.collectLatest { state ->
                        when (state) {
                            is DashboardUiState.Success -> {
                                todayAdapter.submitList(state.todayHearings.map { UiCaseModel(it, it.clientName) })
                                upcomingAdapter.submitList(state.upcomingHearings.map { UiCaseModel(it, it.clientName) })
                                
                                binding.tvNoToday.visibility = if (state.todayHearings.isEmpty()) View.VISIBLE else View.GONE
                                
                                binding.tvTotalCount.text = state.stats.active.toString()
                                binding.tvTodayCount.text = state.todayHearings.size.toString()
                                binding.tvUpcomingCount.text = state.stats.upcoming.toString()
                            }
                            else -> {}
                        }
                    }
                }

                launch {
                    viewModel.success.collectLatest { success ->
                        if (success) {
                            Snackbar.make(binding.root, "Case deleted", Snackbar.LENGTH_LONG).show()
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
