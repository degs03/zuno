package com.zuno.desktop

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Before super: swaps the launch (splash) theme for the app theme once drawing starts.
    installSplashScreen()
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

    handleOpenExtra(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleOpenExtra(intent)
  }

  /** The widget's cover opens the full player. */
  private fun handleOpenExtra(intent: Intent?) {
    when (intent?.getStringExtra(EXTRA_OPEN)) {
      "player" -> {
        intent.removeExtra(EXTRA_OPEN)
        ZunoPlugin.dispatchAction("openPlayer")
      }
    }
  }

  /**
   * WryActivity pauses the WebView with the activity, which tells Chromium the page is hidden and
   * throttles its timers hard after a few minutes — the queue would stop advancing with the
   * screen off. While music plays the page is resumed again straight away; paused, it is left
   * paused so an idle app costs nothing.
   */
  override fun onPause() {
    super.onPause()
    // Paused too: a headset press to resume with the screen off is handled in this page.
    if (PlaybackService.isRunning()) ZunoPlugin.instance?.webView()?.onResume()
  }

  companion object {
    const val EXTRA_OPEN = "zuno.open"
  }
}
