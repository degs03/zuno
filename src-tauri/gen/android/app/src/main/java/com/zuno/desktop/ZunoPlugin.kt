package com.zuno.desktop

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

/**
 * Native side of the Android port. Rust reaches it with `run_mobile_plugin` (see
 * src-tauri/src/android.rs); it reaches the UI by dispatching a `zuno-android` CustomEvent on
 * `window`, which needs no plugin ACL on the frontend.
 */
@TauriPlugin
class ZunoPlugin(private val activity: Activity) : Plugin(activity) {
  private var webView: WebView? = null
  private val main = Handler(Looper.getMainLooper())

  override fun load(webView: WebView) {
    this.webView = webView
    instance = this
  }

  override fun onDestroy() {
    if (instance === this) instance = null
  }

  /** Sends `detail` to the frontend as `window` event `zuno-android`. */
  fun dispatch(detail: JSONObject) {
    main.post {
      webView?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('zuno-android',{detail:$detail}))",
        null,
      )
    }
  }

  /** Asks the frontend (`window.__zunoHandleBack`) whether it consumed a back press. */
  fun handleBack(done: (Boolean) -> Unit) {
    val view = webView ?: return done(false)
    view.evaluateJavascript("(function(){try{return window.__zunoHandleBack?.()===true}catch(e){return false}})()") {
      done(it == "true")
    }
  }

  /** Light theme: dark bar icons on a light window; dark theme: the reverse. */
  @Command
  fun setSystemBars(invoke: Invoke) {
    val light = invoke.getArgs().optBoolean("light", false)
    main.post {
      val window = activity.window
      window.decorView.setBackgroundColor(if (light) 0xFFF0F0F0.toInt() else 0xFF0A0A0A.toInt())
      val controller = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
      controller.isAppearanceLightStatusBars = light
      controller.isAppearanceLightNavigationBars = light
    }
    invoke.resolve()
  }

  // ---- Sign-in ------------------------------------------------------------------------------

  @Command
  fun signIn(invoke: Invoke) {
    val slotId = invoke.getArgs().getString("slotId", "").orEmpty()
    val intent = Intent(activity, LoginActivity::class.java)
      .putExtra(LoginActivity.EXTRA_SLOT_ID, slotId)
    startActivityForResult(invoke, intent, "signInResult")
  }

  @ActivityCallback
  fun signInResult(invoke: Invoke, result: ActivityResult) {
    val cookie = result.data?.getStringExtra(LoginActivity.EXTRA_COOKIE)
    if (result.resultCode == Activity.RESULT_OK && !cookie.isNullOrEmpty()) {
      invoke.resolve(JSObject().put("cookie", cookie))
    } else {
      // Must match LibraryController.isSignInCancellation.
      invoke.reject("YouTube Music sign-in was cancelled.")
    }
  }

  @Command
  fun cancelSignIn(invoke: Invoke) {
    LoginActivity.current?.cancel()
    invoke.resolve()
  }

  @Command
  fun refreshSession(invoke: Invoke) {
    val slotId = invoke.getArgs().getString("slotId", "").orEmpty()
    SilentRefresh.run(activity, slotId) { cookie ->
      invoke.resolve(JSObject().put("cookie", cookie ?: JSONObject.NULL))
    }
  }

  /** Called after a sign-in, once Rust knows which slot the session landed in. */
  @Command
  fun saveSnapshot(invoke: Invoke) {
    LoginSnapshots.save(activity, invoke.getArgs().getString("slotId", "").orEmpty())
    invoke.resolve()
  }

  @Command
  fun forgetSlot(invoke: Invoke) {
    LoginSnapshots.forget(activity, invoke.getArgs().getString("slotId", "").orEmpty())
    invoke.resolve()
  }

  // ---- Media session -----------------------------------------------------------------------

  @Command
  fun updateMediaSession(invoke: Invoke) {
    val args = invoke.getArgs()
    val state = PlaybackService.State(
      title = args.getString("title", "").orEmpty(),
      artist = args.getString("artist", "").orEmpty(),
      artworkUrl = args.optString("artworkUrl").takeIf { it.isNotEmpty() && it != "null" },
      status = args.getString("status", "idle") ?: "idle",
      durationSec = args.optDouble("durationSec", 0.0).takeIf { !it.isNaN() } ?: 0.0,
      positionSec = args.optDouble("positionSec", 0.0).takeIf { !it.isNaN() } ?: 0.0,
    )
    if (state.status == "playing") requestNotificationPermissionOnce()
    PlaybackService.update(activity.applicationContext, state)
    invoke.resolve()
  }

  private var askedForNotifications = false

  private fun requestNotificationPermissionOnce() {
    if (askedForNotifications || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    askedForNotifications = true
    val permission = Manifest.permission.POST_NOTIFICATIONS
    if (ContextCompat.checkSelfPermission(activity, permission) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(activity, arrayOf(permission), 0)
    }
  }

  companion object {
    @Volatile
    var instance: ZunoPlugin? = null

    fun dispatchAction(action: String, extra: (JSONObject.() -> Unit)? = null) {
      val detail = JSONObject().put("type", "media").put("action", action)
      extra?.invoke(detail)
      instance?.dispatch(detail)
    }
  }
}
