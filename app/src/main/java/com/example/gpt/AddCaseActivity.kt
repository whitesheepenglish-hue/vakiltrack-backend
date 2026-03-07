package com.example.gpt

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.gpt.databinding.ActivityAddCaseBinding
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.*

class AddCaseActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAddCaseBinding
    private val viewModel: QuickActionsViewModel by viewModels()
    private val auth = FirebaseAuth.getInstance()

    private val districts = arrayOf(
        "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore",
        "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kanchipuram",
        "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai",
        "Nagapattinam", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai",
        "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi",
        "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli",
        "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur",
        "Vellore", "Viluppuram", "Virudhunagar"
    )

    private val caseTypes = arrayOf(
        "OS (Original Suit)", "CC (Calendar Case)", "CRL OP", "CRL MP",
        "MCOP (Motor Accident)", "HMOP (Hindu Marriage)", "RCOP (Rent Control)",
        "AS (Appeal Suit)", "CMA (Civil Misc Appeal)", "CRP (Civil Revision)",
        "EP (Execution Petition)", "IP (Insolvency)", "MC (Maintenance Case)",
        "SC (Small Cause)", "STC (Summary Trial Case)", "PRC (Preliminary Inquiry)",
        "SOP (Succession OP)", "CA (Civil Appeal)", "OP (Original Petition)"
    )

    // Example mapping - in real app, fetch from backend
    private val courtComplexes = arrayOf(
        "District Court Complex", "Integrated Court Building", "Combined Court Building", "Taluk Court"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAddCaseBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupToolbar()
        setupDropdowns()
        
        if (savedInstanceState == null) {
            setCurrentYear()
        }
        
        setupFetchButton()
        setupSaveButton()
        setupValidation()
        setupCnrSearchButton()
        observeViewModel()
    }

    override fun onResume() {
        super.onResume()
        if (binding.etCaseYear.text.toString().isEmpty()) {
            setCurrentYear()
        }
        updateCasePreview()
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        binding.toolbar.setNavigationOnClickListener { finish() }
    }

    private fun setupDropdowns() {
        val districtAdapter = ArrayAdapter(this, R.layout.list_item_dropdown, districts)
        binding.districtDropdown.setAdapter(districtAdapter)
        binding.districtDropdown.setOnItemClickListener { _, _, position, _ ->
            val selectedDistrict = districts[position]
            binding.etCourtName.setText(getString(R.string.court_name_format, selectedDistrict))
            validateFields()
        }

        val complexAdapter = ArrayAdapter(this, R.layout.list_item_dropdown, courtComplexes)
        binding.autoCompleteCourtComplex.setAdapter(complexAdapter)
        binding.autoCompleteCourtComplex.setOnItemClickListener { _, _, _, _ ->
            validateFields()
        }

        val typeAdapter = ArrayAdapter(this, R.layout.list_item_dropdown, caseTypes)
        binding.autoCompleteCaseType.setAdapter(typeAdapter)
        binding.autoCompleteCaseType.setOnItemClickListener { _, _, _, _ ->
            updateCasePreview()
            validateFields()
        }

        val currentYear = Calendar.getInstance().get(Calendar.YEAR)
        val years = (currentYear downTo currentYear - 9).map { it.toString() }.toTypedArray()
        val yearAdapter = ArrayAdapter(this, R.layout.list_item_dropdown, years)
        
        binding.etCaseYear.apply {
            setAdapter(yearAdapter)
            inputType = InputType.TYPE_NULL
            keyListener = null
            setOnItemClickListener { _, _, _, _ ->
                updateCasePreview()
                validateFields()
            }
        }
    }

    private fun setCurrentYear() {
        val currentYearStr = Calendar.getInstance().get(Calendar.YEAR).toString()
        binding.etCaseYear.setText(currentYearStr, false)
        updateCasePreview()
    }

    private fun updateCasePreview() {
        val fullType = binding.autoCompleteCaseType.text.toString()
        val caseType = fullType.substringBefore(" (").trim()
        val caseNumber = binding.etCaseNumber.text.toString().trim()
        val caseYear = binding.etCaseYear.text.toString()

        if (caseType.isNotEmpty() && caseNumber.isNotEmpty() && caseYear.isNotEmpty()) {
            binding.tvCasePreview.apply {
                if (visibility != View.VISIBLE) {
                    visibility = View.VISIBLE
                    alpha = 0f
                    animate().alpha(1f).setDuration(300).start()
                }
                text = getString(R.string.case_preview_format, caseType, caseNumber, caseYear)
            }
        } else {
            binding.tvCasePreview.visibility = View.GONE
        }
    }

    private fun setupFetchButton() {
        binding.btnFetchEcourt.setOnClickListener {
            val captcha = binding.etCaptcha.text.toString().trim()
            if (captcha.isEmpty()) {
                Toast.makeText(this, "Please enter captcha", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            lifecycleScope.launch {
                setLoadingState(true)
                delay(1500)
                
                if (binding.etCaseNumber.text.toString() == "000") {
                    setLoadingState(false)
                    Toast.makeText(this@AddCaseActivity, "Error: Case record not found in e-Courts portal.", Toast.LENGTH_LONG).show()
                    return@launch
                }

                setLoadingState(false)
                binding.btnFetchEcourt.text = getString(R.string.fetched_success)
                
                binding.chipCaseStage.apply {
                    visibility = View.VISIBLE
                    text = getString(R.string.case_stage_format, "Notice / Appearance")
                }
                
                Toast.makeText(this@AddCaseActivity, getString(R.string.case_details_fetched), Toast.LENGTH_SHORT).show()
                validateFields()
            }
        }
    }

    private fun setLoadingState(isLoading: Boolean) {
        binding.btnFetchEcourt.isEnabled = !isLoading
        binding.btnSave.isEnabled = !isLoading
        binding.fetchProgress.visibility = if (isLoading) View.VISIBLE else View.GONE
        binding.btnFetchEcourt.text = if (isLoading) getString(R.string.fetching) else getString(R.string.fetch_from_ecourts)
    }

    private fun setupSaveButton() {
        binding.btnSave.setOnClickListener {
            val district = binding.districtDropdown.text.toString()
            val courtComplex = binding.autoCompleteCourtComplex.text.toString()
            val fullType = binding.autoCompleteCaseType.text.toString()
            val caseType = fullType.substringBefore(" (").trim()
            val caseNumber = binding.etCaseNumber.text.toString().trim()
            val caseYear = binding.etCaseYear.text.toString().trim()
            val courtName = binding.etCourtName.text.toString().trim()
            val notificationPhone = binding.etNotificationPhone.text.toString().trim()

            val currentUserId = auth.currentUser?.uid ?: return@setOnClickListener
            val caseDisplayNumber = "$caseType/$caseNumber/$caseYear"

            val caseData = CaseModel(
                district = district,
                courtName = courtName, // You might want to include courtComplex here
                caseType = caseType,
                caseNumber = caseNumber,
                caseYear = caseYear,
                caseDisplayNumber = caseDisplayNumber,
                clientPhone = notificationPhone,
                advocateId = currentUserId,
                seniorLawyerUID = currentUserId,
                hearingStatus = "Filed",
                updatedAt = System.currentTimeMillis()
            )

            viewModel.addCase(caseData)
        }
    }

    private fun setupValidation() {
        val watcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                updateCasePreview()
                validateFields()
            }
            override fun afterTextChanged(s: Editable?) {}
        }

        binding.etCaseNumber.addTextChangedListener(watcher)
        binding.districtDropdown.addTextChangedListener(watcher)
        binding.autoCompleteCourtComplex.addTextChangedListener(watcher)
        binding.autoCompleteCaseType.addTextChangedListener(watcher)
        binding.etCaseYear.addTextChangedListener(watcher)
        binding.etCaptcha.addTextChangedListener(watcher)
    }

    private fun setupCnrSearchButton() {
        binding.btnSearchCnr.setOnClickListener {
            val intent = Intent(this, AddCaseCnrActivity::class.java)
            startActivity(intent)
        }
    }

    private fun validateFields() {
        val district = binding.districtDropdown.text.toString()
        val courtComplex = binding.autoCompleteCourtComplex.text.toString()
        val caseType = binding.autoCompleteCaseType.text.toString()
        val caseNumber = binding.etCaseNumber.text.toString().trim()
        val caseYear = binding.etCaseYear.text.toString().trim()
        val captcha = binding.etCaptcha.text.toString().trim()
        
        val isValid = district.isNotEmpty() && 
                     courtComplex.isNotEmpty() &&
                     caseType.isNotEmpty() && 
                     caseNumber.isNotEmpty() &&
                     caseYear.isNotEmpty() &&
                     captcha.isNotEmpty()
        
        if (binding.fetchProgress.visibility != View.VISIBLE) {
            binding.btnSave.isEnabled = isValid
            binding.btnSave.alpha = if (isValid) 1.0f else 0.5f
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.success.collectLatest { isSuccess ->
                    if (isSuccess) {
                        Toast.makeText(this@AddCaseActivity, getString(R.string.case_added_success), Toast.LENGTH_SHORT).show()
                        val intent = Intent(this@AddCaseActivity, CaseDetailActivity::class.java)
                        startActivity(intent)
                        viewModel.resetSuccess()
                        finish()
                    }
                }
            }
        }
        
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.loading.collectLatest { isLoading ->
                    binding.btnSave.isEnabled = !isLoading
                    binding.btnSave.text = if (isLoading) getString(R.string.saving) else getString(R.string.save_case)
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.error.collectLatest { errorMessage ->
                    errorMessage?.let {
                        Toast.makeText(this@AddCaseActivity, "Error: $it", Toast.LENGTH_LONG).show()
                        viewModel.clearError()
                    }
                }
            }
        }
    }
}
