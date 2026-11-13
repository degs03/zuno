package com.zuno.desktop

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.os.Bundle
import android.support.v4.media.session.PlaybackStateCompat
import android.util.SizeF
import android.widget.RemoteViews
import androidx.media.session.MediaButtonReceiver
import kotlin.math.min

/**
 * Home-screen "now playing" widget. It holds no state of its own: [PlaybackService] pushes every
 * change here, and while nothing is playing the widget shows Zuno's idle card, which opens the app.
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

  data class Snapshot(val title: String, val artist: String, val playing: Boolean, val art: Bitmap?)

  companion object {
    private const val PREFS = "zuno-ui"
    private const val KEY_ACCENT = "accent"
    private const val DEFAULT_ACCENT = 0xFFE8002E.toInt()
    private const val ART_PX = 256

    /** Last pushed track; `null` = idle. Lives as long as the process, like the service. */
    @Volatile
    private var current: Snapshot? = null

    fun push(context: Context, title: String, artist: String, playing: Boolean, art: Bitmap?) {
      current = Snapshot(title, artist, playing, art?.let(::roundedThumb))
      refreshAll(context)
    }

    fun idle(context: Context) {
      current = null
      refreshAll(context)
    }

    fun setAccent(context: Context, color: Int) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(KEY_ACCENT, color).apply()
      refreshAll(context)
    }

    fun accent(context: Context): Int =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_ACCENT, DEFAULT_ACCENT)

    private fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, NowPlayingWidget::class.java))
      ids.forEach { render(context, manager, it) }
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int) {
      val views = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        // The launcher picks the layout that fits as the user resizes the widget.
        RemoteViews(
          mapOf(
            SizeF(180f, 40f) to build(context, R.layout.widget_now_playing_small),
            SizeF(250f, 100f) to build(context, R.layout.widget_now_playing),
          )
        )
      } else {
        val minHeight = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
        build(context, if (minHeight < 100) R.layout.widget_now_playing_small else R.layout.widget_now_playing)
      }
      manager.updateAppWidget(id, views)
    }

    private fun build(context: Context, layout: Int): RemoteViews {
      val views = RemoteViews(context.packageName, layout)
      val snap = current
      val active = snap != null && PlaybackService.isRunning()
      val accent = accent(context)

      if (snap != null) {
        views.setTextViewText(R.id.widget_title, snap.title)
        views.setTextViewText(R.id.widget_artist, snap.artist)
        if (snap.art != null) views.setImageViewBitmap(R.id.widget_art, snap.art)
        else views.setImageViewResource(R.id.widget_art, R.mipmap.ic_launcher)
      } else {
        views.setTextViewText(R.id.widget_title, context.getString(R.string.app_name))
        views.setTextViewText(R.id.widget_artist, context.getString(R.string.widget_idle))
        views.setImageViewResource(R.id.widget_art, R.mipmap.ic_launcher)
      }

      views.setImageViewResource(
        R.id.widget_play_icon,
        if (snap?.playing == true) R.drawable.widget_ic_pause else R.drawable.widget_ic_play,
      )
      views.setInt(R.id.widget_play_bg, "setColorFilter", accent)
      views.setInt(R.id.widget_play_icon, "setColorFilter", foregroundFor(accent))

      val open = openApp(context)
      views.setOnClickPendingIntent(R.id.widget_art, open)
      views.setOnClickPendingIntent(R.id.widget_title, open)
      views.setOnClickPendingIntent(R.id.widget_artist, open)

      if (active) {
        // Same path as the notification buttons: MediaButtonReceiver -> PlaybackService session.
        views.setOnClickPendingIntent(
          R.id.widget_play,
          MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_PLAY_PAUSE),
        )
        views.setOnClickPendingIntent(
          R.id.widget_next,
          MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_SKIP_TO_NEXT),
        )
        views.setOnClickPendingIntent(
          R.id.widget_prev,
          MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS),
        )
      } else {
        // Nothing loaded (or the app is closed): every control simply opens Zuno.
        views.setOnClickPendingIntent(R.id.widget_play, open)
        views.setOnClickPendingIntent(R.id.widget_next, open)
        views.setOnClickPendingIntent(R.id.widget_prev, open)
      }
      return views
    }

    private fun openApp(context: Context): PendingIntent = PendingIntent.getActivity(
      context, 1,
      Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
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
