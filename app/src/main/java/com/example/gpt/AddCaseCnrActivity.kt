package com.example.gpt

import android.os.Bundle
import android.transition.Fade
import android.transition.TransitionManager
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.gpt.databinding.ActivityAddCaseCnrBinding
import com.example.gpt.databinding.ViewDetailItemBinding
import com.google.android.material.snackbar.Snackbar
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * Professional Case Search Screen for VakilTrack.
 */
class AddCaseCnrActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAddCaseCnrBinding
    private val viewModel: QuickActionsViewModel by viewModels()
    private val auth = FirebaseAuth.getInstance()
    private var fetchedCaseData: com.example.gpt.data.model.CaseDetails? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAddCaseCnrBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupToolbar()
        setupClickListeners()
        observeViewModel()
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        binding.toolbar.setNavigationOnClickListener { finish() }
    }

    private fun setupClickListeners() {
        binding.btnFetch.setOnClickListener {
            performFetch()
        }

        binding.btnSave.setOnClickListener {
            saveFetchedCase()
        }
    }

    private fun performFetch() {
        val cnr = binding.etCnrNumber.text.toString().trim()
        val captcha = binding.etCaptcha.text.toString().trim()
        
        if (cnr.length != 16) {
            Toast.makeText(this, "Please enter a valid 16-digit CNR", Toast.LENGTH_SHORT).show()
            return
        }
        
        if (captcha.isEmpty()) {
            Toast.makeText(this, "Please enter the captcha", Toast.LENGTH_SHORT).show()
            return
        }

        viewModel.fetchCaseByCnr(cnr, captcha)
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.loading.collectLatest { isLoading ->
                    updateLoadingState(isLoading)
                }
            }
        }

        viewModel.searchResult.observe(this) { response ->
            if (response?.success == true && response.data != null) {
                showCaseDetails(response.data)
            } else if (response != null) {
                if (response.message?.contains("captcha", ignoreCase = true) == true) {
                    Snackbar.make(binding.root, "Captcha incorrect. Please try again.", Snackbar.LENGTH_LONG).show()
                } else {
                    showError("Case details not available.")
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.success.collectLatest { isSuccess ->
                    if (isSuccess) {
                        Toast.makeText(this@AddCaseCnrActivity, "Case saved to board", Toast.LENGTH_SHORT).show()
                        viewModel.resetSuccess()
                        finish()
                    }
                }
            }
        }
    }

    private fun updateLoadingState(isLoading: Boolean) {
        binding.loadingIndicator.visibility = if (isLoading) View.VISIBLE else View.GONE
        binding.btnFetch.isEnabled = !isLoading
        binding.btnSave.isEnabled = !isLoading
        binding.etCnrNumber.isEnabled = !isLoading
        binding.etCaptcha.isEnabled = !isLoading
        
        if (isLoading) {
            hideAllCards()
        }
    }

    private fun showCaseDetails(data: com.example.gpt.data.model.CaseDetails) {
        fetchedCaseData = data
        
        setupDetailItem(binding.itemPetitioner, "PETITIONER", data.petitionerName)
        setupDetailItem(binding.itemRespondent, "RESPONDENT", data.respondentName)
        setupDetailItem(binding.itemCourt, "COURT NAME", data.courtHall)
        setupDetailItem(binding.itemStage, "CASE STAGE", data.stage)
        
        binding.tvNextHearingValue.text = data.nextHearingDate.ifEmpty { "Not Scheduled" }

        val transition = Fade().setDuration(400)
        TransitionManager.beginDelayedTransition(binding.root as ViewGroup, transition)
        
        binding.cardError.visibility = View.GONE
        binding.cardDetails.visibility = View.VISIBLE
    }

    private fun showError(message: String) {
        binding.tvError.text = message
        val transition = Fade().setDuration(300)
        TransitionManager.beginDelayedTransition(binding.root as ViewGroup, transition)
        
        binding.cardDetails.visibility = View.GONE
        binding.cardError.visibility = View.VISIBLE
    }

    private fun hideAllCards() {
        binding.cardDetails.visibility = View.GONE
        binding.cardError.visibility = View.GONE
    }

    private fun setupDetailItem(itemBinding: ViewDetailItemBinding, label: String, value: String) {
        itemBinding.tvLabel.text = label
        itemBinding.tvValue.text = value
    }

    private fun saveFetchedCase() {
        val data = fetchedCaseData ?: return
        val currentUserId = auth.currentUser?.uid ?: return

        val caseModel = CaseModel(
            caseNumber = binding.etCnrNumber.text.toString(),
            petitioner = data.petitionerName,
            respondent = data.respondentName,
            clientName = data.petitionerName,
            courtName = data.courtHall,
            nextHearingDate = data.nextHearingDate,
            hearingStatus = data.stage,
            advocateId = currentUserId,
            seniorLawyerUID = currentUserId,
            updatedAt = System.currentTimeMillis()
        )

        viewModel.addCase(caseModel)
    }
}
