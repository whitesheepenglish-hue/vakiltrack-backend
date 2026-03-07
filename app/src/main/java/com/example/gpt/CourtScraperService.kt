package com.example.gpt

import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import org.jsoup.Jsoup
import java.util.concurrent.TimeUnit

class CourtScraperService {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    /**
     * Fetches the next hearing date and status for a case from Tamil Nadu eCourts.
     * Note: eCourts often uses Captcha and anti-scraping measures. 
     * In a production environment, a dedicated backend proxy is highly recommended.
     */
    fun getNextHearingDate(caseNumber: String, district: String): Pair<String?, String?> {
        try {
            // 1. Initial request to get session cookies if needed
            val initialRequest = Request.Builder()
                .url("https://services.ecourts.gov.in/ecourtindia_v6/")
                .build()
            
            val response = client.newCall(initialRequest).execute()
            if (!response.isSuccessful) return null to null

            // 2. Search for the case (Simplified logic as actual eCourts uses complex POST and Captchas)
            // This is a representative structure of how you'd scrape the resulting HTML.
            val searchUrl = "https://services.ecourts.gov.in/ecourtindia_v6/query_logic.php" // Hypothetical endpoint
            
            val formBody = FormBody.Builder()
                .add("caseNumber", caseNumber)
                .add("district", district)
                .build()

            val postRequest = Request.Builder()
                .url(searchUrl)
                .post(formBody)
                .build()

            val postResponse = client.newCall(postRequest).execute()
            val html = postResponse.body?.string() ?: return null to null

            // 3. Extract data using Jsoup
            val doc = Jsoup.parse(html)
            
            // Example selectors - these must be mapped to the actual eCourts DOM structure
            val hearingDate = doc.select(".next_hearing_date").first()?.text()
            val status = doc.select(".case_status").first()?.text()

            return hearingDate to status

        } catch (e: Exception) {
            e.printStackTrace()
            return null to null
        }
    }
}
