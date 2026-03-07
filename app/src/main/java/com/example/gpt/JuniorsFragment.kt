package com.example.gpt

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.gpt.databinding.FragmentJuniorsBinding
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class JuniorsFragment : Fragment() {
    private var _binding: FragmentJuniorsBinding? = null
    private val binding get() = _binding!!

    private val viewModel: JuniorsViewModel by activityViewModels()
    private lateinit var adapter: JuniorsAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentJuniorsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupRecyclerView()
        setupFab()
        observeViewModel()
    }

    private fun setupRecyclerView() {
        adapter = JuniorsAdapter { _ ->
            // Handle junior click if needed
        }
        binding.rvJuniors.layoutManager = LinearLayoutManager(requireContext())
        binding.rvJuniors.adapter = adapter
    }

    private fun setupFab() {
        binding.fabAddJunior.setOnClickListener {
            val bottomSheet = AddJuniorBottomSheet()
            bottomSheet.show(childFragmentManager, "AddJuniorBottomSheet")
        }
    }

    private fun observeViewModel() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collectLatest { state ->
                    when (state) {
                        is JuniorsState.Loading -> {
                            binding.progressBar.visibility = View.VISIBLE
                        }
                        is JuniorsState.Success -> {
                            binding.progressBar.visibility = View.GONE
                            if (state.juniors.isEmpty()) {
                                binding.tvNoJuniors.visibility = View.VISIBLE
                                binding.rvJuniors.visibility = View.GONE
                            } else {
                                binding.tvNoJuniors.visibility = View.GONE
                                binding.rvJuniors.visibility = View.VISIBLE
                                adapter.submitList(state.juniors)
                            }
                        }
                        is JuniorsState.Error -> {
                            binding.progressBar.visibility = View.GONE
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
