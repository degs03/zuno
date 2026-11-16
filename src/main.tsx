import React from "react";
import ReactDOM from "react-dom/client";
import App from "./ui/App";
import { ErrorBoundary } from "./ui/components/ErrorBoundary";
import "./ui/styles/global.css";
import { logInternalError, logInternalInfo } from "./internal/logging";
import { applyPaperPcMode, hydratePaperPcMode } from "./ui/settings/paperPcMode";
import { applyTheme, hydrateTheme, watchSystemTheme } from "./ui/settings/theme";
import { applyAppearance, hydrateAppearance } from "./ui/settings/appearance";
import {
  applyNativeWindowControls,
  hydrateWindowControlSettings,
} from "./ui/settings/windowControls";
import { hydrateMiniPlayerSettings } from "./ui/settings/miniPlayer";
import { hydratePlayerControlSettings } from "./ui/settings/playerControls";
import { hydrateQueuePanelSettings } from "./ui/settings/queuePanel";
import { hydrateSortPreferences } from "./ui/settings/sortPreferences";
import { hydrateTraySettings } from "./ui/settings/tray";
import { hydrateMediaSessionSettings } from "./ui/settings/mediaSession";
import { hydrateAudioQualitySettings } from "./internal/audioQuality";
import { hydrateAudioEngineMode } from "./ui/settings/audioEngine";
import { hydrateEqualizer } from "./ui/settings/equalizer";
import { hydrateAudioProfiles } from "./ui/settings/audioProfiles";
import { startOutputDeviceWatch } from "./ui/settings/currentOutputDevice";
import { hydrateHeadsetSettings } from "./ui/settings/headset";
import { hydrateOfflineMode } from "./internal/connectivity";
import { initI18n } from "./i18n";
import { hydrateBitPerfect } from "./ui/settings/bitPerfect";
import { hydrateCarDevices } from "./ui/settings/carDevices";
import { hydratePersonalEq } from "./ui/settings/personalEq";
import { hydrateVolumeNormalization } from "./ui/settings/volumeNormalization";
import { hydrateHiddenPlaylists } from "./ui/settings/hiddenPlaylists";
import { hydratePinnedPlaylists } from "./ui/settings/pinnedPlaylists";
import { hydrateOutputDevice } from "./ui/settings/audioOutputDevice";
import { hydrateYouTubeAccountSettings } from "./ui/settings/youtubeAccount";
import { notifyLocalPlaylistsChanged, syncLocalAudioWatcher } from "./player/localPlaylists";
import { listen } from "@tauri-apps/api/event";
import { hydrateLastFmSettings } from "./ui/settings/lastfm";
import { hydrateDiscordSettings } from "./ui/settings/discord";
import { hydrateSidebarSettings } from "./ui/settings/sidebarMode";
import { hydrateKeyboardShortcuts } from "./ui/settings/keyboardShortcuts";
import {
  hydrateMainWindowGeometry,
  restoreMainWindowGeometry,
} from "./ui/settings/mainWindowGeometry";
import { applyPlatformAttributes, detectTilingWindowManager, isMobile } from "./ui/platform";
import { hydrateArtworkCache } from "./internal/artworkCache";
import { hydratePlaybackSettings } from "./player/playbackSettings";
import { hydratePlayHistory } from "./player/playHistory";
import { hydrateSessionRestoreSetting } from "./ui/settings/sessionRestore";
import { hydratePreferredLyricsSourceId } from "./internal/lyricsSourcePreference";
import { hydrateToolbarItemSettings } from "./ui/settings/toolbarItems";
import { hydrateHomeSectionSettings } from "./ui/settings/homeSections";
import { applyRenderEffects, hydrateRenderEffects } from "./ui/settings/renderEffects";
import { hydrateZoom, watchZoomKeys } from "./ui/settings/zoom";
import { startMemoryReport } from "./internal/memoryReport";

logInternalInfo("main.bootstrap start");
// Before React mounts: a resolution restored after first paint is a resolution that already
// let its image flash the fallback icon.
hydrateArtworkCache();
applyPlatformAttributes();
void detectTilingWindowManager();
// Before React mounts: a late theme apply shows a flash of the wrong palette.
applyTheme();
applyAppearance();
watchSystemTheme();
applyPaperPcMode();
applyRenderEffects();
// Mobile has one fixed window: no zoom keys, window decorations or saved geometry.
if (!isMobile) watchZoomKeys();
// One line a minute in the app log, so "the renderer is using 220 MB" can be split into heap,
// DOM, images and subframes instead of guessed at. Settings → Troubleshooting → Open log.
startMemoryReport();
if (!isMobile) {
  void applyNativeWindowControls();
  void hydrateMainWindowGeometry().then(restoreMainWindowGeometry).catch((error) => {
    logInternalError("mainWindowGeometry.restore failed", error);
  });
}
void Promise.all([
  hydratePaperPcMode(),
  hydrateRenderEffects(),
  isMobile ? Promise.resolve() : hydrateZoom(),
  hydrateTheme(),
  hydrateAppearance(),
  hydrateWindowControlSettings(),
  hydrateMediaSessionSettings(),
  hydrateMiniPlayerSettings(),
  hydratePlayerControlSettings(),
  hydrateQueuePanelSettings(),
  hydrateSortPreferences(),
  hydrateTraySettings(),
  hydrateAudioQualitySettings(),
  hydrateAudioEngineMode(),
  // Rust starts flat every launch, so the stored curve has to be pushed back down.
  hydrateEqualizer(),
  // Device watch needs the device→profile links loaded first, or the first route is missed.
  hydrateAudioProfiles().then(startOutputDeviceWatch),
  hydrateVolumeNormalization(),
  hydrateHeadsetSettings(),
  hydrateBitPerfect(),
  hydrateCarDevices(),
  hydratePersonalEq(),
  hydrateOfflineMode(),
  hydrateHiddenPlaylists(),
  hydratePinnedPlaylists(),
  // Same reason: a fresh Rust process opens the OS default device until told otherwise.
  hydrateOutputDevice(),
  hydrateYouTubeAccountSettings(),
  hydrateLastFmSettings(),
  hydrateDiscordSettings(),
  hydrateSidebarSettings(),
  hydrateKeyboardShortcuts(),
  hydrateToolbarItemSettings(),
  hydrateHomeSectionSettings(),
  hydratePlaybackSettings(),
  hydratePlayHistory(),
  hydratePreferredLyricsSourceId(),
  // Read synchronously from local storage at boot, so this only backfills a machine whose
  // local storage was cleared — it takes effect from the next launch.
  hydrateSessionRestoreSetting(),
]).catch((error) => {
  logInternalError("settings hydration failed", error);
});

window.addEventListener("error", (event) => {
  logInternalError("window.error", event.error ?? event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  logInternalError("window.unhandledrejection", event.reason);
});

/*
 * The outermost boundary. Nothing below it can be recovered from selectively, so its only
 * job is to make sure a render error leaves something on screen with a button on it rather
 * than a blank window — a desktop shell has no address bar to reload from.
 */
// The language catalog loads first (a few ms, local), so the first frame is already translated.
void initI18n().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary label="Zuno">
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
});

/*
 * Local folders are watched for the whole session. The event carries no detail on purpose —
 * a rescan is cheap and precisely diffing renames, temp files and write-then-replace editors
 * would be far more code for the same visible result.
 */
syncLocalAudioWatcher();
void listen("local-audio-changed", () => notifyLocalPlaylistsChanged());

