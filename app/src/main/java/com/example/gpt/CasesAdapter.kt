package com.example.gpt

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.PopupMenu
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.gpt.databinding.LayoutCaseLiveItemBinding
import com.example.gpt.databinding.LayoutTimelineStepBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class CasesAdapter(
    private val onCaseClicked: (UiCaseModel) -> Unit,
    private val onDeleteClicked: (UiCaseModel) -> Unit
) : ListAdapter<UiCaseModel, CasesAdapter.CaseViewHolder>(UiCaseDiffCallback()) {

    class CaseViewHolder(val binding: LayoutCaseLiveItemBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CaseViewHolder {
        val binding = LayoutCaseLiveItemBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return CaseViewHolder(binding)
    }

    override fun onBindViewHolder(holder: CaseViewHolder, position: Int) {
        val uiCase = getItem(position)
        val case = uiCase.case
        val binding = holder.binding
        val context = holder.itemView.context

        holder.itemView.animation = AnimationUtils.loadAnimation(context, R.anim.slide_up_fade)

        binding.tvCaseNo.text = case.caseDisplayNumber.ifEmpty { "${case.caseType} ${case.caseNumber}/${case.caseYear}" }
        binding.tvClientName.text = uiCase.clientName
        
        // Match new layout ID: tvAssigned
        binding.tvAssigned.text = if (uiCase.juniorName != null) {
            context.getString(R.string.stage_label, uiCase.juniorName)
        } else {
            "Unassigned"
        }

        binding.tvNextHearing.text = if (case.nextHearingDate.isNotEmpty()) {
            context.getString(R.string.next_hearing_label, case.nextHearingDate)
        } else {
            "Awaiting court update"
        }
        
        val dateFormat = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault())
        val formattedDate = dateFormat.format(Date(case.lastSyncedAt))
        binding.tvLastSynced.text = context.getString(R.string.last_synced_format, formattedDate)

        binding.tvStageLabel.text = case.hearingStatus.uppercase()

        setupTimeline(binding, case.hearingStatus)

        binding.root.setOnClickListener { onCaseClicked(uiCase) }

        binding.ivMore.setOnClickListener { view ->
            val popup = PopupMenu(context, view)
            popup.menu.add("Delete Case")
            popup.setOnMenuItemClickListener { item ->
                if (item.title == "Delete Case") {
                    onDeleteClicked(uiCase)
                    true
                } else {
                    false
                }
            }
            popup.show()
        }
    }

    private fun setupTimeline(binding: LayoutCaseLiveItemBinding, currentStatus: String) {
        val stages = listOf("Filed", "Hearing", "Evidence", "Argument", "Judgment")
        val status = currentStatus.split(" ").firstOrNull() ?: currentStatus
        val currentStageIndex = stages.indexOfFirst { it.equals(status, ignoreCase = true) }

        updateStep(binding.stepFiling, "FILED", currentStageIndex >= 0, currentStageIndex == 0)
        updateStep(binding.stepAdmission, "HEARING", currentStageIndex >= 1, currentStageIndex == 1)
        updateStep(binding.stepEvidence, "EVIDENCE", currentStageIndex >= 2, currentStageIndex == 2)
        updateStep(binding.stepArguments, "ARGUMENT", currentStageIndex >= 3, currentStageIndex == 3)
        updateStep(binding.stepJudgment, "JUDGMENT", currentStageIndex >= 4, currentStageIndex == 4)
    }

    private fun updateStep(stepBinding: LayoutTimelineStepBinding, label: String, isCompleted: Boolean, isCurrent: Boolean) {
        val context = stepBinding.root.context
        stepBinding.tvStepLabel.text = label
        
        if (isCurrent) {
            stepBinding.stepCircle.setCardBackgroundColor(ContextCompat.getColor(context, R.color.white))
            stepBinding.stepCircle.strokeColor = ContextCompat.getColor(context, R.color.accent_gold)
            stepBinding.currentIndicator.visibility = View.VISIBLE
            stepBinding.ivStepStatus.visibility = View.GONE
            stepBinding.tvStepLabel.setTextColor(ContextCompat.getColor(context, R.color.primary_navy))
        } else if (isCompleted) {
            stepBinding.stepCircle.setCardBackgroundColor(ContextCompat.getColor(context, R.color.status_green))
            stepBinding.stepCircle.strokeColor = ContextCompat.getColor(context, R.color.status_green)
            stepBinding.currentIndicator.visibility = View.GONE
            stepBinding.ivStepStatus.visibility = View.VISIBLE
            stepBinding.ivStepStatus.setImageResource(R.drawable.ic_completed)
            stepBinding.tvStepLabel.setTextColor(ContextCompat.getColor(context, R.color.status_green))
        } else {
            stepBinding.stepCircle.setCardBackgroundColor(ContextCompat.getColor(context, R.color.white))
            stepBinding.stepCircle.strokeColor = ContextCompat.getColor(context, R.color.border_gray)
            stepBinding.currentIndicator.visibility = View.GONE
            stepBinding.ivStepStatus.visibility = View.GONE
            stepBinding.tvStepLabel.setTextColor(ContextCompat.getColor(context, R.color.text_gray))
        }
    }

    class UiCaseDiffCallback : DiffUtil.ItemCallback<UiCaseModel>() {
        override fun areItemsTheSame(oldItem: UiCaseModel, newItem: UiCaseModel) = oldItem.case.id == newItem.case.id
        override fun areContentsTheSame(oldItem: UiCaseModel, newItem: UiCaseModel) = oldItem == newItem
    }
}
