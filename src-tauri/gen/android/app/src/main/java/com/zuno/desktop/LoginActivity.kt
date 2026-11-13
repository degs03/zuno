package com.zuno.desktop

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

/** Same constants and acceptance rule as the desktop flow in src-tauri/src/lib.rs. */
object YoutubeLogin {
  const val LOGIN_URL =
    "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://music.youtube.com/"
  const val MUSIC_URL = "https://music.youtube.com"
  private val AUTH_COOKIES = setOf("SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID")

  /** The `Cookie` header for music.youtube.com once the page is there and signed in, else null. */
  fun harvest(currentUrl: String?): String? {
    val host = currentUrl?.let { Uri.parse(it).host } ?: return null
    if (host != "music.youtube.com") return null
    val header = CookieManager.getInstance().getCookie(MUSIC_URL) ?: return null
    val names = header.split(';').map { it.trim().substringBefore('=') }.toSet()
    return if (names.any { it in AUTH_COOKIES }) header else null
  }

  /**
   * Google refuses sign-in from user agents that announce an embedded WebView ("; wv" and the
   * fake "Version/4.0"), and from requests carrying the app's package in X-Requested-With.
   */
  @SuppressLint("SetJavaScriptEnabled")
  fun configure(webView: WebView) {
    val settings = webView.settings
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.cacheMode = WebSettings.LOAD_DEFAULT
    settings.userAgentString = settings.userAgentString
      .replace("; wv)", ")")
      .replace(Regex("Version/\\d+(\\.\\d+)* "), "")
    if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
      WebSettingsCompat.setRequestedWithHeaderOriginAllowList(settings, emptySet())
    }
    CookieManager.getInstance().setAcceptCookie(true)
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
  }
}

/**
 * Per-slot copy of the Google session cookies. Android WebView has a single cookie store, so
 * unlike desktop's per-slot partitions this is what lets a silent refresh renew the *active*
 * account after another one signed in. Kept in private SharedPreferences, excluded from backup.
 */
object LoginSnapshots {
  private const val PREFS = "zuno-login-snapshots"
  private val URLS = listOf(
    "https://accounts.google.com",
    "https://www.google.com",
    "https://accounts.youtube.com",
    "https://music.youtube.com",
  )

  fun save(context: Context, slotId: String) {
    if (slotId.isEmpty()) return
    val cookies = CookieManager.getInstance()
    val snapshot = org.json.JSONObject()
    for (url in URLS) cookies.getCookie(url)?.let { snapshot.put(url, it) }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(slotId, snapshot.toString()).apply()
  }

  /** Replaces the WebView cookie store with the slot's snapshot. False if there is none. */
  fun restore(context: Context, slotId: String, done: (Boolean) -> Unit) {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(slotId, null)
    val cookies = CookieManager.getInstance()
    cookies.removeAllCookies {
      if (raw == null) {
        done(false)
        return@removeAllCookies
      }
      val snapshot = org.json.JSONObject(raw)
      for (url in snapshot.keys()) {
        val host = Uri.parse(url).host ?: continue
        // Registrable domain, so SID & co. reach every google.com / youtube.com host again.
        val domain = "." + host.split('.').takeLast(2).joinToString(".")
        for (pair in snapshot.getString(url).split(';')) {
          val cookie = pair.trim()
          if (cookie.isEmpty()) continue
          val name = cookie.substringBefore('=')
          // __Host- cookies are invalid with a Domain attribute.
          val attrs = if (name.startsWith("__Host-")) "; Path=/; Secure" else "; Domain=$domain; Path=/; Secure"
          cookies.setCookie(url, cookie + attrs)
        }
      }
      cookies.flush()
      done(true)
    }
  }

  fun forget(context: Context, slotId: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(slotId).apply()
  }
}

/**
 * Full-screen Google sign-in. Shows the real address above the page, as the desktop window
 * does, so the user can check they are on accounts.google.com before typing a password.
 */
class LoginActivity : ComponentActivity() {
  private lateinit var webView: WebView
  private lateinit var address: TextView
  private val main = Handler(Looper.getMainLooper())
  private var finished = false
  private var polls = 0

