package com.example.gpt

import android.app.DatePickerDialog
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.gpt.databinding.ActivityAddNotesBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class AddNotesActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAddNotesBinding
    private val viewModel: QuickActionsViewModel by viewModels()
    private val calendar = Calendar.getInstance()
    private var selectedNextStepDate: Long? = null
    private var selectedCaseId: String? = null
    
    private var attachmentUri: Uri? = null
    private var attachmentType: String? = null

    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            attachmentUri = it
            attachmentType = "image"
            binding.tvAttachmentStatus.visibility = View.VISIBLE
            binding.tvAttachmentStatus.text = "Photo selected"
        }
    }

    private val pickDocument = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            attachmentUri = it
            attachmentType = "document"
            binding.tvAttachmentStatus.visibility = View.VISIBLE
            binding.tvAttachmentStatus.text = "Document selected"
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAddNotesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupToolbar()
        setupDatePicker()
        setupAttachmentButtons()
        setupSaveButton()
        observeViewModel()
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        binding.toolbar.setNavigationOnClickListener { finish() }
    }

    private fun setupDatePicker() {
        binding.etNextStepDate.setOnClickListener {
            DatePickerDialog(
                this,
                { _, year, month, day ->
                    calendar.set(year, month, day)
                    selectedNextStepDate = calendar.timeInMillis
                    val format = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
                    binding.etNextStepDate.setText(format.format(calendar.time))
                },
                calendar.get(Calendar.YEAR),
                calendar.get(Calendar.MONTH),
                calendar.get(Calendar.DAY_OF_MONTH)
            ).show()
        }
    }

    private fun setupAttachmentButtons() {
        binding.btnAttachPhoto.setOnClickListener {
            pickImage.launch("image/*")
        }

        binding.btnAttachDocument.setOnClickListener {
            pickDocument.launch("application/*")
        }
    }

    private fun setupSaveButton() {
        binding.btnSave.setOnClickListener {
            val title = binding.etTitle.text.toString().trim()
            val content = binding.etContent.text.toString().trim()

            if (selectedCaseId == null || title.isEmpty() || content.isEmpty()) {
                Snackbar.make(binding.root, "Please fill all required fields", Snackbar.LENGTH_LONG).show()
                return@setOnClickListener
            }

            val note = NoteModel(
                caseId = selectedCaseId!!,
                title = title,
                content = content,
                nextStepDate = selectedNextStepDate
            )
            
            viewModel.addNoteWithAttachment(note, attachmentUri, attachmentType)
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.cases.collectLatest { cases ->
                    val caseStrings = cases.map { "${it.caseNumber}/${it.caseYear}" }
                    val adapter = ArrayAdapter(this@AddNotesActivity, android.R.layout.simple_dropdown_item_1line, caseStrings)
                    binding.spinnerCase.setAdapter(adapter)
                    binding.spinnerCase.setOnItemClickListener { _, _, position, _ ->
                        selectedCaseId = cases[position].id
                    }
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.loading.collectLatest { isLoading ->
                    binding.progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
                    binding.btnSave.isEnabled = !isLoading
                    binding.btnAttachPhoto.isEnabled = !isLoading
                    binding.btnAttachDocument.isEnabled = !isLoading
                }
            }
        }

        viewModel.addNoteResult.observe(this) { result ->
            if (result.isSuccess) {
                Toast.makeText(this@AddNotesActivity, "Notes Added Successfully", Toast.LENGTH_SHORT).show()
                viewModel.resetSuccess()
                finish()
            } else {
                val error = result.exceptionOrNull()?.message ?: "Failed to save note"
                Snackbar.make(binding.root, error, Snackbar.LENGTH_LONG).show()
            }
        }
    }
}
