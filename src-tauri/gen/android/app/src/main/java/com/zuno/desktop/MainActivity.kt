package com.zuno.desktop

import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

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
