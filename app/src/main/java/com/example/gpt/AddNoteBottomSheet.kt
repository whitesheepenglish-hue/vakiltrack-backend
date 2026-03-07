package com.example.gpt

import android.app.DatePickerDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.gpt.databinding.ActivityAddNotesBinding
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

/**
 * Senior Developer Fix: Purpose/Notes Bottom Sheet UI.
 * Requirement: Instant feedback, clear inputs, and auto-dismiss on success.
 */
class AddNoteBottomSheet : BottomSheetDialogFragment() {

    private var _binding: ActivityAddNotesBinding? = null
    private val binding get() = _binding!!
    private val viewModel: QuickActionsViewModel by activityViewModels()
    
    private var selectedCaseId: String? = null
    private var selectedNextStepDate: Long? = null
    private val calendar = Calendar.getInstance()

    companion object {
        private const val ARG_CASE_ID = "case_id"
        
        fun newInstance(caseId: String? = null): AddNoteBottomSheet {
            val fragment = AddNoteBottomSheet()
            caseId?.let {
                val args = Bundle()
                args.putString(ARG_CASE_ID, it)
                fragment.arguments = args
            }
            return fragment
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = ActivityAddNotesBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        selectedCaseId = arguments?.getString(ARG_CASE_ID)
        
        setupCaseSpinner()
        setupDatePicker()
        setupSaveButton()
        observeViewModel()
        
        // Hide toolbar and adjust layout for BottomSheet
        binding.toolbar.visibility = View.GONE
    }

    private fun setupCaseSpinner() {
        lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.cases.collectLatest { cases ->
                    if (selectedCaseId != null) {
                        val currentCase = cases.find { it.id == selectedCaseId }
                        currentCase?.let {
                            binding.spinnerCase.setText("${it.caseNumber}/${it.caseYear}", false)
                            binding.spinnerCase.isEnabled = false // Disable if opened from specific case
                        }
                    } else {
                        val caseStrings = cases.map { "${it.caseNumber}/${it.caseYear}" }
                        val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_dropdown_item_1line, caseStrings)
                        binding.spinnerCase.setAdapter(adapter)
                        binding.spinnerCase.setOnItemClickListener { _, _, position, _ ->
                            selectedCaseId = cases[position].id
                        }
                    }
                }
            }
        }
    }

    private fun setupDatePicker() {
        binding.etNextStepDate.setOnClickListener {
            DatePickerDialog(requireContext(), { _, year, month, day ->
                calendar.set(year, month, day)
                selectedNextStepDate = calendar.timeInMillis
                val format = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
                binding.etNextStepDate.setText(format.format(calendar.time))
            }, calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH), calendar.get(Calendar.DAY_OF_MONTH)).show()
        }
    }

    private fun setupSaveButton() {
        binding.btnSave.setOnClickListener {
            val title = binding.etTitle.text.toString().trim()
            val content = binding.etContent.text.toString().trim()

            if (selectedCaseId == null || title.isEmpty() || content.isEmpty()) {
                val message = if (selectedCaseId == null) "Please select a case" else "Required fields missing"
                Snackbar.make(binding.root, message, Snackbar.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val note = NoteModel(
                caseId = selectedCaseId!!,
                title = title,
                content = content,
                nextStepDate = selectedNextStepDate
            )
            viewModel.addNote(note)
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.loading.collectLatest { isLoading ->
                    binding.progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
                    binding.btnSave.isEnabled = !isLoading
                }
            }
        }

        viewModel.addNoteResult.observe(viewLifecycleOwner) { result ->
            if (result.isSuccess) {
                showGlobalSnackbar("Note saved successfully")
                viewModel.refreshCases()
                dismiss()
            } else {
                val error = result.exceptionOrNull()?.message ?: "Failed to save note"
                Snackbar.make(binding.root, error, Snackbar.LENGTH_LONG).show()
            }
        }
    }

    private fun showGlobalSnackbar(message: String) {
        activity?.findViewById<View>(android.R.id.content)?.let {
            Snackbar.make(it, message, Snackbar.LENGTH_LONG).show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
