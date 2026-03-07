package com.example.gpt

import android.net.Uri
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.gpt.data.api.RetrofitClient
import com.example.gpt.data.model.SearchCaseResponse
import com.example.gpt.data.model.SearchRequest
import com.example.gpt.data.repositories.CaseRepository
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.Calendar

class QuickActionsViewModel : ViewModel() {
    private val repository = CaseRepository()
    private val juniorsRepository = JuniorsRepository()
    private val db = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()
    private val storage = FirebaseStorage.getInstance()

    private val _uiState = MutableStateFlow<DashboardUiState>(DashboardUiState.Loading)
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing.asStateFlow()

    // Result Flows for specific actions
    private val _addCaseResult = MutableSharedFlow<Result<String>>()
    val addCaseResult: SharedFlow<Result<String>> = _addCaseResult.asSharedFlow()

    private val _addHearingResult = MutableSharedFlow<Result<Unit>>()
    val addHearingResult: SharedFlow<Result<Unit>> = _addHearingResult.asSharedFlow()

    private val _addNoteResult = MutableLiveData<Result<Unit>>()
    val addNoteResult: LiveData<Result<Unit>> = _addNoteResult

    private val _assignJuniorResult = MutableLiveData<Result<Unit>>()
    val assignJuniorResult: LiveData<Result<Unit>> = _assignJuniorResult

    private val _deleteCaseResult = MutableSharedFlow<Result<Unit>>()
    val deleteCaseResult: SharedFlow<Result<Unit>> = _deleteCaseResult.asSharedFlow()

    private val _deleteNoteResult = MutableLiveData<Result<Unit>>()
    val deleteNoteResult: LiveData<Result<Unit>> = _deleteNoteResult

    private val _success = MutableStateFlow(false)
    val success: StateFlow<Boolean> = _success.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _searchResult = MutableLiveData<SearchCaseResponse?>()
    val searchResult: LiveData<SearchCaseResponse?> = _searchResult

    private val _cases = MutableStateFlow<List<CaseModel>>(emptyList())
    val cases: StateFlow<List<CaseModel>> = _cases.asStateFlow()

    private val _currentCase = MutableStateFlow<CaseModel?>(null)
    val currentCase: StateFlow<CaseModel?> = _currentCase.asStateFlow()

    private val _caseNotes = MutableStateFlow<List<NoteModel>>(emptyList())
    val caseNotes: StateFlow<List<NoteModel>> = _caseNotes.asStateFlow()

    private val _juniors = MutableStateFlow<List<JuniorModel>>(emptyList())
    val juniors: StateFlow<List<JuniorModel>> = _juniors.asStateFlow()

    private val _uiCases = MutableStateFlow<List<UiCaseModel>>(emptyList())
    val uiCases: StateFlow<List<UiCaseModel>> = _uiCases.asStateFlow()

    private val _caseStats = MutableStateFlow(CaseStats())
    val caseStats: StateFlow<CaseStats> = _caseStats.asStateFlow()

    private val _filteredCases = MutableStateFlow<List<UiCaseModel>>(emptyList())
    val filteredCases: StateFlow<List<UiCaseModel>> = _filteredCases.asStateFlow()

    private var allCases = listOf<CaseModel>()
    private var searchJob: Job? = null
    private var currentQuery = ""

    init {
        startRealTimeSync()
        fetchJuniors()
    }

    private fun startRealTimeSync() {
        viewModelScope.launch {
            _loading.value = true
            repository.getCasesStream().collectLatest { cases ->
                allCases = cases
                _cases.value = cases
                val uiCasesList = cases.map { UiCaseModel(it, it.clientName) }
                _uiCases.value = uiCasesList
                updateStats(cases)
                processAndFilter(currentQuery)
                _loading.value = false
                _isRefreshing.value = false
            }
        }
    }

    private fun fetchJuniors() {
        viewModelScope.launch {
            juniorsRepository.getJuniors().collectLatest {
                _juniors.value = it
            }
        }
    }

