package com.example.gpt

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.gpt.databinding.ActivityCaseDetailBinding
import com.example.gpt.databinding.LayoutAssignedJuniorItemBinding
import com.example.gpt.databinding.LayoutTimelineStepBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class CaseDetailActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCaseDetailBinding
    private val db = FirebaseFirestore.getInstance()
    private val viewModel: QuickActionsViewModel by viewModels()
    private var caseId: String? = null
    private var addNoteBottomSheet: AddNoteBottomSheet? = null
    private lateinit var notesAdapter: NotesAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCaseDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        caseId = intent.getStringExtra("CASE_ID")
        
        setupToolbar()
        setupNotesRecyclerView()
        caseId?.let { viewModel.fetchCaseDetails(it) }
        
        binding.btnAddNote.setOnClickListener {
            addNoteBottomSheet = AddNoteBottomSheet.newInstance(caseId)
            addNoteBottomSheet?.show(supportFragmentManager, "AddNoteBottomSheet")
        }

        binding.btnAddJunior.setOnClickListener {
            showAssignJuniorDialog()
        }

        binding.btnUpdateNotificationPhone.setOnClickListener {
            showUpdatePhoneDialog()
        }

        observeViewModel()
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setDisplayShowTitleEnabled(false)
        binding.toolbar.setNavigationOnClickListener { finish() }
    }

    private fun setupNotesRecyclerView() {
        notesAdapter = NotesAdapter { note ->
            showDeleteNoteConfirmation(note)
        }
        binding.rvNotes.apply {
            layoutManager = LinearLayoutManager(this@CaseDetailActivity)
            adapter = notesAdapter
            isNestedScrollingEnabled = false
        }
    }

    private fun observeViewModel() {
        // Loading State Observation
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.loading.collectLatest { isLoading ->
                    if (isLoading) {
                        binding.loadingOverlay.visibility = View.VISIBLE
                        binding.scrollView.visibility = View.GONE
                    } else {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.scrollView.visibility = View.VISIBLE
                    }
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.currentCase.collectLatest { case ->
                    case?.let { displayCase(it) }
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.juniors.collectLatest {
                    viewModel.currentCase.value?.let { displayCase(it) }
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.caseNotes.collectLatest { notes ->
                    if (notes.isEmpty()) {
                        binding.rvNotes.visibility = View.GONE
                        binding.tvNoNotes.visibility = View.VISIBLE
                    } else {
                        binding.rvNotes.visibility = View.VISIBLE
                        binding.tvNoNotes.visibility = View.GONE
                        notesAdapter.submitList(notes)
                    }
                }
            }
        }

        viewModel.addNoteResult.observe(this) { result ->
            if (result.isSuccess) {
                caseId?.let { viewModel.fetchCaseDetails(it) }
                addNoteBottomSheet?.dismiss()
                showSnackbar("Note added successfully")
            }
        }

        viewModel.deleteNoteResult.observe(this) { result ->
            if (result.isSuccess) {
                showSnackbar("Note deleted successfully")
            } else {
                Toast.makeText(this, "Failed to delete note", Toast.LENGTH_SHORT).show()
            }
        }

        viewModel.assignJuniorResult.observe(this) { result ->
            if (result.isSuccess) {
                showSnackbar("Team updated successfully")
            } else {
                val error = result.exceptionOrNull()?.message ?: "Operation failed"
                Toast.makeText(this, error, Toast.LENGTH_LONG).show()
            }
        }
        
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.error.collectLatest { error ->
                    error?.let {
                        Toast.makeText(this@CaseDetailActivity, it, Toast.LENGTH_LONG).show()
                        viewModel.clearError()
                    }
                }
            }
        }
    }

    private fun showAssignJuniorDialog() {
        val juniors = viewModel.juniors.value
        val currentCase = viewModel.currentCase.value
        if (juniors.isEmpty()) {
            Toast.makeText(this, "No juniors added yet.", Toast.LENGTH_LONG).show()
            return
        }

        val assignedIds = currentCase?.juniorLawyerUIDs ?: emptyList()
        val availableJuniors = juniors.filter { it.id !in assignedIds }
        
        if (availableJuniors.isEmpty()) {
            Toast.makeText(this, "All juniors are already assigned.", Toast.LENGTH_SHORT).show()
            return
        }

        val juniorNames = availableJuniors.map { it.name }.toTypedArray()
        val checkedItems = BooleanArray(availableJuniors.size) { false }

        MaterialAlertDialogBuilder(this)
            .setTitle("Assign Juniors")
            .setMultiChoiceItems(juniorNames, checkedItems) { _, which, isChecked ->
                checkedItems[which] = isChecked
            }
            .setPositiveButton("Assign") { _, _ ->
                val selectedJuniorIds = mutableListOf<String>()
                for (i in checkedItems.indices) {
                    if (checkedItems[i]) {
                        selectedJuniorIds.add(availableJuniors[i].id)
                    }
                }
                if (selectedJuniorIds.isNotEmpty()) {
                    caseId?.let { viewModel.assignJuniorsToCase(it, selectedJuniorIds) }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showDeleteNoteConfirmation(note: NoteModel) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Delete Note")
            .setMessage("Remove this note from history?")
            .setPositiveButton("Delete") { _, _ ->
                caseId?.let { viewModel.deleteNote(it, note.id) }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showUpdatePhoneDialog() {
        val input = EditText(this)
        input.inputType = InputType.TYPE_CLASS_PHONE
        input.hint = "10-digit mobile number"
        
        val currentPhone = viewModel.currentCase.value?.clientPhone
        if (!currentPhone.isNullOrEmpty()) {
            input.setText(currentPhone.removePrefix("+91"))
        }

        MaterialAlertDialogBuilder(this)
            .setTitle("Update Phone")
            .setView(input)
            .setPositiveButton("Update") { _, _ ->
                val newPhone = input.text.toString().trim()
                if (newPhone.length == 10) {
                    updateNotificationPhone("+91$newPhone")
                } else {
                    Toast.makeText(this, "Enter a valid 10-digit number", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun updateNotificationPhone(newPhone: String) {
        caseId?.let { id ->
            db.collection("cases").document(id)
                .update("clientPhone", newPhone)
                .addOnSuccessListener {
                    showSnackbar("Phone updated")
                    viewModel.fetchCaseDetails(id)
                }
                .addOnFailureListener {
                    Toast.makeText(this, "Update failed", Toast.LENGTH_SHORT).show()
                }
        }
    }

    private fun displayCase(case: CaseModel) {
        binding.tvCaseNumber.text = case.caseDisplayNumber.ifEmpty { "${case.caseType} ${case.caseNumber}/${case.caseYear}" }
        binding.tvCourtName.text = case.courtName
        binding.tvClientName.text = case.clientName
        
        // Next Hearing Date Fix with "Not Scheduled" Requirement
        if (case.nextHearingDate.isNotEmpty()) {
            binding.tvNextHearingDate.text = case.nextHearingDate
            binding.tvPurpose.text = if (case.purpose.isNotEmpty()) "Purpose: ${case.purpose}" else "Purpose: Not specified"
            binding.tvPurpose.visibility = View.VISIBLE
        } else {
            binding.tvNextHearingDate.text = "Not Scheduled"
            binding.tvPurpose.visibility = View.GONE
        }
        
        if (case.clientPhone.isNotBlank()) {
            binding.tvNotificationPhone.visibility = View.VISIBLE
            binding.tvNotificationPhone.text = case.clientPhone
        } else {
            binding.tvNotificationPhone.visibility = View.GONE
        }
        
        // Assigned Junior Summary
        if (case.juniorLawyerUIDs.isNotEmpty()) {
            val firstJuniorId = case.juniorLawyerUIDs.first()
            val junior = viewModel.juniors.value.find { it.id == firstJuniorId }
            if (junior != null) {
                binding.tvAssignedJuniorSummary.visibility = View.VISIBLE
                binding.juniorDivider.visibility = View.VISIBLE
                val summary = if (case.juniorLawyerUIDs.size > 1) {
                    "Junior: Adv. ${junior.name} +${case.juniorLawyerUIDs.size - 1} more"
                } else {
                    "Junior: Adv. ${junior.name}"
                }
                binding.tvAssignedJuniorSummary.text = summary
            } else {
                binding.tvAssignedJuniorSummary.visibility = View.GONE
                binding.juniorDivider.visibility = View.GONE
            }
        } else {
            binding.tvAssignedJuniorSummary.visibility = View.GONE
            binding.juniorDivider.visibility = View.GONE
        }
        
        // Team Management Section
        binding.layoutAssignedJunior.removeAllViews()
        if (case.juniorLawyerUIDs.isNotEmpty()) {
            binding.tvJuniorLabel.visibility = View.VISIBLE
            binding.layoutAssignedJunior.visibility = View.VISIBLE
            
            case.juniorLawyerUIDs.forEach { juniorId ->
                val junior = viewModel.juniors.value.find { it.id == juniorId }
                if (junior != null) {
                    val juniorItemBinding = LayoutAssignedJuniorItemBinding.inflate(LayoutInflater.from(this), binding.layoutAssignedJunior, false)
                    juniorItemBinding.tvJuniorName.text = "Adv. ${junior.name}"
                    juniorItemBinding.tvJuniorPhone.text = junior.phone

                    juniorItemBinding.btnCall.setOnClickListener {
                        startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${junior.phone}")))
                    }
                    
                    juniorItemBinding.btnEmail.setOnClickListener {
                        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:${junior.phone}"))
                        startActivity(intent)
                    }
                    
                    juniorItemBinding.btnRemove.setOnClickListener {
                        showRemoveJuniorConfirmation(junior)
                    }
                    
                    binding.layoutAssignedJunior.addView(juniorItemBinding.root)
                }
            }
        } else {
            binding.tvJuniorLabel.visibility = View.GONE
            binding.layoutAssignedJunior.visibility = View.GONE
        }

        updateTimeline(case.hearingStatus)
    }

    private fun showRemoveJuniorConfirmation(junior: JuniorModel) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Remove Junior")
            .setMessage("Remove Adv. ${junior.name} from this case?")
            .setPositiveButton("Remove") { _, _ ->
                caseId?.let { viewModel.removeJuniorFromCase(it, junior.id) }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun updateTimeline(status: String) {
        val stages = listOf("Filed", "Hearing", "Evidence", "Argument", "Judgment")
        val currentIndex = stages.indexOf(status)

        updateStep(binding.stepFiled, "FILED", currentIndex >= 0, currentIndex == 0)
        updateStep(binding.stepHearing, "HEARING", currentIndex >= 1, currentIndex == 1)
        updateStep(binding.stepEvidence, "EVIDENCE", currentIndex >= 2, currentIndex == 2)
        updateStep(binding.stepArgument, "ARGUMENT", currentIndex >= 3, currentIndex == 3)
        updateStep(binding.stepJudgment, "JUDGMENT", currentIndex >= 4, currentIndex == 4)
    }

    private fun updateStep(stepBinding: LayoutTimelineStepBinding, label: String, isPassed: Boolean, isCurrent: Boolean) {
        stepBinding.tvStepLabel.text = label
        val context = this

        if (isCurrent) {
            stepBinding.stepCircle.setCardBackgroundColor(ContextCompat.getColor(context, R.color.white))
            stepBinding.stepCircle.strokeColor = ContextCompat.getColor(context, R.color.accent_gold)
            stepBinding.currentIndicator.visibility = View.VISIBLE
            stepBinding.ivStepStatus.visibility = View.GONE
            stepBinding.tvStepLabel.setTextColor(ContextCompat.getColor(context, R.color.primary_navy))
        } else if (isPassed) {
            stepBinding.stepCircle.setCardBackgroundColor(ContextCompat.getColor(context, R.color.status_green))
            stepBinding.stepCircle.strokeColor = ContextCompat.getColor(context, R.color.status_green)
            stepBinding.currentIndicator.visibility = View.GONE
            stepBinding.ivStepStatus.visibility = View.VISIBLE
            stepBinding.tvStepLabel.setTextColor(ContextCompat.getColor(context, R.color.status_green))
        } else {
            stepBinding.stepCircle.setCardBackgroundColor(ContextCompat.getColor(context, R.color.white))
            stepBinding.stepCircle.strokeColor = ContextCompat.getColor(context, R.color.border_gray)
            stepBinding.currentIndicator.visibility = View.GONE
            stepBinding.ivStepStatus.visibility = View.GONE
            stepBinding.tvStepLabel.setTextColor(ContextCompat.getColor(context, R.color.text_gray))
        }
    }

    private fun showSnackbar(message: String) {
        Snackbar.make(binding.root, message, Snackbar.LENGTH_SHORT)
            .setBackgroundTint(ContextCompat.getColor(this, R.color.primary_navy))
            .setTextColor(ContextCompat.getColor(this, R.color.white))
            .show()
    }
}
