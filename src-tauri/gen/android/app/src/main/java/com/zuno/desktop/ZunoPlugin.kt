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
    // The renderer keeps working with the screen off: queue advance, preloading and the media
    // session all run in JS, and a "waived" renderer is the first thing Android starves.
    webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
  }

  /**
   * The frontend has its listeners up: report the audio route and replay anything that arrived
   * while there was no page to hear it (a widget "open player", a headset press at cold start).
   */
  @Command
  fun frontendReady(invoke: Invoke) {
    ready = true
    AudioRoutes.start(activity.applicationContext)
    val queued = synchronized(pending) { pending.toList().also { pending.clear() } }
    val now = android.os.SystemClock.elapsedRealtime()
    queued.filter { now - it.first < PENDING_TTL_MS }.forEach { dispatch(it.second) }
    invoke.resolve()
  }

  /**
   * Opens the system installer for an update APK that Rust downloaded and checksum-verified.
   * Android itself then refuses it unless it is signed with the same key as this install.
   * Rejects with "permission" (after opening the setting) while installs from Zuno are not allowed.
   */
  @Command
  fun installApk(invoke: Invoke) {
    val path = invoke.getArgs().getString("path", "").orEmpty()
    val file = java.io.File(path)
    // Only files Rust put in this app's own cache (the FileProvider shares cache-path only).
    val cache = activity.cacheDir.canonicalFile
    if (!file.isFile || !file.canonicalPath.startsWith(cache.path + java.io.File.separator)) {
      invoke.reject("update file not found")
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
      activity.startActivity(
        Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
          .setData(android.net.Uri.parse("package:${activity.packageName}"))
      )
      invoke.reject("permission")
      return
    }
    val uri = androidx.core.content.FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
    activity.startActivity(
      Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    )
    invoke.resolve()
  }

  /** Keeps the display on while car mode or karaoke is open. */
  @Command
  fun setKeepScreenOn(invoke: Invoke) {
    val on = invoke.getArgs().optBoolean("on", false)
    main.post {
      val flag = android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      if (on) activity.window.addFlags(flag) else activity.window.clearFlags(flag)
    }
    invoke.resolve()
  }

  /** Bit-perfect USB DAC output at the playing track's sample rate (Android 14+). */
  @Command
  fun setBitPerfect(invoke: Invoke) {
    val args = invoke.getArgs()
    val status = AudioRoutes.applyBitPerfect(
      activity.applicationContext,
      args.optBoolean("enabled", false),
      args.optInt("sampleRate", 48000),
    )
    invoke.resolve(JSObject().put("status", status))
  }

  /** Headset gestures and resume-on-connect, read by PlaybackService and AudioRoutes. */
  @Command
  fun setHeadsetPrefs(invoke: Invoke) {
    AudioRoutes.savePrefs(activity.applicationContext, invoke.getArgs())
    invoke.resolve()
  }

  override fun onDestroy() {
    if (instance === this) {
      instance = null
      ready = false
    }
  }

  /** The WebView itself, so MainActivity can keep it resumed while music plays. */
  fun webView(): WebView? = webView

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

  /** `#rrggbb` accent, persisted for the widget and notification (they outlive the WebView). */
  @Command
  fun setAccent(invoke: Invoke) {
    val color = runCatching { android.graphics.Color.parseColor(invoke.getArgs().getString("color", "")) }.getOrNull()
    if (color != null) NowPlayingWidget.setAccent(activity.applicationContext, color)
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
      liked = args.optBoolean("liked", false),
      shuffle = args.optBoolean("shuffle", false),
      repeat = args.optString("repeat", "off").takeIf { it == "all" || it == "one" } ?: "off",
      nextTitle = args.optString("nextTitle").takeIf { it.isNotEmpty() && it != "null" },
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

    /** True once the page called `frontendReady`; until then events are queued. */
    @Volatile
    private var ready = false

    /** Events with nobody listening yet, with when they happened. Short-lived on purpose. */
    private val pending = ArrayList<Pair<Long, JSONObject>>()
    private const val PENDING_TTL_MS = 15_000L
    private const val PENDING_MAX = 8

    fun dispatchAction(action: String, extra: (JSONObject.() -> Unit)? = null) {
      val detail = JSONObject().put("type", "media").put("action", action)
      extra?.invoke(detail)
      val plugin = instance
      if (plugin != null && ready) {
        plugin.dispatch(detail)
        return
      }
      // No page yet (cold start from the widget or a headset): hold it for `frontendReady`.
      synchronized(pending) {
        pending.add(android.os.SystemClock.elapsedRealtime() to detail)
        while (pending.size > PENDING_MAX) pending.removeAt(0)
      }
    }
  }
}
