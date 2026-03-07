package com.example.gpt.data.model

data class SearchRequest(
    val district: String,
    val courtComplex: String,
    val caseType: String,
    val caseNumber: String,
    val caseYear: String
)

data class CaseDetails(
    val petitionerName: String,
    val respondentName: String,
    val filingDate: String,
    val stage: String,
    val nextHearingDate: String,
    val courtHall: String
)

data class SearchCaseResponse(
    val success: Boolean = false,
    val message: String? = null,
    val data: CaseDetails? = null
)
