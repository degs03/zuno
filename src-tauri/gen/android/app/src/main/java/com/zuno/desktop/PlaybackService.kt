package com.zuno.desktop

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.PowerManager
import android.view.KeyEvent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media.session.MediaButtonReceiver
import java.net.URL
import java.util.concurrent.Executors

/**
 * Keeps the process alive while music plays (the Rust engine decodes in-process, so Android
 * would otherwise freeze it in the background) and owns the MediaSession behind the
 * notification, lock screen, Bluetooth and headset buttons. Every control is forwarded to the
 * frontend as the same `NativeMediaAction` the desktop sessions emit.
 */
class PlaybackService : Service() {
  data class State(
    val title: String,
    val artist: String,
    val artworkUrl: String?,
    val status: String,
    val durationSec: Double,
    val positionSec: Double,
    val liked: Boolean = false,
    val shuffle: Boolean = false,
    /** "off", "all" or "one". */
    val repeat: String = "off",
    val nextTitle: String? = null,
  )

  private lateinit var session: MediaSessionCompat
  private lateinit var audio: AudioManager
  private var focusRequest: AudioFocusRequest? = null
  private var hasFocus = false
  private var pausedByFocusLoss = false
  private var noisyRegistered = false
  private var artworkFor: String? = null
  private var artwork: Bitmap? = null
  private val main = Handler(Looper.getMainLooper())
  private val io = Executors.newSingleThreadExecutor()
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  // One-button headset gestures: presses are counted until the window closes, then acted on.
  private var presses = 0
  private var longPressFired = false
  private val pressWindow = Runnable { firePresses() }

  /** Released this long after a pause, so a resume with the screen off is instant and online. */
  private val releaseLocksLater = Runnable { releaseLocks() }

