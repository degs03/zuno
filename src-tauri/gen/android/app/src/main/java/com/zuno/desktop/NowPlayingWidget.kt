package com.zuno.desktop

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.support.v4.media.session.PlaybackStateCompat
import android.util.SizeF
import android.widget.RemoteViews
import androidx.media.session.MediaButtonReceiver
import java.io.File
import kotlin.math.min

/**
 * Home-screen "now playing" widget, in three sizes the launcher swaps between as it is resized:
 *
 * - 4x1: cover, title, play and next.
 * - 4x2: adds previous, like and a progress bar.
 * - 4x3: adds shuffle, repeat, "up next" and elapsed/total times.
 *
 * [PlaybackService] pushes every change here. The last track is kept in SharedPreferences (and
 * its cover in a file), so after the process dies the widget still shows what was playing and
 * a tap reopens Zuno to resume it, instead of falling back to a blank card.
 */
class NowPlayingWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { render(context, manager, it) }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle,
  ) {
    render(context, manager, id)
  }

  data class Snapshot(
    val title: String,
    val artist: String,
    val playing: Boolean,
    val art: Bitmap?,
    val liked: Boolean = false,
    val shuffle: Boolean = false,
    val repeat: String = "off",
    val nextTitle: String? = null,
    val positionSec: Double = 0.0,
    val durationSec: Double = 0.0,
    /** When `positionSec` was true, for extrapolating progress between pushes. */
    val stampMs: Long = SystemClock.elapsedRealtime(),
  )

  companion object {
    private const val PREFS = "zuno-ui"
    private const val SNAPSHOT_PREFS = "zuno-widget"
    private const val KEY_ACCENT = "accent"
    private const val DEFAULT_ACCENT = 0xFFE8002E.toInt()
    private const val ART_PX = 256
    private const val ART_FILE = "widget-art.png"
    /** Progress-only changes repaint at most this often; anything else repaints at once. */
    /** How often the progress bar alone is refreshed (a partial update, no bitmaps). */
    private const val PROGRESS_REFRESH_MS = 10_000L
    private const val INACTIVE_ICON = 0xB3FFFFFF.toInt()

    @Volatile
    private var current: Snapshot? = null
    @Volatile
    private var loaded = false
    private var lastPaintMs = 0L
    private var lastPaintKey: String? = null
    /** Track whose cover is already thumbnailed in `current` (and on disk). */
    private var artSourceFor: String? = null

    /** From [PlaybackService.render] on every state change. */
    fun push(context: Context, state: PlaybackService.State, playing: Boolean, art: Bitmap?) {
      val previous = load(context)
      val sameTrack = previous?.title == state.title && previous.artist == state.artist
      // The service passes its full-size cover on every update; thumbnail it once per track.
      val reuse = previous?.art?.takeIf { sameTrack && artSourceFor == "${state.title}|${state.artist}" }
      val newArt = reuse == null && art != null
      val thumb = reuse ?: art?.let(::roundedThumb) ?: previous?.art?.takeIf { sameTrack }
      if (newArt) artSourceFor = "${state.title}|${state.artist}"
      val next = Snapshot(
        title = state.title,
        artist = state.artist,
        playing = playing,
        art = thumb,
        liked = state.liked,
        shuffle = state.shuffle,
        repeat = state.repeat,
        nextTitle = state.nextTitle,
        positionSec = state.positionSec,
        durationSec = state.durationSec,
      )
      current = next
      val key = listOf(next.title, next.artist, next.playing, next.liked, next.shuffle, next.repeat, next.nextTitle, thumb != null).joinToString("|")
      val now = SystemClock.elapsedRealtime()
      if (!newArt && key == lastPaintKey) {
        /*
         * Nothing but the position moved. Rebuilding the whole widget (cover and EQ bitmaps
         * included) every few seconds made launchers redraw it visibly — the flicker. The bar
         * alone goes through a partial update instead, and only every 10 s.
         */
        if (now - lastPaintMs >= PROGRESS_REFRESH_MS) {
          lastPaintMs = now
          updateProgressOnly(context, next)
        }
        return
      }
      save(context, next, writeArt = newArt)
      lastPaintKey = key
      lastPaintMs = now
      refreshAll(context)
    }

    private fun updateProgressOnly(context: Context, snap: Snapshot) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, NowPlayingWidget::class.java))
      if (ids.isEmpty() || snap.durationSec <= 0) return
      val permille = ((snap.positionSec / snap.durationSec) * 1000).toInt().coerceIn(0, 1000)
      // Every layout has a widget_progress (hidden in the 4x1), so this applies to any size.
      val views = RemoteViews(context.packageName, R.layout.widget_now_playing_small)
      views.setProgressBar(R.id.widget_progress, 1000, permille, false)
      manager.partiallyUpdateAppWidget(ids, views)
    }

    /** The service stopped: keep the last track on screen, paused, as a way back in. */
    fun idle(context: Context) {
      val last = load(context) ?: return refreshAll(context)
      current = last.copy(playing = false)
      save(context, current!!, false)
      lastPaintKey = null
      refreshAll(context)
    }

    fun setAccent(context: Context, color: Int) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(KEY_ACCENT, color).apply()
      refreshAll(context)
    }

    fun accent(context: Context): Int =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_ACCENT, DEFAULT_ACCENT)

    // ---- Persistence -----------------------------------------------------------------------

    private fun load(context: Context): Snapshot? {
      if (loaded) return current
      loaded = true
      val prefs = context.getSharedPreferences(SNAPSHOT_PREFS, Context.MODE_PRIVATE)
      val title = prefs.getString("title", null) ?: return null
      val artFile = File(context.filesDir, ART_FILE)
      val art = if (artFile.exists()) runCatching { BitmapFactory.decodeFile(artFile.path) }.getOrNull() else null
      current = Snapshot(
        title = title,
        artist = prefs.getString("artist", "") ?: "",
        playing = false,
        art = art,
        liked = prefs.getBoolean("liked", false),
        shuffle = prefs.getBoolean("shuffle", false),
        repeat = prefs.getString("repeat", "off") ?: "off",
        nextTitle = prefs.getString("nextTitle", null),
        positionSec = prefs.getFloat("position", 0f).toDouble(),
        durationSec = prefs.getFloat("duration", 0f).toDouble(),
      )
      return current
    }

    private fun save(context: Context, snap: Snapshot, writeArt: Boolean) {
      context.getSharedPreferences(SNAPSHOT_PREFS, Context.MODE_PRIVATE).edit()
        .putString("title", snap.title)
        .putString("artist", snap.artist)
        .putBoolean("liked", snap.liked)
        .putBoolean("shuffle", snap.shuffle)
        .putString("repeat", snap.repeat)
        .putString("nextTitle", snap.nextTitle)
        .putFloat("position", snap.positionSec.toFloat())
        .putFloat("duration", snap.durationSec.toFloat())
        .apply()
      val artFile = File(context.filesDir, ART_FILE)
      if (writeArt && snap.art != null) {
        runCatching { artFile.outputStream().use { snap.art.compress(Bitmap.CompressFormat.PNG, 100, it) } }
      } else if (snap.art == null && artFile.exists()) {
        // A new track with no cover yet must not reopen later wearing the old one.
        artFile.delete()
      }
    }

    // ---- Rendering -------------------------------------------------------------------------

    private fun refreshAll(context: Context) {
      load(context)
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, NowPlayingWidget::class.java))
      ids.forEach { render(context, manager, it) }
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int) {
      load(context)
      val views = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        // The launcher picks the layout that fits as the user resizes the widget.
        RemoteViews(
          mapOf(
            SizeF(180f, 40f) to build(context, R.layout.widget_now_playing_small),
            SizeF(250f, 100f) to build(context, R.layout.widget_now_playing),
            SizeF(250f, 180f) to build(context, R.layout.widget_now_playing_large),
          )
        )
      } else {
        val minHeight = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
        build(
          context,
          when {
            minHeight < 100 -> R.layout.widget_now_playing_small
            minHeight < 170 -> R.layout.widget_now_playing
            else -> R.layout.widget_now_playing_large
          },
        )
      }
      manager.updateAppWidget(id, views)
    }

    private fun build(context: Context, layout: Int): RemoteViews {
      val views = RemoteViews(context.packageName, layout)
      val snap = current
      val active = snap != null && PlaybackService.isRunning()
      val accent = accent(context)
      val small = layout == R.layout.widget_now_playing_small
      val large = layout == R.layout.widget_now_playing_large

      if (snap != null) {
        views.setTextViewText(R.id.widget_title, snap.title)
        views.setTextViewText(
          R.id.widget_artist,
          if (active) snap.artist else context.getString(R.string.widget_resume),
        )
        if (snap.art != null) views.setImageViewBitmap(R.id.widget_art, snap.art)
        else views.setImageViewResource(R.id.widget_art, R.mipmap.ic_launcher)
      } else {
        views.setTextViewText(R.id.widget_title, context.getString(R.string.app_name))
        views.setTextViewText(R.id.widget_artist, context.getString(R.string.widget_idle))
        views.setImageViewResource(R.id.widget_art, R.mipmap.ic_launcher)
      }

      views.setImageViewResource(
        R.id.widget_play_icon,
        if (snap?.playing == true && active) R.drawable.widget_ic_pause else R.drawable.widget_ic_play,
      )
      views.setInt(R.id.widget_play_bg, "setColorFilter", accent)
      views.setInt(R.id.widget_play_icon, "setColorFilter", foregroundFor(accent))

      if (!small) {
        val liked = snap?.liked == true
        views.setImageViewResource(R.id.widget_like, if (liked) R.drawable.widget_ic_heart_filled else R.drawable.widget_ic_heart)
        views.setInt(R.id.widget_like, "setColorFilter", if (liked) accent else INACTIVE_ICON)
        paintProgress(views, snap, accent, large)
      }
      if (large) {
        views.setInt(R.id.widget_shuffle, "setColorFilter", if (snap?.shuffle == true) accent else INACTIVE_ICON)
        views.setImageViewResource(
          R.id.widget_repeat,
          if (snap?.repeat == "one") R.drawable.widget_ic_repeat_one else R.drawable.widget_ic_repeat,
        )
        views.setInt(R.id.widget_repeat, "setColorFilter", if (snap != null && snap.repeat != "off") accent else INACTIVE_ICON)
        val upNext = snap?.nextTitle?.takeIf { it.isNotBlank() && active }
        views.setTextViewText(R.id.widget_next_title, upNext?.let { context.getString(R.string.widget_up_next, it) } ?: "")
      }

      val open = openApp(context, 1, null)
      views.setOnClickPendingIntent(R.id.widget_art, openApp(context, 2, "player"))
      views.setOnClickPendingIntent(R.id.widget_title, open)
      views.setOnClickPendingIntent(R.id.widget_artist, open)

      if (active) {
        // Same path as the notification buttons: MediaButtonReceiver -> PlaybackService session.
        // Explicit play/pause, not PLAY_PAUSE: that keycode goes through the headset tap counter,
        // which would delay a widget tap and turn a quick double tap into "next".
        views.setOnClickPendingIntent(
          R.id.widget_play,
          MediaButtonReceiver.buildMediaButtonPendingIntent(
            context,
            if (snap?.playing == true) PlaybackStateCompat.ACTION_PAUSE else PlaybackStateCompat.ACTION_PLAY,
          ),
        )
        // Skips go straight to the service, not through media keys: MEDIA_NEXT/PREVIOUS keys are
        // the Bluetooth earbuds' double/triple tap, which the user can remap to other gestures.
        views.setOnClickPendingIntent(R.id.widget_next, PlaybackService.skipIntent(context, "next"))
        if (!small) {
          views.setOnClickPendingIntent(R.id.widget_prev, PlaybackService.skipIntent(context, "previous"))
          views.setOnClickPendingIntent(R.id.widget_like, custom(context, "like"))
        }
        if (large) {
          views.setOnClickPendingIntent(R.id.widget_shuffle, custom(context, "shuffle"))
          views.setOnClickPendingIntent(R.id.widget_repeat, custom(context, "repeat"))
        }
      } else {
        // Nothing loaded (or the app was closed): every control opens Zuno, which restores the
        // session the widget is showing.
        listOf(R.id.widget_play, R.id.widget_next).forEach { views.setOnClickPendingIntent(it, open) }
        if (!small) listOf(R.id.widget_prev, R.id.widget_like).forEach { views.setOnClickPendingIntent(it, open) }
        if (large) listOf(R.id.widget_shuffle, R.id.widget_repeat).forEach { views.setOnClickPendingIntent(it, open) }
      }
      return views
    }

    private fun paintProgress(views: RemoteViews, snap: Snapshot?, accent: Int, withTimes: Boolean) {
      val duration = snap?.durationSec ?: 0.0
      var position = snap?.positionSec ?: 0.0
      if (snap?.playing == true) position += (SystemClock.elapsedRealtime() - snap.stampMs) / 1000.0
      position = position.coerceIn(0.0, duration.coerceAtLeast(0.0))
      val permille = if (duration > 0) ((position / duration) * 1000).toInt() else 0
      views.setProgressBar(R.id.widget_progress, 1000, permille, false)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        views.setColorStateList(R.id.widget_progress, "setProgressTintList", ColorStateList.valueOf(accent))
      }
      if (withTimes) {
        views.setTextViewText(R.id.widget_elapsed, if (duration > 0) clock(position) else "")
        views.setTextViewText(R.id.widget_duration, if (duration > 0) clock(duration) else "")
      }
    }

    private fun clock(seconds: Double): String {
      val total = seconds.toInt()
      val h = total / 3600
      val m = (total % 3600) / 60
      val s = total % 60
      return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }

    private fun custom(context: Context, action: String): PendingIntent = PendingIntent.getService(
      context, action.hashCode(),
      Intent(context, PlaybackService::class.java)
        .setAction(PlaybackService.ACTION_CUSTOM)
        .putExtra(PlaybackService.EXTRA_ACTION, action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun openApp(context: Context, requestCode: Int, open: String?): PendingIntent = PendingIntent.getActivity(
      context, requestCode,
      Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .apply { if (open != null) putExtra(MainActivity.EXTRA_OPEN, open) },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /** Near-black on light accents (the neons), white on dark ones. */
    private fun foregroundFor(color: Int): Int {
      fun channel(c: Int): Double {
        val s = c / 255.0
        return if (s <= 0.03928) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4)
      }
      val l = 0.2126 * channel(Color.red(color)) + 0.7152 * channel(Color.green(color)) +
        0.0722 * channel(Color.blue(color))
      return if (l > 0.4) 0xFF0A0A0A.toInt() else Color.WHITE
    }

    /** Center-cropped, ≤256 px, rounded-corner thumbnail (keeps RemoteViews well under its size cap). */
    private fun roundedThumb(src: Bitmap): Bitmap {
      val side = min(src.width, src.height)
      val square = Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
      val size = min(side, ART_PX)
      val scaled = if (side == size) square else Bitmap.createScaledBitmap(square, size, size, true)
      val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        shader = BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
      }
      val radius = size * 0.12f
      Canvas(out).drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), radius, radius, paint)
      return out
    }
  }
}
