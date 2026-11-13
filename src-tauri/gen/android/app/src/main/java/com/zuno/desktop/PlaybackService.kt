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
import android.os.Build
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

  private val noisy = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) ZunoPlugin.dispatchAction("pause")
    }
  }

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS -> {
        hasFocus = false
        ZunoPlugin.dispatchAction("pause")
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        if (state?.status == "playing") {
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
        override fun onPlay() = ZunoPlugin.dispatchAction("play")
        override fun onPause() = ZunoPlugin.dispatchAction("pause")
        override fun onStop() = ZunoPlugin.dispatchAction("pause")
        override fun onSkipToNext() = ZunoPlugin.dispatchAction("next")
        override fun onSkipToPrevious() = ZunoPlugin.dispatchAction("previous")
        override fun onSeekTo(pos: Long) =
          ZunoPlugin.dispatchAction("seekTo") { put("positionSec", pos / 1000.0) }
      })
      setSessionActivity(openAppIntent())
      isActive = true
    }
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    MediaButtonReceiver.handleIntent(session, intent)
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
    NowPlayingWidget.push(this, s.title, s.artist, playing, artwork)
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
      .build()
    focusRequest = request
    hasFocus = audio.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
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

    @Volatile
    private var state: State? = null

    @Volatile
    private var instance: PlaybackService? = null

    fun isRunning(): Boolean = instance != null

    /** Called for every state change from the frontend's media-session hook. */
    fun update(context: Context, next: State) {
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
          ContextCompat.startForegroundService(context, Intent(context, PlaybackService::class.java))
        }
      }
    }
  }
}
