package com.example.gpt

import android.content.Context
import android.os.Bundle
import android.view.GestureDetector
import android.view.MotionEvent
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.GestureDetectorCompat
import kotlin.math.abs

abstract class BaseActivity : AppCompatActivity() {

    protected lateinit var languageManager: LanguageManager
    private lateinit var gestureDetector: GestureDetectorCompat
    private var isLanguageChanging = false

    override fun attachBaseContext(newBase: Context) {
        languageManager = LanguageManager(newBase)
        super.attachBaseContext(LanguageManager.wrapContext(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        gestureDetector = GestureDetectorCompat(this, SwipeGestureListener())
    }

    override fun dispatchTouchEvent(ev: MotionEvent?): Boolean {
        if (ev != null && !isLanguageChanging) {
            gestureDetector.onTouchEvent(ev)
        }
        return super.dispatchTouchEvent(ev)
    }

    private inner class SwipeGestureListener : GestureDetector.SimpleOnGestureListener() {
        private val SWIPE_DISTANCE_THRESHOLD = 30 
        private val SWIPE_VELOCITY_THRESHOLD = 30

        override fun onFling(
            e1: MotionEvent?,
            e2: MotionEvent,
            velocityX: Float,
            velocityY: Float
        ): Boolean {
            if (e1 == null) return false
            
            val diffX = e2.x - e1.x
            val diffY = e2.y - e1.y

            if (abs(diffX) > abs(diffY)) {
                if (abs(diffX) > SWIPE_DISTANCE_THRESHOLD && abs(velocityX) > SWIPE_VELOCITY_THRESHOLD) {
                    if (diffX > 0) {
                        toggleLanguage("en")
                    } else {
                        toggleLanguage("ta")
                    }
                    return true
                }
            }
            return false
        }
    }

    protected fun toggleLanguage(targetLang: String? = null) {
        val currentLang = languageManager.getLanguage()
        val nextLang = targetLang ?: if (currentLang == "en") "ta" else "en"
        
        if (currentLang != nextLang && !isLanguageChanging) {
            isLanguageChanging = true
            languageManager.setLanguage(nextLang)
            
            val intent = intent
            finish()
            startActivity(intent)
            @Suppress("DEPRECATION")
            overridePendingTransition(0, 0)
        }
    }
}
