package com.zuno.desktop

import android.content.Context
import android.content.SharedPreferences
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import org.json.JSONObject

/**
 * Headphone handling that is not tied to a playing track:
 *
 * - Watches the audio output route (wired, Bluetooth, USB, speaker) for the whole life of the
 *   process and reports the active one to the frontend as a `device` event, so a sound profile
 *   can follow the headphones (see `currentOutputDevice.ts`).
 * - Resumes playback when headphones connect, if the user turned that on and a track is paused.
 * - Holds the headset gesture preferences the MediaSession reads (`HeadsetGestures`).
 *
 * AudioDeviceInfo.productName needs no Bluetooth permission, so neither does any of this.
 */
object AudioRoutes {
  private const val PREFS = "zuno-headset"
  private val main = Handler(Looper.getMainLooper())
  private var registered = false
  private var lastKey: String? = null
  private var initialReportDone = false

  data class Route(val name: String, val kind: String)

  fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** Gesture for a double press, a triple press and a long press of a one-button headset. */
  fun gesture(context: Context, which: String, fallback: String): String =
    prefs(context).getString("gesture.$which", fallback) ?: fallback

  fun resumeOnConnect(context: Context): Boolean = prefs(context).getBoolean("resumeOnConnect", false)

  fun savePrefs(context: Context, values: JSONObject) {
    prefs(context).edit().apply {
      for (which in listOf("double", "triple", "long")) {
        values.optString(which).takeIf { it.isNotEmpty() }?.let { putString("gesture.$which", it) }
      }
      if (values.has("resumeOnConnect")) putBoolean("resumeOnConnect", values.optBoolean("resumeOnConnect"))
    }.apply()
  }

  private fun kindOf(type: Int): String? = when (type) {
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired"
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLE_HEADSET,
    AudioDeviceInfo.TYPE_BLE_SPEAKER, AudioDeviceInfo.TYPE_HEARING_AID -> "bluetooth"
    AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE -> "usb"
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
    else -> null
  }

  /** Where media is going: Bluetooth beats wired beats USB beats the phone speaker. */
  fun current(context: Context): Route {
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val outputs = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    val rank = listOf("bluetooth", "wired", "usb", "speaker")
    val best = outputs
      .mapNotNull { device -> kindOf(device.type)?.let { device to it } }
      .minByOrNull { (_, kind) -> rank.indexOf(kind) }
    return if (best == null || best.second == "speaker") {
      Route("Phone speaker", "speaker")
    } else {
      val name = best.first.productName?.toString()?.trim().orEmpty()
      Route(name.ifEmpty { if (best.second == "wired") "Wired headphones" else "Headphones" }, best.second)
    }
  }

  /** Reports the current route to the frontend. Safe to call repeatedly (e.g. on WebView load). */
  fun report(context: Context, force: Boolean = false) {
    val route = current(context)
    val key = "${route.kind}:${route.name}"
    if (!force && key == lastKey) return
    val previousKind = lastKey?.substringBefore(':')
    lastKey = key
    ZunoPlugin.instance?.dispatch(
      JSONObject().put("type", "device").put("name", route.name).put("kind", route.kind).put("connected", true)
    )
    // Headphones just appeared (not the first report at launch): resume if asked to.
    val connected = route.kind != "speaker" && previousKind == "speaker"
    if (initialReportDone && connected && resumeOnConnect(context) && PlaybackService.isPaused()) {
      ZunoPlugin.dispatchAction("play")
    }
    initialReportDone = true
  }

  /**
   * Bit-perfect USB DAC output (Android 14+): asks the system mixer to pass media straight
   * through to the USB device at `sampleRate`, with no mixing, volume or resampling. Returns a
   * short status for the UI: "bit-perfect", "unsupported" (older Android / DAC refuses that rate)
   * or "no-usb" (no USB DAC connected). `enabled = false` clears the preference.
   */
  fun applyBitPerfect(context: Context, enabled: Boolean, sampleRate: Int): String {
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val usb = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull {
      it.type == AudioDeviceInfo.TYPE_USB_HEADSET || it.type == AudioDeviceInfo.TYPE_USB_DEVICE
    } ?: return "no-usb"
    if (android.os.Build.VERSION.SDK_INT < 34) return "unsupported"
    val media = android.media.AudioAttributes.Builder()
      .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
      .build()
    return runCatching {
      if (!enabled) {
        audio.clearPreferredMixerAttributes(media, usb)
        return@runCatching "off"
      }
      val candidates = audio.getSupportedMixerAttributes(usb).filter {
        it.mixerBehavior == android.media.AudioMixerAttributes.MIXER_BEHAVIOR_BIT_PERFECT &&
          it.format.sampleRate == sampleRate
      }
      // Prefer the deepest PCM the DAC takes at this rate (float, then 32/24-bit, then 16).
      val rank = listOf(
        android.media.AudioFormat.ENCODING_PCM_FLOAT,
        android.media.AudioFormat.ENCODING_PCM_32BIT,
        android.media.AudioFormat.ENCODING_PCM_24BIT_PACKED,
        android.media.AudioFormat.ENCODING_PCM_16BIT,
      )
      val best = candidates.minByOrNull { rank.indexOf(it.format.encoding).let { i -> if (i < 0) 99 else i } }
        ?: return@runCatching "unsupported"
      if (audio.setPreferredMixerAttributes(media, usb, best)) "bit-perfect" else "unsupported"
    }.getOrDefault("unsupported")
  }

  /** Starts watching the route for the life of the process. Idempotent. */
  fun start(context: Context) {
    val app = context.applicationContext
    if (registered) {
      report(app, force = true)
      return
    }
    registered = true
    val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    audio.registerAudioDeviceCallback(object : AudioDeviceCallback() {
      // Both fire once on registration with what is already there; `report` dedupes.
      override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) {
        // Bluetooth announces itself before the route is usable; give it a moment.
        main.postDelayed({ report(app) }, 600)
      }

      override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) {
        report(app)
      }
    }, main)
    report(app, force = true)
  }
}
