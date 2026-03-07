package com.example.gpt

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.gpt.databinding.LayoutTaskItemBinding
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Senior Developer optimized Notes Adapter.
 * Requirement: Update notes section immediately in UI.
 * Uses ListAdapter for efficient animations and diffing.
 */
class NotesAdapter(
    private val onDeleteClick: (NoteModel) -> Unit
) : ListAdapter<NoteModel, NotesAdapter.NoteViewHolder>(NoteDiffCallback()) {

    class NoteViewHolder(val binding: LayoutTaskItemBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): NoteViewHolder {
        val binding = LayoutTaskItemBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return NoteViewHolder(binding)
    }

    override fun onBindViewHolder(holder: NoteViewHolder, position: Int) {
        val note = getItem(position)
        val binding = holder.binding

        binding.tvTaskTitle.text = note.title
        binding.tvTaskType.text = note.content
        
        val sdf = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())
        val dateStr = sdf.format(note.createdAt.toDate())
        
        binding.tvAssignedTo.text = "Added on: $dateStr"
        
        // Show delete option for notes
        binding.btnDeleteNote.visibility = View.VISIBLE
        binding.btnDeleteNote.setOnClickListener {
            onDeleteClick(note)
        }
        
        // Hide irrelevant task fields to reuse the layout for notes
        binding.cbTaskStatus.visibility = View.GONE
        binding.tvPriority.visibility = View.GONE
        binding.tvNote.visibility = View.GONE
    }

    private class NoteDiffCallback : DiffUtil.ItemCallback<NoteModel>() {
        override fun areItemsTheSame(oldItem: NoteModel, newItem: NoteModel) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: NoteModel, newItem: NoteModel) = oldItem == newItem
    }
}
