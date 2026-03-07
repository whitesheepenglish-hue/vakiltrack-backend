package com.example.gpt

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.gpt.databinding.LayoutJuniorItemBinding

class JuniorsAdapter(
    private val onItemClick: (JuniorModel) -> Unit
) : ListAdapter<JuniorModel, JuniorsAdapter.JuniorViewHolder>(JuniorDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): JuniorViewHolder {
        val binding = LayoutJuniorItemBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return JuniorViewHolder(binding)
    }

    override fun onBindViewHolder(holder: JuniorViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class JuniorViewHolder(val binding: LayoutJuniorItemBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val position = adapterPosition
                if (position != RecyclerView.NO_POSITION) {
                    onItemClick(getItem(position))
                }
            }
        }

        fun bind(junior: JuniorModel) {
            binding.apply {
                tvInitials.text = junior.initials
                tvJuniorName.text = "Adv. ${junior.name}"
                tvJuniorPhone.text = junior.phone
                tvCaseCount.text = "${junior.caseCount} Cases"
            }
        }
    }

    class JuniorDiffCallback : DiffUtil.ItemCallback<JuniorModel>() {
        override fun areItemsTheSame(oldItem: JuniorModel, newItem: JuniorModel): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: JuniorModel, newItem: JuniorModel): Boolean {
            return oldItem == newItem
        }
    }
}
