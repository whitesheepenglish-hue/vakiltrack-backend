package com.example.gpt

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.fragment.app.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.gpt.databinding.BottomSheetAddHearingBinding
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.google.android.material.datepicker.MaterialDatePicker
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale

class AddHearingBottomSheet : BottomSheetDialogFragment() {

    private var _binding: BottomSheetAddHearingBinding? = null
    private val binding get() = _binding!!
    private val viewModel: QuickActionsViewModel by viewModels()
    
    private var selectedCaseId: String? = null
    private var selectedDate: Long = System.currentTimeMillis()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetAddHearingBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        setupCaseDropdown()
        setupDatePicker()
        setupSaveButton()
        observeViewModel()
    }

    private fun setupCaseDropdown() {
        lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.cases.collectLatest { cases ->
                    val caseLabels = cases.map { "${it.caseDisplayNumber} (${it.clientName})" }
                    val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_dropdown_item_1line, caseLabels)
                    binding.spinnerCase.setAdapter(adapter)
                    binding.spinnerCase.setOnItemClickListener { _, _, position, _ ->
                        selectedCaseId = cases[position].id
                    }
                }
            }
        }
    }

    private fun setupDatePicker() {
        binding.btnSelectDate.setOnClickListener {
            val datePicker = MaterialDatePicker.Builder.datePicker()
                .setTitleText("Select Hearing Date")
                .setSelection(MaterialDatePicker.todayInUtcMilliseconds())
                .build()

            datePicker.addOnPositiveButtonClickListener { selection ->
                selectedDate = selection
                val sdf = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())
                binding.btnSelectDate.text = sdf.format(selection)
                
                // Automatically save after picking date since it's the main action
                saveHearing()
            }
            datePicker.show(parentFragmentManager, "DATE_PICKER")
        }
    }

    private fun setupSaveButton() {
        // In this UI version, the button is "CHOOSE DATE". 
        // We'll trigger the save logic inside the date picker listener.
    }

    private fun saveHearing() {
        val caseId = selectedCaseId
        
        if (caseId == null) {
            Toast.makeText(requireContext(), "Please select a case", Toast.LENGTH_SHORT).show()
            return
        }
        
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val dateStr = sdf.format(selectedDate)

        val hearing = HearingModel(
            caseId = caseId,
            hearingDate = selectedDate,
            date = dateStr,
            purpose = "Update"
        )
        
        viewModel.addHearing(hearing)
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.success.collectLatest { success ->
                    if (success) {
                        Toast.makeText(requireContext(), "Hearing updated successfully", Toast.LENGTH_SHORT).show()
                        dismiss()
                    }
                }
            }
        }
        
        lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.loading.collectLatest { isLoading ->
                    binding.progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
                    binding.btnSelectDate.isEnabled = !isLoading
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        const val TAG = "AddHearingBottomSheet"
        fun newInstance() = AddHearingBottomSheet()
    }
}