  private val noisy = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) userAction("pause")
    }
  }

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    holdActionWakeLock()
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS -> {
        hasFocus = false
        pausedByFocusLoss = false
        ZunoPlugin.dispatchAction("pause")
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        // "loading" too: a call that lands while the next track loads must still resume after.
        if (isPlaying()) {
          pausedByFocusLoss = true
          ZunoPlugin.dispatchAction("pause")
        }
      }
      AudioManager.AUDIOFOCUS_GAIN -> {
        hasFocus = true
        if (pausedByFocusLoss) {
          pausedByFocusLoss = false
          ZunoPlugin.dispatchAction("play")
        }
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    audio = getSystemService(AUDIO_SERVICE) as AudioManager
    createChannel()
    session = MediaSessionCompat(this, "Zuno").apply {
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() = userAction("play")
        override fun onPause() = userAction("pause")
        override fun onStop() = userAction("pause")
        override fun onSkipToNext() = userAction("next")
        override fun onSkipToPrevious() = userAction("previous")
        override fun onSeekTo(pos: Long) {
          holdActionWakeLock()
          ZunoPlugin.dispatchAction("seekTo") { put("positionSec", pos / 1000.0) }
        }

        override fun onMediaButtonEvent(mediaButtonEvent: Intent): Boolean {
          // Android's media-key wakelock ends when this returns; ours covers the press window,
          // the hop into the WebView and the Rust resume or track load that follows.
          holdActionWakeLock()
          @Suppress("DEPRECATION") // The typed overload is API 33+; minSdk is 26.
          val event = mediaButtonEvent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT)
            ?: return super.onMediaButtonEvent(mediaButtonEvent)
          return handleHeadsetKey(event) || super.onMediaButtonEvent(mediaButtonEvent)
        }
      })
      setSessionActivity(openAppIntent())
      isActive = true
    }
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_CUSTOM) {
      // Widget extras (like, shuffle, repeat): the WebView owns that state, so just forward.
      holdActionWakeLock()
      intent.getStringExtra(EXTRA_ACTION)?.let { ZunoPlugin.dispatchAction(it) }
    } else {
      MediaButtonReceiver.handleIntent(session, intent)
    }
    if (state == null) {
      // Started by a stale media button (widget/headset) with nothing loaded: Android still
      // requires the foreground promise to be kept before we can go away.
      ServiceCompat.startForeground(
        this, NOTIFICATION_ID,
        NotificationCompat.Builder(this, CHANNEL_ID).setSmallIcon(R.mipmap.ic_launcher).build(),
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0,
      )
      stopSelf()
      return START_NOT_STICKY
    }
    render()
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Swiping the app away stops playback, as users expect from a desktop-first player.
    stopSelf()
  }

  override fun onDestroy() {
    instance = null
    main.removeCallbacks(pressWindow)
    main.removeCallbacks(releaseLocksLater)
    releaseLocks()
    actionWakeLock?.takeIf { it.isHeld }?.release()
    abandonFocus()
    if (noisyRegistered) unregisterReceiver(noisy)
    session.release()
    io.shutdown()
    NowPlayingWidget.idle(this)
    super.onDestroy()
  }

  private fun render() {
    val s = state ?: return
    val playing = s.status == "playing" || s.status == "loading"

    session.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, s.title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, s.artist)
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, (s.durationSec * 1000).toLong())
        .apply { artwork?.let { putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) } }
        .build()
    )
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_STOP
        )
        .setState(
          if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
          (s.positionSec * 1000).toLong(),
          if (s.status == "playing") 1f else 0f,
        )
        .build()
    )

    if (s.status == "playing") {
      main.removeCallbacks(releaseLocksLater)
      acquireLocks()
    } else if (s.status == "paused") {
      // Not at once: a press to resume a minute later must find the CPU and Wi-Fi awake.
      main.removeCallbacks(releaseLocksLater)
      main.postDelayed(releaseLocksLater, PAUSED_LOCK_GRACE_MS)
    }

    if (playing) {
      requestFocus()
      if (!noisyRegistered) {
        ContextCompat.registerReceiver(
          this, noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
          ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        noisyRegistered = true
      }
    }

    // Foreground the whole time a track is loaded, paused included: resuming from the
    // notification later must not need a new foreground start, which Android 12+ forbids
    // from the background.
    ServiceCompat.startForeground(
      this, NOTIFICATION_ID, buildNotification(s, playing),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0,
    )
    NowPlayingWidget.push(this, s, playing, artwork)
    loadArtwork(s.artworkUrl)
  }

  private fun buildNotification(s: State, playing: Boolean): Notification {
    fun action(icon: Int, title: String, action: Long) = NotificationCompat.Action(
      icon, title, MediaButtonReceiver.buildMediaButtonPendingIntent(this, action),
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setColor(NowPlayingWidget.accent(this))
      .setContentTitle(s.title)
      .setContentText(s.artist)
      .setLargeIcon(artwork)
      .setContentIntent(openAppIntent())
      .setDeleteIntent(MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_STOP))
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setOngoing(playing)
      .addAction(action(android.R.drawable.ic_media_previous, "Previous", PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS))
      .addAction(
        if (playing) action(android.R.drawable.ic_media_pause, "Pause", PlaybackStateCompat.ACTION_PAUSE)
        else action(android.R.drawable.ic_media_play, "Play", PlaybackStateCompat.ACTION_PLAY)
      )
      .addAction(action(android.R.drawable.ic_media_next, "Next", PlaybackStateCompat.ACTION_SKIP_TO_NEXT))
      .setStyle(MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
      .build()
  }

  private fun loadArtwork(url: String?) {
    if (url == artworkFor) return
    artworkFor = url
    artwork = null
    if (url == null) return
    io.execute {
      val bitmap = runCatching {
        if (url.startsWith("http")) URL(url).openStream().use { BitmapFactory.decodeStream(it) }
        else BitmapFactory.decodeFile(url.removePrefix("file://"))
      }.getOrNull()
      main.post {
        if (artworkFor == url && bitmap != null) {
          artwork = bitmap
          render()
        }
      }
    }
  }

  /**
   * HEADSETHOOK / PLAY_PAUSE from a one-button headset or earbud: 1 press toggles, 2 and 3 do
   * what the user chose (default next / previous), holding does the long-press gesture.
   * Dedicated NEXT/PREVIOUS keys fall through to the default handling.
   */
  private fun handleHeadsetKey(event: KeyEvent): Boolean {
    if (event.keyCode != KeyEvent.KEYCODE_HEADSETHOOK && event.keyCode != KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
      return false
    }
    when (event.action) {
      KeyEvent.ACTION_DOWN -> {
        if (event.repeatCount > 0 && !longPressFired && (event.isLongPress || event.repeatCount >= 2)) {
          longPressFired = true
          main.removeCallbacks(pressWindow)
          presses = 0
          perform(AudioRoutes.gesture(this, "long", "none"))
        }
      }
      KeyEvent.ACTION_UP -> {
        if (longPressFired) {
          longPressFired = false
          return true
        }
        presses += 1
        main.removeCallbacks(pressWindow)
        if (presses >= 3) firePresses() else main.postDelayed(pressWindow, PRESS_WINDOW_MS)
      }
    }
    return true
  }

  private fun firePresses() {
    val count = presses
    presses = 0
    when (count) {
      0 -> Unit
      1 -> perform("playPause")
      2 -> perform(AudioRoutes.gesture(this, "double", "next"))
      else -> perform(AudioRoutes.gesture(this, "triple", "previous"))
    }
  }

  private fun perform(action: String) {
    when (action) {
      "none", "" -> Unit
      "playPause" -> userAction(if (isPlaying()) "pause" else "play")
      else -> userAction(action)
    }
  }

  /** A control the user pressed. A manual pause cancels a pending resume after a call. */
  private fun userAction(action: String) {
    holdActionWakeLock()
    if (action == "pause") pausedByFocusLoss = false
    ZunoPlugin.dispatchAction(action)
  }

  private var actionWakeLock: PowerManager.WakeLock? = null

  /** Short CPU hold so a press handled with the screen off and nothing playing is not frozen. */
  private fun holdActionWakeLock() {
    val lock = actionWakeLock ?: (getSystemService(POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "zuno:action")
      .apply { setReferenceCounted(false) }
      .also { actionWakeLock = it }
    lock.acquire(ACTION_WAKE_LOCK_MS)
  }

  /**
   * CPU and Wi-Fi stay awake while music plays with the screen off: the Rust engine decodes on
   * its own thread and streams over the network, and Doze / Wi-Fi power save would otherwise
   * starve both. Released on pause, so a paused phone sleeps normally.
   */
  private fun acquireLocks() {
    if (wakeLock?.isHeld != true) {
      val power = getSystemService(POWER_SERVICE) as PowerManager
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "zuno:playback").apply {
        setReferenceCounted(false)
        acquire(WAKE_LOCK_TIMEOUT_MS)
      }
    } else {
      // Renewed on every playing update so it never lapses mid-album, never outlives the app.
      wakeLock?.acquire(WAKE_LOCK_TIMEOUT_MS)
    }
    if (wifiLock?.isHeld != true) {
      val wifi = applicationContext.getSystemService(WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) WifiManager.WIFI_MODE_FULL_HIGH_PERF else WifiManager.WIFI_MODE_FULL
      wifiLock = wifi.createWifiLock(mode, "zuno:stream").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
  }

  private fun releaseLocks() {
    wakeLock?.takeIf { it.isHeld }?.release()
    wifiLock?.takeIf { it.isHeld }?.release()
  }

  private fun requestFocus() {
    if (hasFocus) return
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build()
      )
      .setOnAudioFocusChangeListener(focusListener, main)
      .setAcceptsDelayedFocusGain(true)
      .build()
    focusRequest?.let { audio.abandonAudioFocusRequest(it) }
    focusRequest = request
    when (audio.requestAudioFocus(request)) {
      AudioManager.AUDIOFOCUS_REQUEST_GRANTED -> hasFocus = true
      // Granted later through AUDIOFOCUS_GAIN (a call is ringing): resume then.
      AudioManager.AUDIOFOCUS_REQUEST_DELAYED -> {
        hasFocus = true // Pending; must not re-request on every render.
        if (state?.status == "playing") {
          pausedByFocusLoss = true
          ZunoPlugin.dispatchAction("pause")
        }
      }
      else -> hasFocus = false // Retried on the next render.
    }
  }

  private fun abandonFocus() {
    focusRequest?.let { audio.abandonAudioFocusRequest(it) }
    hasFocus = false
  }

  private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
    this, 0,
    Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
  )

  private fun createChannel() {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW).apply {
        setShowBadge(false)
      }
    )
  }

  companion object {
    private const val CHANNEL_ID = "playback"
    private const val NOTIFICATION_ID = 1
    private const val PRESS_WINDOW_MS = 450L
    private const val PAUSED_LOCK_GRACE_MS = 3 * 60 * 1000L
    private const val ACTION_WAKE_LOCK_MS = 20 * 1000L
    /** Safety net: a wake lock is renewed while playing and can never be held for longer. */
    private const val WAKE_LOCK_TIMEOUT_MS = 30 * 60 * 1000L
    const val ACTION_CUSTOM = "com.zuno.desktop.CUSTOM_ACTION"
    const val EXTRA_ACTION = "action"

    @Volatile
    private var state: State? = null

    @Volatile
    private var instance: PlaybackService? = null

    fun isRunning(): Boolean = instance != null

    fun isPaused(): Boolean = state?.status == "paused"

    fun isPlaying(): Boolean = state?.status == "playing" || state?.status == "loading"

    fun current(): State? = state

    /** Called for every state change from the frontend's media-session hook. */
    fun update(context: Context, incoming: State) {
      // A failed track keeps the session as a paused one: tearing it down took the
      // notification and every headset button with it, so nothing could ever retry.
      val next = if (incoming.status == "error") incoming.copy(status = "paused") else incoming
      val active = next.status == "playing" || next.status == "paused" || next.status == "loading"
      Handler(Looper.getMainLooper()).post {
        if (!active || next.title.isEmpty()) {
          state = null
          instance?.stopSelf()
          return@post
        }
        state = next
        val running = instance
        if (running != null) {
          running.render()
        } else if (next.status == "playing") {
          // Only a user-started play may start the service; it is then foreground until stop.
          try {
            ContextCompat.startForegroundService(context, Intent(context, PlaybackService::class.java))
          } catch (error: IllegalStateException) {
            // Android 12+ refuses a foreground start from the background; never crash for it.
            android.util.Log.w("Zuno", "PlaybackService start refused", error)
          }
        }
      }
    }
  }
}
