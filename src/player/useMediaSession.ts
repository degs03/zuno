import { useCallback, useEffect, useMemo } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PlayerState } from "./PlayerController";
import type { PlayerControllerActions } from "./playerStore";
import { logInternalWarn } from "../internal/logging";
import { useLinuxMediaSession } from "../ui/settings/mediaSession";
import { useOfflineArtworkUrl } from "./offlineStore";
import { onPosition } from "./rustAudio";
import { isAndroid, isLinux, isMacOS, isWindows } from "../ui/platform";
import { onAndroidEvent } from "../ui/android";
import { getArtworkUrlCandidates } from "../datasource/youtube/artwork";
import { syncAndroidBitPerfect } from "../ui/settings/bitPerfect";
import {
  libraryController,
  useLibrarySelector,
  usePlayerSelector,
  usePlayerSessionSelector,
} from "./playerStore";

/** Fired on `window` when Android asks for the full player (the widget's cover). */
export const OPEN_PLAYER_EVENT = "zuno-open-player";

type NativeMediaAction =
  | "play"
  | "pause"
  | "playPause"
  | "next"
  | "previous"
  | { action: "seekTo"; positionSec: number }
  | { action: "setVolume"; volume: number };

const usesNativeWindowsMediaSession = isTauri() && isWindows;
/*
 * macOS goes through MPNowPlayingInfoCenter rather than the WebView's media session, because
 * only the native centre reaches Control Center, the lock screen and the F7-F9 keys. The Rust
 * side (`macos_media.rs`) has always been built and registered — it simply had no caller, so
 * the app was invisible to macOS media controls.
 *
 * Linux registers its own MPRIS2 D-Bus interface (`linux_media.rs`, via souvlaki) rather than
 * relying on WebKitGTK's own bridge, because the bridge doesn't surface next/previous through
 * the desktop widget or media keys. Unlike Windows/macOS this one has an on/off switch — the
 * existing "Show in system media controls" setting — since it's the only platform that ever had
 * one to turn off.
 */
const usesNativeMacosMediaSession = isTauri() && isMacOS;
const usesNativeLinuxMediaSession = isTauri() && isLinux;
/*
 * Android: a MediaSession owned by a foreground service (PlaybackService.kt). Always on — it is
 * also what keeps the process, and so the in-process Rust engine, alive in the background.
 */
const usesNativeAndroidMediaSession = isTauri() && isAndroid;
const usesNativeMediaSession =
  usesNativeWindowsMediaSession ||
  usesNativeMacosMediaSession ||
  usesNativeLinuxMediaSession ||
  usesNativeAndroidMediaSession;

function getNativeMediaCommand(linuxEnabled: boolean): string | null {
  if (usesNativeWindowsMediaSession) return "update_windows_media_session";
  if (usesNativeMacosMediaSession) return "update_macos_media_session";
  if (usesNativeAndroidMediaSession) return "update_android_media_session";
  if (usesNativeLinuxMediaSession && linuxEnabled) return "update_linux_media_session";
  return null;
}

function getNativeMediaControlEvent(linuxEnabled: boolean): string | null {
  if (usesNativeWindowsMediaSession) return "windows-media-control";
  if (usesNativeMacosMediaSession) return "macos-media-control";
  if (usesNativeLinuxMediaSession && linuxEnabled) return "linux-media-control";
  return null;
}

function getBrowserPlaybackState(status: PlayerState["status"]): MediaSessionPlaybackState {
  if (status === "playing" || status === "loading") return "playing";
  if (status === "paused") return "paused";
  return "none";
}

function getClampedPosition(duration: number, position: number): number {
  const safePosition = Number.isFinite(position) ? Math.max(0, position) : 0;
  if (!Number.isFinite(duration) || duration <= 0) return safePosition;
  return Math.min(duration, safePosition);
}

/**
 * Only the two fields this actually reads.
 *
 * Taking the whole `PlayerState` made every caller a subscriber to all of it — including
 * volume, which commits on every pointer move — to satisfy a signature that never looked at
 * more than the track and the status.
 */
type MediaSessionState = Pick<PlayerState, "currentTrack" | "status">;

