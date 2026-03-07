package com.example.gpt

import android.graphics.Paint
import android.text.format.DateUtils
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.example.gpt.databinding.LayoutTaskItemBinding

class TasksAdapter(
    private val tasks: List<TaskModel>,
    private val isSenior: Boolean,
    private val currentUserId: String,
    private val onTaskStatusChanged: (TaskModel, TaskStatus) -> Unit,
    private val onTaskClicked: (TaskModel) -> Unit
) : RecyclerView.Adapter<TasksAdapter.TaskViewHolder>() {

    class TaskViewHolder(val binding: LayoutTaskItemBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TaskViewHolder {
        val binding = LayoutTaskItemBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return TaskViewHolder(binding)
    }

    override fun onBindViewHolder(holder: TaskViewHolder, position: Int) {
        val task = tasks[position]
        val binding = holder.binding

        binding.tvTaskTitle.text = task.title
        binding.tvTaskType.text = "${task.type.displayName}${if (task.dueDate != null) " • Due: ${task.dueDate}" else ""}"
        
        val timeAgo = DateUtils.getRelativeTimeSpanString(task.lastUpdatedAt, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS)
        binding.tvAssignedTo.text = "Assigned: Adv. ${task.assignedJuniorName} • $timeAgo"

        // Priority
        if (task.priority == TaskPriority.URGENT) {
            binding.tvPriority.visibility = View.VISIBLE
        } else {
            binding.tvPriority.visibility = View.GONE
        }

        // Completion Note
        if (!task.completionNote.isNullOrBlank()) {
            binding.tvNote.visibility = View.VISIBLE
            binding.tvNote.text = "Note: ${task.completionNote}"
        } else {
            binding.tvNote.visibility = View.GONE
        }

        // Status UI
        updateStatusUI(holder, task)

        // Interactions
        binding.cbTaskStatus.setOnCheckedChangeListener(null)
        binding.cbTaskStatus.isChecked = task.status == TaskStatus.COMPLETED || task.status == TaskStatus.VERIFIED
        
        // Only assigned junior or senior can change status
        val canEditStatus = isSenior || (task.assignedJuniorId == currentUserId && task.status != TaskStatus.VERIFIED)
        binding.cbTaskStatus.isEnabled = canEditStatus

        binding.cbTaskStatus.setOnCheckedChangeListener { _, isChecked ->
            val newStatus = if (isChecked) TaskStatus.COMPLETED else TaskStatus.PENDING
            onTaskStatusChanged(task, newStatus)
        }

        binding.root.setOnClickListener { onTaskClicked(task) }
    }

    private fun updateStatusUI(holder: TaskViewHolder, task: TaskModel) {
        val binding = holder.binding
        val context = binding.root.context

        when (task.status) {
            TaskStatus.VERIFIED -> {
                binding.tvTaskTitle.paintFlags = binding.tvTaskTitle.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
                binding.tvTaskTitle.setTextColor(ContextCompat.getColor(context, R.color.text_gray))
                binding.root.alpha = 0.6f
            }
            TaskStatus.COMPLETED -> {
                binding.tvTaskTitle.paintFlags = binding.tvTaskTitle.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
                binding.tvTaskTitle.setTextColor(ContextCompat.getColor(context, R.color.dark_blue))
                binding.root.alpha = 1.0f
            }
            else -> {
                binding.tvTaskTitle.paintFlags = binding.tvTaskTitle.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
                binding.tvTaskTitle.setTextColor(ContextCompat.getColor(context, R.color.black))
                binding.root.alpha = 1.0f
            }
        }
    }

    override fun getItemCount() = tasks.size
}
