package com.studyio.app

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

class BlockedAppActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_BLOCKED_PACKAGE = "blocked_package"
        const val EXTRA_BLOCKED_NAME = "blocked_name"
        const val EXTRA_IS_ULTRA = "is_ultra"
        @Volatile
        var isVisible = false
    }

    private lateinit var subtitleView: TextView
    private lateinit var descView: TextView
    private lateinit var badgeView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Make window fullscreen over any app
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val blockedName = intent.getStringExtra(EXTRA_BLOCKED_NAME) ?: "This app"
        val isUltra = intent.getBooleanExtra(EXTRA_IS_ULTRA, false)

        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#09090B"))
            val pad = dpToPx(24)
            setPadding(pad, pad, pad, pad)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Card Container
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            val cardPad = dpToPx(24)
            setPadding(cardPad, cardPad, cardPad, cardPad)
            val bg = GradientDrawable().apply {
                setColor(Color.parseColor("#141416"))
                cornerRadius = dpToPx(28).toFloat()
                setStroke(dpToPx(1), Color.parseColor("#27272A"))
            }
            background = bg
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // Top Pill Badge
        badgeView = TextView(this).apply {
            text = if (isUltra) "⚡ ULTRA STRICT LOCKDOWN" else "STRICT MODE ACTIVE"
            setTextColor(if (isUltra) Color.parseColor("#34D399") else Color.parseColor("#E4E4E7"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            val bPadH = dpToPx(12)
            val bPadV = dpToPx(4)
            setPadding(bPadH, bPadV, bPadH, bPadV)
            val badgeBg = GradientDrawable().apply {
                setColor(if (isUltra) Color.parseColor("#064E3B") else Color.parseColor("#27272A"))
                cornerRadius = dpToPx(16).toFloat()
                setStroke(dpToPx(1), if (isUltra) Color.parseColor("#059669") else Color.parseColor("#3F3F46"))
            }
            background = badgeBg
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dpToPx(18)
            }
            layoutParams = lp
        }
        card.addView(badgeView)

        // Shield Icon
        val iconView = ImageView(this).apply {
            setImageResource(R.drawable.ic_stat_studyio)
            setColorFilter(Color.parseColor("#EF4444"))
            val iconSize = dpToPx(56)
            layoutParams = LinearLayout.LayoutParams(iconSize, iconSize).apply {
                bottomMargin = dpToPx(16)
            }
        }
        card.addView(iconView)

        // Title: "Blocked by Study.io"
        val titleView = TextView(this).apply {
            text = "Blocked by Study.io"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dpToPx(6)
            }
        }
        card.addView(titleView)

        // Subtitle: "[App Name] is blocked"
        subtitleView = TextView(this).apply {
            text = "$blockedName is blocked"
            setTextColor(Color.parseColor("#F87171"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dpToPx(14)
            }
        }
        card.addView(subtitleView)

        // Description Body
        descView = TextView(this).apply {
            text = if (isUltra) {
                "Ultra Strict Mode is active. This app is blocked until your countdown timer finishes."
            } else {
                "Strict Mode is keeping you focused. You cannot open this app during your study session."
            }
            setTextColor(Color.parseColor("#A1A1AA"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.25f)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dpToPx(24)
            }
        }
        card.addView(descView)

        // Primary Button: Return to Study.io (Crisp White High-End Design)
        val returnButton = Button(this).apply {
            text = "RETURN TO STUDY.IO"
            setTextColor(Color.parseColor("#09090B"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            val btnBg = GradientDrawable().apply {
                setColor(Color.WHITE)
                cornerRadius = dpToPx(16).toFloat()
            }
            background = btnBg
            stateListAnimator = null
            setOnClickListener {
                val launchIntent = Intent(this@BlockedAppActivity, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                }
                startActivity(launchIntent)
                finish()
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dpToPx(48)
            ).apply {
                bottomMargin = dpToPx(10)
            }
        }
        card.addView(returnButton)

        // Secondary Button: Exit to Home Screen
        val homeButton = Button(this).apply {
            text = "EXIT TO HOME SCREEN"
            setTextColor(Color.parseColor("#D4D4D8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            val btnBg = GradientDrawable().apply {
                setColor(Color.parseColor("#27272A"))
                cornerRadius = dpToPx(16).toFloat()
                setStroke(dpToPx(1), Color.parseColor("#3F3F46"))
            }
            background = btnBg
            stateListAnimator = null
            setOnClickListener {
                goToHomeScreen()
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dpToPx(44)
            )
        }
        card.addView(homeButton)

        rootLayout.addView(card)
        setContentView(rootLayout)

        // Handle System Back button: Force user to Home screen so they cannot enter the blocked app
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                goToHomeScreen()
            }
        })
    }

    override fun onResume() {
        super.onResume()
        isVisible = true
    }

    override fun onPause() {
        super.onPause()
        isVisible = false
    }

    override fun onDestroy() {
        super.onDestroy()
        isVisible = false
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val blockedName = intent.getStringExtra(EXTRA_BLOCKED_NAME) ?: "This app"
        val isUltra = intent.getBooleanExtra(EXTRA_IS_ULTRA, false)
        subtitleView.text = "$blockedName is blocked"
        if (isUltra) {
            badgeView.text = "⚡ ULTRA STRICT LOCKDOWN"
            badgeView.setTextColor(Color.parseColor("#34D399"))
            descView.text = "Ultra Strict Mode is active. This app is blocked until your countdown timer finishes."
        } else {
            badgeView.text = "STRICT MODE ACTIVE"
            badgeView.setTextColor(Color.parseColor("#E4E4E7"))
            descView.text = "Strict Mode is keeping you focused. You cannot open this app during your study session."
        }
    }

    private fun goToHomeScreen() {
        val homeIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(homeIntent)
        finish()
    }

    private fun dpToPx(dp: Int): Int {
        val scale = resources.displayMetrics.density
        return (dp * scale + 0.5f).toInt()
    }
}