export function useMediaSession(
  state: MediaSessionState,
  controller: PlayerControllerActions,
): void {
  const linuxMediaSession = useLinuxMediaSession();
  // The browser `mediaSession` bridge must stay off everywhere a native session exists:
  // WebView2, WKWebView and WebKitGTK all bridge it to SMTC / MPNowPlayingInfoCenter / MPRIS on
  // their own, so enabling it too produces a second now-playing entry and double-fired media
  // keys. On Linux this also means turning the setting off hides Zuno from system media
  // controls entirely, rather than falling back to the browser bridge.
  const mediaSessionEnabled = !usesNativeMediaSession && linuxMediaSession;
  // ponytail: turning the toggle off just stops sending updates — the MPRIS entry freezes at
  // its last state instead of disappearing, since souvlaki has no unregister call. Add a
  // drop_controls command in linux_media.rs if a live "off" needs to clear it.
  const nativeMediaCommand = useMemo(
    () => getNativeMediaCommand(linuxMediaSession),
    [linuxMediaSession],
  );
  const nativeMediaControlEvent = useMemo(
    () => getNativeMediaControlEvent(linuxMediaSession),
    [linuxMediaSession],
  );
  // A downloaded song's saved cover, so the OS media controls keep their artwork offline.
  const offlineArtworkUrl = useOfflineArtworkUrl(state.currentTrack?.artworkUrl);
  // Widget extras (Android only reads them): like, shuffle, repeat and what plays next.
  const currentId = state.currentTrack?.id;
  const liked = useLibrarySelector((library) =>
    Boolean(currentId && library.library?.likedSongs.some((track) => track.id === currentId)));
  const shuffle = usePlayerSelector((player) => player.shuffleEnabled);
  const orderMode = usePlayerSelector((player) => player.playbackOrderMode);
  const nextTitle = usePlayerSessionSelector((session) => {
    const next = session?.queue[session.queueIndex + 1];
    return next ? `${next.title}${next.artist ? ` · ${next.artist}` : ""}` : null;
  });
  const repeat = orderMode === "repeat-one" ? "one" : orderMode === "repeat-all" ? "all" : "off";
  const sendNativeMediaUpdate = useCallback((context: string, forceMetadata = false) => {
    if (!nativeMediaCommand) return;

    const track = state.currentTrack;
    const duration = controller.getDuration() || track?.durationSec || 0;
    void invoke(nativeMediaCommand, {
      update: {
        title: track?.title ?? null,
        artist: track?.artist ?? null,
        // A list row's cover is often 60-120 px; the lock screen and widget want a real one.
        artworkUrl: offlineArtworkUrl
          ?? (track?.artworkUrl ? getArtworkUrlCandidates(track.artworkUrl, 544)[0] ?? track.artworkUrl : null),
        status: state.status,
        durationSec: duration || null,
        positionSec: getClampedPosition(duration, controller.getCurrentTime()),
        forceMetadata,
        ...(usesNativeAndroidMediaSession ? { liked, shuffle, repeat, nextTitle } : {}),
      },
    }).catch((error) => {
      logInternalWarn(`useMediaSession native ${context} update failed`, {
        error: String(error),
      });
    });
  }, [controller, nativeMediaCommand, offlineArtworkUrl, state.currentTrack, state.status, liked, shuffle, repeat, nextTitle]);

  // Bit-perfect USB DAC: keep Android's direct path at the new track's sample rate.
  useEffect(() => {
    if (!usesNativeAndroidMediaSession || state.status !== "playing") return;
    const timer = window.setTimeout(() => void syncAndroidBitPerfect(), 800);
    return () => window.clearTimeout(timer);
  }, [state.currentTrack?.id, state.status]);

  useEffect(() => {
    if (!usesNativeAndroidMediaSession) return;
    const stop = onAndroidEvent("media", (event) => {
      if (event.action === "seekTo" && typeof event.positionSec === "number") {
        void controller.seekTo(event.positionSec);
      }
      if (event.action === "play") void controller.play();
      if (event.action === "pause") void controller.pause();
      if (event.action === "playPause") void controller.togglePlayPause();
      if (event.action === "next") void controller.skipToNext();
      if (event.action === "previous") void controller.skipToPrevious();
      if (event.action === "shuffle") controller.toggleShuffle();
      if (event.action === "repeat") controller.cyclePlaybackOrderMode();
      if (event.action === "openPlayer") window.dispatchEvent(new Event(OPEN_PLAYER_EVENT));
      if (event.action === "like") {
        const track = controller.getPlayerSession()?.currentTrack;
        if (track) {
          void libraryController
            .setTrackLiked(track, !libraryController.isTrackLiked(track.id))
            .catch((error: unknown) => logInternalWarn("Android like failed", { error: String(error) }));
        }
      }
    });
    // Listeners are up: Kotlin flushes anything queued while the page was loading.
    void invoke("android_frontend_ready").catch(() => {});
    return stop;
  }, [controller]);

  useEffect(() => {
    if (!nativeMediaControlEvent) return;

    const unlistenPromise = listen<NativeMediaAction>(
      nativeMediaControlEvent,
      ({ payload }) => {
        if (typeof payload === "object") {
          if (payload.action === "seekTo") void controller.seekTo(payload.positionSec);
          if (payload.action === "setVolume") void controller.setVolume(payload.volume);
          return;
        }

        if (payload === "play") void controller.play();
        if (payload === "pause") void controller.pause();
        if (payload === "playPause") void controller.togglePlayPause();
        if (payload === "next") void controller.skipToNext();
        if (payload === "previous") void controller.skipToPrevious();
      },
    );

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [controller, nativeMediaControlEvent]);

  useEffect(() => {
    if (!nativeMediaCommand) return;

    sendNativeMediaUpdate("state", true);
    const retryDelaysMs = [250, 1000, 2500];
    const retryIds = retryDelaysMs.map((delayMs) => (
      window.setTimeout(() => sendNativeMediaUpdate("state retry", true), delayMs)
    ));
    return () => retryIds.forEach((retryId) => window.clearTimeout(retryId));
  }, [nativeMediaCommand, sendNativeMediaUpdate]);

  /*
   * Position goes out once per second while playing, and once per transition otherwise.
   *
   * The OS needs a fresh position for its scrubber, but a paused track's position is fresh
   * already — this was an IPC call every second for as long as a track was loaded, whether or
   * not it was moving. `state.status` is a dependency so pausing, resuming and seeking each
   * still push one update immediately.
   */
  useEffect(() => {
    if (!nativeMediaCommand || !state.currentTrack) return;

    sendNativeMediaUpdate("position");
    if (state.status !== "playing") return;

    /*
     * Rust's position events too: a hidden, silent page's timers drop to about one a minute, and
     * the OS reads back whatever position was sent last, so tray playback drifted (#79).
     */
    let sentAt = performance.now();
    const tick = () => {
      if (performance.now() - sentAt < 900) return;
      sentAt = performance.now();
      sendNativeMediaUpdate("position");
    };
    const intervalId = window.setInterval(tick, 1000);
    const stopListening = onPosition(tick);
    return () => {
      window.clearInterval(intervalId);
      stopListening();
    };
  }, [nativeMediaCommand, sendNativeMediaUpdate, state.currentTrack, state.status]);

  useEffect(() => {
    if (mediaSessionEnabled || !("mediaSession" in navigator)) return;

    // Toggle turned off, or the platform uses its native session: clear whatever the
    // browser bridge was showing so no duplicate now-playing entry survives.
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      for (const action of [
        "play", "pause", "stop", "nexttrack", "previoustrack",
        "seekto", "seekbackward", "seekforward",
      ] as MediaSessionAction[]) {
        navigator.mediaSession.setActionHandler(action, null);
      }
    } catch {
      // WebView media-session support varies by installed runtime version.
    }
  }, [mediaSessionEnabled]);

  useEffect(() => {
    if (!mediaSessionEnabled || !("mediaSession" in navigator)) return;

    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => void controller.play(),
      pause: () => void controller.pause(),
      stop: () => void controller.pause(),
      nexttrack: () => void controller.skipToNext(),
      previoustrack: () => void controller.skipToPrevious(),
      seekto: (details) => {
        if (details.seekTime !== undefined) void controller.seekTo(details.seekTime);
      },
      seekbackward: (details) => {
        const offset = details.seekOffset ?? 10;
        void controller.seekTo(Math.max(0, controller.getCurrentTime() - offset));
      },
      seekforward: (details) => {
        const duration = controller.getDuration();
        const offset = details.seekOffset ?? 10;
        void controller.seekTo(Math.min(duration, controller.getCurrentTime() + offset));
      },
    };

    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(
          action as MediaSessionAction,
          handler as MediaSessionActionHandler,
        );
      } catch {
        // WebView media-session support varies by installed runtime version.
      }
    }

    return () => {
      for (const action of Object.keys(handlers) as MediaSessionAction[]) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Ignore actions unsupported by the current WebView runtime.
        }
      }
    };
  }, [controller, mediaSessionEnabled]);

  useEffect(() => {
    if (!mediaSessionEnabled || !("mediaSession" in navigator)) return;

    const track = state.currentTrack;
    try {
      navigator.mediaSession.metadata = track
        ? new MediaMetadata({
            title: track.title,
            artist: track.artist,
            artwork: track.artworkUrl ? [{ src: track.artworkUrl }] : [],
          })
        : null;
      navigator.mediaSession.playbackState = getBrowserPlaybackState(state.status);
    } catch {
      // WebView media-session support varies by installed runtime version.
    }
  }, [state.currentTrack, state.status, mediaSessionEnabled]);

  useEffect(() => {
    if (
      !mediaSessionEnabled
      || !("mediaSession" in navigator)
      || !state.currentTrack
    ) return;

    const updatePosition = () => {
      const duration = controller.getDuration() || state.currentTrack?.durationSec || 0;
      const position = Math.min(duration, Math.max(0, controller.getCurrentTime()));
      if (duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: 1,
            position,
          });
        } catch {
          // WebView media-session support varies by installed runtime version.
        }
      }
    };

    // Same reasoning as the native path above: only a moving position needs re-publishing.
    updatePosition();
    if (state.status !== "playing") return;

    const intervalId = window.setInterval(updatePosition, 1000);
    return () => window.clearInterval(intervalId);
  }, [controller, state.currentTrack, state.status, mediaSessionEnabled]);
}
