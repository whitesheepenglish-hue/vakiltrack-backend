package com.example.gpt.data.api

import com.example.gpt.data.model.SearchCaseResponse
import com.example.gpt.data.model.SearchRequest
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface CaseApiService {
    @GET("/")
    suspend fun checkServerStatus(): ResponseBody

    @POST("api/cases/search")
    suspend fun searchCase(
        @Body request: SearchRequest
    ): SearchCaseResponse

    @POST("case-status")
    suspend fun fetchByCnr(
        @Body request: Map<String, String>
    ): SearchCaseResponse

    @GET("case-status")
    suspend fun getCaseStatus(
        @Query("caseNumber") caseNumber: String,
        @Query("courtName") courtName: String
    ): SearchCaseResponse
}
