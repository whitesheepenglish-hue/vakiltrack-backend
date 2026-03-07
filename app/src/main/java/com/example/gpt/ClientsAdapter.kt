package com.example.gpt

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.example.gpt.databinding.LayoutClientItemBinding
import java.text.NumberFormat
import java.util.Locale

class ClientsAdapter(
    private val clients: List<ClientModel>,
    private val onClientClicked: (ClientModel) -> Unit
) : RecyclerView.Adapter<ClientsAdapter.ClientViewHolder>() {

    class ClientViewHolder(val binding: LayoutClientItemBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ClientViewHolder {
        val binding = LayoutClientItemBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ClientViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ClientViewHolder, position: Int) {
        val client = clients[position]
        val binding = holder.binding

        binding.tvClientName.text = client.name
        binding.tvClientPhone.text = client.phone
        
        val currencyFormat = NumberFormat.getCurrencyInstance(Locale("en", "IN"))
        binding.tvTotalFee.text = currencyFormat.format(client.totalFee)
        binding.tvPaidFee.text = currencyFormat.format(client.paidFee)
        binding.tvPendingFee.text = currencyFormat.format(client.pendingFee)
        
        binding.tvActiveCases.text = "${client.activeCases} Active Cases"
        binding.tvNextHearing.text = "Next: ${client.nextHearingDate}"
        binding.tvCaseStage.text = client.caseStage

        binding.root.setOnClickListener { onClientClicked(client) }
    }

    override fun getItemCount() = clients.size
}
