package com.example.gpt

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.gpt.databinding.ActivityAddJuniorBinding
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class AddJuniorBottomSheet : BottomSheetDialogFragment() {

    private var _binding: ActivityAddJuniorBinding? = null
    private val binding get() = _binding!!
    private val viewModel: JuniorsViewModel by activityViewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = ActivityAddJuniorBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupUI()
        observeViewModel()
    }

    private fun setupUI() {
        // Hide toolbar in bottom sheet
        binding.toolbar.visibility = View.GONE
        
        binding.btnSave.setOnClickListener {
            val name = binding.etJuniorName.text.toString().trim()
            val phone = binding.etJuniorPhone.text.toString().trim()

            if (name.isEmpty()) {
                binding.etJuniorName.error = "Please enter junior's name"
                return@setOnClickListener
            }

            // Validate junior input before submit
            if (phone.length != 10) {
                binding.etJuniorPhone.error = "Please enter a valid 10-digit phone number"
                return@setOnClickListener
            }

            binding.btnSave.isEnabled = false
            viewModel.addJunior(phone, name)
        }
    }

    private fun observeViewModel() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.addJuniorResult.collectLatest { result ->
                    binding.btnSave.isEnabled = true
                    if (result.isSuccess) {
                        showSnackbar("Junior added successfully")
                        dismiss()
                    } else {
                        val errorMessage = result.exceptionOrNull()?.message ?: "Failed to add junior"
                        showSnackbar(errorMessage)
                    }
                }
            }
        }
    }

    private fun showSnackbar(message: String) {
        activity?.findViewById<View>(android.R.id.content)?.let {
            Snackbar.make(it, message, Snackbar.LENGTH_LONG).show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
