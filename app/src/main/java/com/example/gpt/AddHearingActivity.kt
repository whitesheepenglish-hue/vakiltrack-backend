package com.example.gpt

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.Lifecycle
import com.example.gpt.databinding.ActivityAddHearingBinding
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class AddHearingActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAddHearingBinding
    private val viewModel: QuickActionsViewModel by viewModels()
    private val calendar = Calendar.getInstance()
    private var selectedDate: Long = 0L
    private var selectedCaseId: String? = null
    private var selectedCaseNumber: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAddHearingBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupToolbar()
        setupDatePicker()
        setupTimePicker()
        setupPurposeDropdown()
        setupSaveButton()
        observeViewModel()
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        binding.toolbar.setNavigationOnClickListener { finish() }
    }

    private fun setupDatePicker() {
        binding.etHearingDate.setOnClickListener {
            DatePickerDialog(
                this,
                { _, year, month, day ->
                    calendar.set(year, month, day)
                    selectedDate = calendar.timeInMillis
                    val format = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
                    binding.etHearingDate.setText(format.format(calendar.time))
                },
                calendar.get(Calendar.YEAR),
                calendar.get(Calendar.MONTH),
                calendar.get(Calendar.DAY_OF_MONTH)
            ).show()
        }
    }

    private fun setupTimePicker() {
        binding.etHearingTime.setOnClickListener {
            val hour = calendar.get(Calendar.HOUR_OF_DAY)
            val minute = calendar.get(Calendar.MINUTE)
            TimePickerDialog(this, { _, h, m ->
                val time = String.format(Locale.getDefault(), "%02d:%02d", h, m)
                binding.etHearingTime.setText(time)
            }, hour, minute, true).show()
        }
    }

    private fun setupPurposeDropdown() {
        val purposes = arrayOf("Arguments", "Evidence", "Counter", "Judgment", "Admission", "Filing", "Appearance")
        val adapter = ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, purposes)
        binding.spinnerPurpose.setAdapter(adapter)
    }

    private fun setupSaveButton() {
        binding.btnSave.setOnClickListener {
            val dateStr = binding.etHearingDate.text.toString()
            val time = binding.etHearingTime.text.toString()
            val purpose = binding.spinnerPurpose.text.toString()
            val notes = binding.etNotes.text.toString().trim()

            if (selectedCaseId == null || selectedDate == 0L || time.isEmpty() || purpose.isEmpty()) {
                Snackbar.make(binding.root, "Please fill all required fields", Snackbar.LENGTH_LONG).show()
                return@setOnClickListener
            }

            val hearing = HearingModel(
                caseId = selectedCaseId!!,
                caseNumber = selectedCaseNumber ?: "",
                hearingDate = selectedDate,
                hearingTime = time,
                purpose = purpose,
                date = dateStr,
                notes = notes
            )
            viewModel.addHearing(hearing)
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.cases.collectLatest { cases ->
                    val caseStrings = cases.map { "${it.caseNumber}/${it.caseYear}" }
                    val adapter = ArrayAdapter(this@AddHearingActivity, android.R.layout.simple_dropdown_item_1line, caseStrings)
                    binding.spinnerCase.setAdapter(adapter)
                    binding.spinnerCase.setOnItemClickListener { _, _, position, _ ->
                        selectedCaseId = cases[position].id
                        selectedCaseNumber = cases[position].caseNumber
                    }
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.loading.collectLatest { isLoading ->
                    binding.progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
                    binding.btnSave.isEnabled = !isLoading
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.success.collectLatest { isSuccess ->
                    if (isSuccess) {
                        Toast.makeText(this@AddHearingActivity, "Hearing Added Successfully", Toast.LENGTH_SHORT).show()
                        viewModel.resetSuccess()
                        finish()
                    }
                }
            }
        }
    }
}