    fun fetchCaseDetails(caseId: String) {
        viewModelScope.launch {
            _loading.value = true
            try {
                val doc = db.collection("cases").document(caseId).get().await()
                _currentCase.value = doc.toObject(CaseModel::class.java)
                fetchCaseNotes(caseId)
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _loading.value = false
            }
        }
    }

    private fun fetchCaseNotes(caseId: String) {
        viewModelScope.launch {
            try {
                val notesSnapshot = db.collection("cases").document(caseId)
                    .collection("notes")
                    .orderBy("createdAt", Query.Direction.DESCENDING)
                    .get()
                    .await()
                
                val notes = notesSnapshot.documents.mapNotNull { doc ->
                    doc.toObject(NoteModel::class.java)?.copy(id = doc.id)
                }
                _caseNotes.value = notes
            } catch (e: Exception) {
            }
        }
    }

    fun deleteNote(caseId: String, noteId: String) {
        viewModelScope.launch {
            _loading.value = true
            try {
                db.collection("cases").document(caseId)
                    .collection("notes").document(noteId).delete().await()
                _deleteNoteResult.value = Result.success(Unit)
                fetchCaseNotes(caseId)
            } catch (e: Exception) {
                _deleteNoteResult.value = Result.failure(e)
            } finally {
                _loading.value = false
            }
        }
    }

    fun assignJuniorsToCase(caseId: String, juniorIds: List<String>) {
        if (juniorIds.isEmpty()) return
        viewModelScope.launch {
            _loading.value = true
            try {
                db.collection("cases").document(caseId)
                    .update("juniorLawyerUIDs", FieldValue.arrayUnion(*juniorIds.toTypedArray()))
                    .await()
                _assignJuniorResult.value = Result.success(Unit)
                fetchCaseDetails(caseId)
            } catch (e: Exception) {
                _assignJuniorResult.value = Result.failure(e)
            } finally {
                _loading.value = false
            }
        }
    }

    fun assignJuniorToCase(caseId: String, juniorId: String) {
        assignJuniorsToCase(caseId, listOf(juniorId))
    }

    fun removeJuniorFromCase(caseId: String, juniorId: String) {
        viewModelScope.launch {
            _loading.value = true
            try {
                db.collection("cases").document(caseId)
                    .update("juniorLawyerUIDs", FieldValue.arrayRemove(juniorId))
                    .await()
                _assignJuniorResult.value = Result.success(Unit)
                fetchCaseDetails(caseId)
            } catch (e: Exception) {
                _assignJuniorResult.value = Result.failure(e)
            } finally {
                _loading.value = false
            }
        }
    }

    fun refreshCases() {
        viewModelScope.launch {
            _isRefreshing.value = true
            delay(1000)
            _isRefreshing.value = false
        }
    }

    private fun updateStats(cases: List<CaseModel>) {
        val today = getStartOfToday()
        val tomorrow = today + 86400000
        _caseStats.value = CaseStats(
            active = cases.count { it.status == "ACTIVE" },
            upcoming = cases.count { it.hearingDate >= tomorrow },
            disposed = cases.count { it.status == "DISPOSED" }
        )
    }

