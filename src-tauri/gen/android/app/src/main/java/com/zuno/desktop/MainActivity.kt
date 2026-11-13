package com.zuno.desktop

import android.os.Bundle
import android.view.View
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Keep the webview clear of the status bar, navigation bar and keyboard natively: older
    // System WebViews report 0 for env(safe-area-inset-*), so CSS alone cannot be trusted.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }

    // Back closes the UI's own layers first (now playing, queue, search…); only when the
    // frontend has nothing left to close does the app go to the background — not finish, so
    // playback carries on.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val plugin = ZunoPlugin.instance
        if (plugin == null) {
          moveTaskToBack(true)
          return
        }
        plugin.handleBack { handled -> if (!handled) moveTaskToBack(true) }
      }
    })
  }
}
