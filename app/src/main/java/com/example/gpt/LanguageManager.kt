package com.example.gpt

import android.content.Context
import android.content.SharedPreferences
import android.content.res.Configuration
import android.os.Build
import android.os.LocaleList
import java.util.Locale

class LanguageManager(private val context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("Settings", Context.MODE_PRIVATE)

    fun setLanguage(languageCode: String): Context {
        persistLanguage(languageCode)
        return updateResources(languageCode)
    }

    fun getLanguage(): String {
        return prefs.getString("selected_language", "en") ?: "en"
    }

    private fun persistLanguage(languageCode: String) {
        prefs.edit().putString("selected_language", languageCode).apply()
    }

    private fun updateResources(languageCode: String): Context {
        val locale = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Locale.forLanguageTag(languageCode)
        } else {
            Locale(languageCode)
        }
        Locale.setDefault(locale)

        val res = context.resources
        val config = Configuration(res.configuration)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            config.setLocales(LocaleList(locale))
        } else {
            @Suppress("DEPRECATION")
            config.locale = locale
        }

        return context.createConfigurationContext(config)
    }

    companion object {
        fun wrapContext(context: Context): Context {
            val languageManager = LanguageManager(context)
            val language = languageManager.getLanguage()
            return languageManager.setLanguage(language)
        }
    }
}
