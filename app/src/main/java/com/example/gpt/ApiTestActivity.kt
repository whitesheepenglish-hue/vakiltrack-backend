package com.example.gpt

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.gpt.data.api.RetrofitClient
import com.example.gpt.databinding.ActivityApiTestBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ApiTestActivity : AppCompatActivity() {

    private lateinit var binding: ActivityApiTestBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityApiTestBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnCheckStatus.setOnClickListener {
            checkBackendStatus()
        }
    }

    private fun checkBackendStatus() {
        binding.progressIndicator.visibility = View.VISIBLE
        binding.btnCheckStatus.isEnabled = false
        binding.tvApiResponse.text = "Connecting..."

        lifecycleScope.launch {
            try {
                val response = withContext(Dispatchers.IO) {
                    RetrofitClient.instance.checkServerStatus()
                }
                binding.tvApiResponse.text = response.string()
            } catch (e: Exception) {
                binding.tvApiResponse.text = "Backend not reachable"
                e.printStackTrace()
            } finally {
                binding.progressIndicator.visibility = View.GONE
                binding.btnCheckStatus.isEnabled = true
            }
        }
    }
}