    fun filterCases(query: String) {
        currentQuery = query
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(300)
            processAndFilter(query)
        }
    }

    private fun processAndFilter(query: String) {
        if (allCases.isEmpty() && _loading.value.not()) {
            _uiState.value = DashboardUiState.Empty
            _filteredCases.value = emptyList()
            return
        }

        val filtered = if (query.isEmpty()) {
            allCases
        } else {
            allCases.filter {
                it.caseNumber.contains(query, ignoreCase = true) ||
                it.clientName.contains(query, ignoreCase = true) ||
                it.caseDisplayNumber.contains(query, ignoreCase = true)
            }
        }

        _filteredCases.value = filtered.map { UiCaseModel(it, it.clientName) }

        val today = getStartOfToday()
        val tomorrow = today + 86400000

        val todayHearings = filtered.filter { it.hearingDate in today until tomorrow }
            .sortedBy { it.courtName }

        val upcomingHearings = filtered.filter { it.hearingDate >= tomorrow }
            .sortedBy { it.hearingDate }

        _uiState.value = DashboardUiState.Success(
            todayHearings = todayHearings.distinctBy { it.id },
            upcomingHearings = upcomingHearings.distinctBy { it.id },
            stats = _caseStats.value
        )
    }

    fun searchCase(district: String, court: String, type: String, number: String, year: String) {
        viewModelScope.launch {
            _loading.value = true
            try {
                val request = SearchRequest(district, court, type, number, year)
                val response = RetrofitClient.instance.searchCase(request)
                _searchResult.value = response
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _loading.value = false
            }
        }
    }

    fun fetchCaseByCnr(cnr: String, captcha: String) {
        viewModelScope.launch {
            _loading.value = true
            try {
                val request = mapOf("cnr" to cnr, "captcha" to captcha)
                val response = RetrofitClient.instance.fetchByCnr(request)
                _searchResult.value = response
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _loading.value = false
            }
        }
    }

    fun addCase(case: CaseModel) {
        viewModelScope.launch {
            _loading.value = true
            try {
                val ref = db.collection("cases").document()
                val currentUserId = auth.currentUser?.uid ?: ""
                val caseWithId = case.copy(id = ref.id, advocateId = currentUserId)
                ref.set(caseWithId).await()
                _addCaseResult.emit(Result.success(ref.id))
                _success.value = true
            } catch (e: Exception) {
                _addCaseResult.emit(Result.failure(e))
            } finally {
                _loading.value = false
            }
        }
    }

    fun deleteCase(caseId: String) {
        viewModelScope.launch {
            _loading.value = true
            try {
                db.collection("cases").document(caseId).delete().await()
                _deleteCaseResult.emit(Result.success(Unit))
            } catch (e: Exception) {
                _deleteCaseResult.emit(Result.failure(e))
            } finally {
                _loading.value = false
            }
        }
    }

    fun addHearing(hearing: HearingModel) {
        viewModelScope.launch {
            _loading.value = true
            try {
                val ref = db.collection("hearings").document()
                val hearingWithId = hearing.copy(id = ref.id)
                db.runBatch { batch ->
                    batch.set(ref, hearingWithId)
                    val caseRef = db.collection("cases").document(hearing.caseId)
                    batch.update(caseRef, "nextHearingDate", hearing.date)
                }.await()
                _addHearingResult.emit(Result.success(Unit))
                _success.value = true
            } catch (e: Exception) {
                _addHearingResult.emit(Result.failure(e))
            } finally {
                _loading.value = false
            }
        }
    }

    fun addNote(note: NoteModel) {
        addNoteWithAttachment(note, null, null)
    }

    fun addNoteWithAttachment(note: NoteModel, attachmentUri: Uri?, attachmentType: String?) {
        viewModelScope.launch {
            _loading.value = true
            try {
                var finalNote = note
                if (attachmentUri != null && attachmentType != null) {
                    val fileName = "${System.currentTimeMillis()}_${attachmentUri.lastPathSegment}"
                    val ref = storage.reference.child("notes_attachments/${note.caseId}/$fileName")
                    ref.putFile(attachmentUri).await()
                    val downloadUrl = ref.downloadUrl.await().toString()
                    finalNote = note.copy(attachmentUrl = downloadUrl, attachmentType = attachmentType)
                }

                db.collection("cases").document(finalNote.caseId)
                    .collection("notes").add(finalNote).await()
                _addNoteResult.value = Result.success(Unit)
                _success.value = true
            } catch (e: Exception) {
                _addNoteResult.value = Result.failure(e)
            } finally {
                _loading.value = false
            }
        }
    }

    fun resetSuccess() {
        _success.value = false
    }

    fun clearError() {
        _error.value = null
    }

    private fun getStartOfToday(): Long {
        return Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
    }
}
