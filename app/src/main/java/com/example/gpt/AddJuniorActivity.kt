package com.example.gpt

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.gpt.databinding.ActivityAddJuniorBinding
import kotlinx.coroutines.launch

class AddJuniorActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAddJuniorBinding
    private val repository = JuniorsRepository()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAddJuniorBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupToolbar()
        setupSaveButton()
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        binding.toolbar.setNavigationOnClickListener { finish() }
    }

    private fun setupSaveButton() {
        binding.btnSave.setOnClickListener {
            val name = binding.etJuniorName.text.toString().trim()
            val phone = binding.etJuniorPhone.text.toString().trim()

            if (name.isEmpty()) {
                Toast.makeText(this, "Please enter junior's name", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (phone.length != 10) {
                Toast.makeText(this, "Please enter a valid 10-digit phone number", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            lifecycleScope.launch {
                binding.btnSave.isEnabled = false
                val result = repository.addJunior(phone, name)
                if (result.isSuccess) {
                    Toast.makeText(this@AddJuniorActivity, "Junior added successfully", Toast.LENGTH_SHORT).show()
                    finish()
                } else {
                    binding.btnSave.isEnabled = true
                    Toast.makeText(this@AddJuniorActivity, "Error: ${result.exceptionOrNull()?.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