  private val poll = object : Runnable {
    override fun run() {
      if (finished) return
      check()
      // Five minutes, like desktop's poll_for_sign_in.
      if (++polls < 300) main.postDelayed(this, 1000) else cancel()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    current = this

    val density = resources.displayMetrics.density
    val bar = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setBackgroundColor(Color.parseColor("#141414"))
      setPadding((12 * density).toInt(), 0, 0, 0)
    }
    address = TextView(this).apply {
      setTextColor(Color.parseColor("#D0D0D0"))
      typeface = Typeface.MONOSPACE
      textSize = 13f
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
    }
    val close = Button(this, null, android.R.attr.borderlessButtonStyle).apply {
      text = "✕"
      setTextColor(Color.WHITE)
      contentDescription = "Cancel sign-in"
      setOnClickListener { cancel() }
    }
    bar.addView(address, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    bar.addView(close, LinearLayout.LayoutParams((48 * density).toInt(), (48 * density).toInt()))

    webView = WebView(this)
    YoutubeLogin.configure(webView)
    webView.webViewClient = object : WebViewClient() {
      override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
        showAddress(url)
      }

      override fun onPageFinished(view: WebView, url: String?) {
        showAddress(url)
        check()
      }
    }

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.parseColor("#141414"))
      addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (48 * density).toInt()))
      addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    }
    ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }
    setContentView(root)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (webView.canGoBack()) webView.goBack() else cancel()
      }
    })

    // A new sign-in starts from an empty store, the equivalent of desktop's fresh partition:
    // it can only show a clean login / account chooser, never silently reuse another slot.
    CookieManager.getInstance().removeAllCookies {
      webView.loadUrl(YoutubeLogin.LOGIN_URL)
      main.postDelayed(poll, 1000)
    }
  }

  /** Host first and never truncated away: it is what the user checks before typing a password. */
  private fun showAddress(url: String?) {
    val uri = url?.let { Uri.parse(it) }
    val host = uri?.host
    address.text = if (host == null) {
      url.orEmpty()
    } else {
      val secure = if (uri.scheme == "https") "https  " else "NOT SECURE  "
      secure + host + uri.path.orEmpty()
    }
  }

  private fun check() {
    if (finished) return
    val cookie = YoutubeLogin.harvest(webView.url) ?: return
    finished = true
    // The snapshot is saved by Rust once it knows the final slot (a re-sign-in reuses one).
    CookieManager.getInstance().flush()
    setResult(Activity.RESULT_OK, Intent().putExtra(EXTRA_COOKIE, cookie))
    finish()
  }

  fun cancel() {
    if (finished) return
    finished = true
    setResult(Activity.RESULT_CANCELED)
    finish()
  }

  override fun onDestroy() {
    main.removeCallbacks(poll)
    if (current === this) current = null
    webView.destroy()
    super.onDestroy()
  }

  companion object {
    const val EXTRA_SLOT_ID = "slotId"
    const val EXTRA_COOKIE = "cookie"

    @Volatile
    var current: LoginActivity? = null
  }
}

/** Desktop's hidden-window refresh, with an off-screen WebView on the active slot's cookies. */
object SilentRefresh {
  private const val MAX_POLLS = 25

  fun run(activity: Activity, slotId: String, done: (String?) -> Unit) {
    val main = Handler(Looper.getMainLooper())
    main.post {
      LoginSnapshots.restore(activity, slotId) { restored ->
        if (!restored) {
          done(null)
          return@restore
        }
        val webView = WebView(activity)
        YoutubeLogin.configure(webView)
        var loaded = false
        var polls = 0
        var settled = false
        fun finish(cookie: String?) {
          if (settled) return
          settled = true
          if (cookie != null) {
            CookieManager.getInstance().flush()
            LoginSnapshots.save(activity, slotId)
          }
          webView.destroy()
          done(cookie)
        }
        webView.webViewClient = object : WebViewClient() {
          override fun onPageFinished(view: WebView, url: String?) {
            loaded = true
          }
        }
        val tick = object : Runnable {
          override fun run() {
            if (settled) return
            // Cookies read before a navigation finishes are the stale ones we already hold.
            val cookie = if (loaded) YoutubeLogin.harvest(webView.url) else null
            when {
              cookie != null -> finish(cookie)
              ++polls >= MAX_POLLS -> finish(null)
              else -> main.postDelayed(this, 1000)
            }
          }
        }
        webView.loadUrl(YoutubeLogin.LOGIN_URL)
        main.postDelayed(tick, 1000)
      }
    }
  }
}
