import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Switch } from "@/components/motion/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { RangeSlider } from "@/components/motion/range-slider";
import appLogo from "../../../assets/img/ghost-256.png";
import { registerBackHandler } from "../android";
import { FloatingPanel } from "../components/FloatingPanel";
import { ColorPicker } from "../components/ColorPicker";
import { playerController } from "../../player/playerStore";
import { setEqualizerEnabled, useEqualizerEnabled } from "../settings/equalizer";
import { EqualizerPanel } from "../components/Equalizer";
import { SoundProfilesPanel } from "../components/SoundProfiles";
import {
  HEADSET_GESTURES,
  setHeadsetSettings,
  useHeadsetSettings,
  type HeadsetGesture,
  type HeadsetSettings as HeadsetSettingsValue,
} from "../settings/headset";
import { useCurrentOutputDevice } from "../settings/currentOutputDevice";
import { setOfflineMode, useOfflineMode } from "../../internal/connectivity";
import { exportBackup, pickBackup, restoreBackup } from "../../internal/backup";
import type { BackupFile } from "../../internal/backupFormat";
import { showNotice } from "../notice";
import { setBitPerfect, useBitPerfect, useOutputFormat } from "../settings/bitPerfect";
import { setCarDevice, useCarDevices } from "../settings/carDevices";
import { clearPersonalEq, setPersonalEqEnabled, usePersonalEq } from "../settings/personalEq";
import { formatNumber, getLocale, LANGUAGES, msg, relativeTimeFormat, resolveLanguage, setLanguage, t, tn, useLanguageSetting, useT, type LanguageSetting } from "../../i18n";
import { newTvServerCode, refreshTvServerInfo, setTvServerEnabled, useTvServer } from "../../tv/tvServer";
import { getInvokeErrorMessage } from "../../internal/appSettings";
import {
  MAX_CROSSFADE_SEC,
  setCrossfadeSec,
  setGaplessEnabled,
  useCrossfadeSec,
  useGaplessEnabled,
} from "../settings/playbackTransitions";
import { setVolumeNormalization, useVolumeNormalization } from "../settings/volumeNormalization";
import {
  setSessionRestoreEnabled,
  useSessionRestoreEnabled,
} from "../settings/sessionRestore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import {
  BugIcon,
  DownloadIcon,
  EqualizerIcon,
  SoundProfileIcon,
  HeadphonesIcon,
  ImageIcon,
  GlobalIcon,
  BackupIcon,
  ImportIcon,
  ExportIcon,
  FolderAddIcon,
  FolderIcon,
  FolderOpenIcon,
  CheckActiveIcon,
  ChevronDownIcon,
  HomeIcon,
  KeyIcon,
  LastFmIcon,
  LogFileIcon,
  LogoutIcon,
  LyricsIcon,
  PaletteIcon,
  PlayIcon,
  PlusIcon,
  QueuePanelIcon,
  RefreshIcon,
  SettingsIcon,
  SpeedIcon,
  StarIcon,
  TrashIcon,
  UserIcon,
} from "@/ui/icons";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from "../settings/theme";
import {
  ACCENTS,
  foregroundFor,
  STYLES,
  setAccent,
  setCustomAccent,
  setStyle,
  useAccent,
  useCustomAccent,
  useStyle,
  type StylePreset,
} from "../settings/appearance";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  checkForUpdates,
  getUpdateFailureMessage,
  getInstalledVersion,
  installUpdate,
  type UpdateInfo,
  type UpdateInstallProgress,
} from "../../internal/updateChecker";
import {
  clearCache,
  DEFAULT_CACHE_SIZE_GB,
  getCacheStats,
  setCacheMaxBytes,
  type CacheStats,
} from "../../internal/cache";
import type { LibraryController, LibraryState } from "../../player/LibraryController";
import {
  getAutostartEnabled,
  setAutostartEnabled,
} from "../settings/autostart";
import {
  setCompactPlayerBar,
  setExtraPlayerControlsAlwaysVisible,
  useCompactPlayerBar,
  useExtraPlayerControlsAlwaysVisible,
} from "../settings/playerControls";
import {
  RENDER_EFFECTS,
  setEffectDisabled,
  setPotatoPcMode,
  useEffectDisabled,
  usePotatoPcMode,
} from "../settings/renderEffects";
import { setMadeForYouVisible, useMadeForYouVisible } from "../settings/homeSections";
import {
  SettingsSearch,
  SettingsSearchResults,
  type SettingsTab,
} from "../components/SettingsSearch";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import {
  AUTO_LYRICS_SOURCE,
  setPreferredLyricsSourceId,
  usePreferredLyricsSourceId,
} from "../../internal/lyricsSourcePreference";
import { LYRICS_SOURCES } from "../../datasource/youtube/lyricsSources";
import {
  LYRICS_FONT_SCALES,
  setLyricsFontScale,
  useLyricsFontScale,
} from "../settings/lyricsFontScale";
import { setZoom, useZoom, ZOOM_LEVELS } from "../settings/zoom";
import {
  TRANSLATION_LANGUAGES,
  TRANSLATION_OFF,
  getLanguageLabel,
  setLyricsTranslationLang,
  useLyricsTranslationLang,
} from "../settings/lyricsTranslation";
import {
  setToolbarItemVisible,
  TOOLBAR_ITEMS,
  useToolbarItemVisible,
} from "../settings/toolbarItems";
import {
  setForceWindowControls,
  setNativeWindowControls,
  setWindowOutline,
  setWindowsStyleWindowControls,
  useForceWindowControls,
  useNativeWindowControls,
  useWindowOutline,
  useWindowsStyleWindowControls,
} from "../settings/windowControls";
import {
  resetMiniPlayerPosition,
  setMiniPlayerEnabled,
  setMiniPlayerHoverAction,
  useMiniPlayerEnabled,
  useMiniPlayerHoverAction,
  useMiniPlayerSkin,
  type MiniPlayerHoverAction,
} from "../settings/miniPlayer";
import { MiniPlayerSkinPicker } from "../components/mini-player/SkinPicker";
import {
  setMainWindowGeometryPersistenceEnabled,
  useMainWindowGeometryPersistenceEnabled,
} from "../settings/mainWindowGeometry";
import { setMinimizeToTray, useMinimizeToTray } from "../settings/tray";
import {
  setLinuxMediaSession,
  useLinuxMediaSession,
} from "../settings/mediaSession";
import {
  SIDEBAR_MODES,
  setSidebarMode,
  useSidebarMode,
  type SidebarMode,
} from "../settings/sidebarMode";
import {
  setAuthenticatedStreaming,
  setYouTubeScrobbling,
  useAuthenticatedStreaming,
  useYouTubeScrobbling,
} from "../settings/youtubeAccount";
import {
  AUDIO_ENGINE_MODES,
  setAudioEngineMode,
  useAudioEngineMode,
  type AudioEngineMode,
} from "../settings/audioEngine";
import {
  listOutputDevices,
  setOutputDevice,
  SYSTEM_DEFAULT_DEVICE,
  useOutputDevice,
  type OutputDevice,
} from "../settings/audioOutputDevice";
import {
  captureKeyboardShortcut,
  formatKeyboardShortcut,
  KEYBOARD_SHORTCUT_ACTIONS,
  resetKeyboardShortcut,
  resetKeyboardShortcuts,
  setKeyboardShortcut,
  useKeyboardShortcuts,
  type KeyboardShortcutAction,
} from "../settings/keyboardShortcuts";
import {
  addLocalPlaylistPath,
  createLocalPlaylist,
  deleteLocalPlaylist,
  getLocalPlaylists,
  removeLocalPlaylistPath,
  subscribeToLocalPlaylists,
} from "../../player/localPlaylists";
import { LastFmService, type LastFmAuthStart, type LastFmSessionStatus } from "../../player/LastFm";
import { DiscordRpcService } from "../../player/DiscordRPC";
import {
  useDiscordHideWhenPaused,
  useDiscordPresenceEnabled,
} from "../settings/discord";
import {
  setLastFmScrobblingEnabled,
  useLastFmScrobblingEnabled,
} from "../settings/lastfm";
import { isAndroid, isLinux, isMacOS, isMobile, isTilingWindowManager, subscribeTilingWindowManager } from "../platform";
import { GITHUB_NEW_ISSUE_URL, GITHUB_REPOSITORY_URL } from "../links";
import { AccountAvatar, AccountSwitcher, AddGoogleAccountButton, GoogleAccountSwitcher } from "../components/AccountSwitcher";
import {
  AUDIO_QUALITY_LABELS,
  setDownloadQuality,
  setStreamingQuality,
  useDownloadQuality,
  useStreamingQuality,
  type AudioQuality,
} from "../../internal/audioQuality";
import {
  getOfflineMaxBytes,
  removeAllDownloads,
  setOfflineMaxBytes,
  useOfflineState,
} from "../../player/offlineStore";




/*
 * Label + description pair used by every settings row.
 *
 * `flex flex-col` is the load-bearing part: both children are inline elements, so without a
 * block/flex wrapper the description runs straight on from the label ("Scrobble playsSend
 * now playing updates...") — the CSS Modules used to stack them and the Tailwind migration
 * dropped it.
 */
const SETTING_LABEL =
  "flex flex-col gap-0.5 text-sm text-muted-foreground [&>strong]:text-sm [&>strong]:font-medium [&>strong]:text-foreground";

/** Section card. One shape for every group so the page reads as a single system. */
// The shared card recipe at a softer fill: settings stack many cards, and full `bg-card` on
// every one reads as a wall. Tighter padding on phones gives the rows back their width.
/**
 * Accent colour and visual style (see settings/appearance.ts). Swatches are radios; "Custom"
 * wraps a native colour input. Style tiles preview their own shape, depth and translucency.
 */
function AppearancePicker() {
  const t = useT();
  const accent = useAccent();
  const customAccent = useCustomAccent();
  const style = useStyle();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h3 className="text-sm font-medium text-foreground" id="accent-settings-title">{t("Accent colour")}</h3>
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-labelledby="accent-settings-title">
          {ACCENTS.map((option) => {
            const selected = accent === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={t(option.label)}
                title={t(option.label)}
                onClick={() => setAccent(option.id)}
                className={cn(
                  "pressable grid size-10 place-items-center rounded-full ring-offset-2 ring-offset-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "ring-2 ring-foreground",
                )}
                style={{
                  backgroundColor: option.swatch,
                  // Each neon glows in its own colour, which is what makes it read as "neon".
                  boxShadow: `0 0 18px -6px ${option.swatch}`,
                }}
              >
                {selected ? (
                  <CheckActiveIcon size={18} style={{ color: foregroundFor(option.swatch) }} aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
          {/* Our own picker in a panel (a bottom sheet on phones), not the platform's dialog. */}
          <FloatingPanel
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            side="top"
            className="w-80"
            trigger={
              <button
                type="button"
                role="radio"
                aria-checked={accent === "custom"}
                aria-label={t("Custom colour")}
                title={t("Custom colour")}
                onClick={() => setPickerOpen((open) => !open)}
                className={cn(
                  "pressable grid size-10 place-items-center rounded-full ring-offset-2 ring-offset-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  accent === "custom" && "ring-2 ring-foreground",
                )}
                style={{
                  background:
                    accent === "custom"
                      ? customAccent
                      : "conic-gradient(#ff2e88, #ff6a00, #ffe600, #a6ff00, #00ffa3, #00d1ff, #b026ff, #ff2e88)",
                }}
              >
                {accent === "custom" ? (
                  <CheckActiveIcon size={18} style={{ color: foregroundFor(customAccent) }} aria-hidden="true" />
                ) : (
                  <PlusIcon size={18} className="text-white drop-shadow" aria-hidden="true" />
                )}
              </button>
            }
          >
            <ColorPicker
              value={customAccent}
              onCancel={() => setPickerOpen(false)}
              onApply={(hex) => {
                setCustomAccent(hex);
                setPickerOpen(false);
              }}
            />
          </FloatingPanel>
          {/* Follows the playing song's cover: the whole app re-tints with each track. */}
          <button
            type="button"
            role="radio"
            aria-checked={accent === "dynamic"}
            aria-label={t("From the cover")}
            title={t("From the cover: changes with each song")}
            onClick={() => setAccent("dynamic")}
            className={cn(
              "pressable relative grid size-10 place-items-center overflow-hidden rounded-full ring-offset-2 ring-offset-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              accent === "dynamic" && "ring-2 ring-foreground",
            )}
            style={{
              background: "radial-gradient(circle at 30% 30%, #ffe600, transparent 55%), radial-gradient(circle at 70% 70%, #00d1ff, transparent 55%), radial-gradient(circle at 70% 25%, #ff2e88, transparent 55%), #1c1c1c",
            }}
          >
            {accent === "dynamic" ? (
              <CheckActiveIcon size={18} className="text-white drop-shadow" aria-hidden="true" />
            ) : (
              <ImageIcon size={18} className="text-white drop-shadow" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <h3 className="text-sm font-medium text-foreground" id="style-settings-title">{t("Style")}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-labelledby="style-settings-title">
          {STYLES.map((option) => {
            const selected = style === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setStyle(option.id);
                  // Glass *is* the blur: choosing it switches the blur effect back on (phones
                  // start with it off to save GPU), otherwise it would fall back to opaque.
                  if (option.id === "glass") setEffectDisabled("backdrop", false);
                }}
                className={cn(
                  "pressable flex flex-col gap-2 rounded-row p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "bg-primary/10 ring-1 ring-primary/40" : "bg-background/40 hover:bg-muted/60",
                )}
              >
                <StylePreview style={option.id} />
                <span className="text-sm font-semibold text-foreground">{t(option.label)}</span>
                <span className="text-xs text-muted-foreground">{t(option.hint)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** A tiny card stack drawn the way each style draws real cards. */
function StylePreview({ style }: { style: StylePreset }) {
  const card = {
    zuno: "rounded-lg bg-card shadow-[0_6px_14px_-8px_var(--elevation-shade)]",
    glass: "rounded-xl bg-white/25 ring-1 ring-white/40 backdrop-blur-sm",
    ios: "rounded-2xl bg-card",
    solid: "rounded-sm bg-card ring-1 ring-border",
  }[style];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex h-16 w-full items-end gap-1.5 overflow-hidden rounded-lg p-2",
        style === "glass"
          ? "bg-[radial-gradient(circle_at_20%_20%,var(--color-primary),transparent_70%)] bg-muted"
          : "bg-muted",
      )}
    >
      <span className={cn("h-10 w-1/2", card)} />
      <span className={cn("h-7 w-1/3", card)}>
        <span className="m-1 block h-1.5 w-2/3 rounded-full bg-primary" />
      </span>
    </span>
  );
}

const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/**
 * Speed and pitch, the same controls as the player's popup, where people look for them in
 * Settings too. Both are remembered across launches by the player itself.
 */
function SpeedPitchSettings({ rustEngine }: { rustEngine: boolean }) {
  const t = useT();
  // Bit-perfect output plays at unity speed and pitch; the controls would do nothing.
  const bitPerfect = useBitPerfect();
  const [rate, setRate] = useState(() => playerController.getPlaybackRate());
  const [pitch, setPitch] = useState(() => playerController.getPitch());
  const applyRate = (next: number) => {
    playerController.setPlaybackRate(next);
    setRate(playerController.getPlaybackRate());
  };
  const applyPitch = (next: number) => {
    playerController.setPitch(next);
    setPitch(playerController.getPitch());
  };
  const chip = (active: boolean) =>
    cn(
      "pressable min-h-10 min-w-12 flex-1 rounded-full px-3 text-sm font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground hover:bg-muted",
    );
  return (
    <section
      className={cn(SETTINGS_CARD, bitPerfect && "pointer-events-none opacity-50")}
      aria-labelledby="speed-settings-title"
      aria-disabled={bitPerfect || undefined}
    >
      <SettingsCardHeader
        title={t("Speed & pitch")}
        titleId="speed-settings-title"
        icon={<SpeedIcon size={18} aria-hidden="true" />}
        description={t("Change tempo without chipmunk voices, or key without changing tempo.")}
        status={
          rate !== 1 || pitch !== 0 ? (
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                applyRate(1);
                applyPitch(0);
              }}
            >
              {t("Reset")}
            </button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground" id="speed-row-label">
          {t("Speed")} <span className="tabular-nums text-muted-foreground">· {rate}×</span>
        </span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="speed-row-label">
          {SPEED_STEPS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rate === value}
              className={chip(rate === value)}
              onClick={() => applyRate(value)}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>
      {rustEngine ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground" id="pitch-row-label">
            {t("Pitch")}{" "}
            <span className="tabular-nums text-muted-foreground">
              · {pitch === 0 ? t("original key") : tn("{value} semitone", "{value} semitones", Math.abs(pitch), { value: `${pitch > 0 ? "+" : ""}${pitch}` })}
            </span>
          </span>
          <div className="flex items-center gap-2" role="group" aria-labelledby="pitch-row-label">
            <button
              type="button"
              aria-label={t("Lower pitch a semitone")}
              className={cn(chip(false), "flex-none text-lg")}
              disabled={pitch <= -12}
              onClick={() => applyPitch(pitch - 1)}
            >
              −
            </button>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={pitch}
              aria-label={t("Pitch in semitones")}
              className="h-10 min-w-0 flex-1 accent-[var(--color-primary)]"
              onChange={(event) => applyPitch(Number(event.target.value))}
            />
            <button
              type="button"
              aria-label={t("Raise pitch a semitone")}
              className={cn(chip(false), "flex-none text-lg")}
              disabled={pitch >= 12}
              onClick={() => applyPitch(pitch + 1)}
            >
              +
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("Pitch needs the Rust audio engine.")}</p>
      )}
    </section>
  );
}

/** Thin used-of-total bar. */
function UsageMeter({ used, total, label }: { used: number; total: number; label: string }) {
  const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div
        className={cn("h-full rounded-full", percent > 90 ? "bg-destructive" : "bg-primary")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** Size presets for the storage pickers, in GB. Touch keyboards make free-form numbers fiddly. */
const CACHE_SIZE_PRESETS_GB = ["0.25", "0.5", "1", "2", "4", "8", "16"];
const DOWNLOAD_SIZE_PRESETS_GB = [2, 4, 8, 16, 32, 64, 128];
const formatGb = (gb: number) => (gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb} GB`);

/** In-card action: a filled pill, so it reads as a button and not as more description. */
const CARD_BUTTON =
  "pressable inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/70 active:bg-[var(--color-pressed)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:w-full";
const CARD_BUTTON_PRIMARY =
  "pressable inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background max-sm:w-full";

const SETTINGS_CARD = "flex flex-col gap-5 rounded-card bg-card/60 p-6 shadow-card max-sm:gap-4 max-sm:p-4";

/**
 * How long ago YouTube last answered as this account, in words.
 *
 * Deliberately visible rather than internal: with no telemetry, this one line is what turns
 * "liking songs stopped working" into a report somebody can act on.
 */
function formatSessionAge(confirmedAt: number | null): string {
  if (confirmedAt === null) return t("not yet");
  const minutes = Math.floor((Date.now() - confirmedAt) / 60_000);
  if (minutes < 1) return t("just now");
  if (minutes < 60) return tn("{n} minute ago", "{n} minutes ago", minutes);
  const hours = Math.floor(minutes / 60);
  return tn("{n} hour ago", "{n} hours ago", hours);
}

/**
 * Text field. Preflight strips the browser's default input chrome, and these two fields were
 * left bare by the CSS Modules migration — they rendered as invisible text on the card.
 */
const SETTINGS_FIELD =
  "min-w-0 rounded-lg bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring/60";

/** One file with settings, sound profiles, local playlists, history, stats and downloads list. */
function BackupSettings() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      showNotice(getInvokeErrorMessage(error), 6000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={SETTINGS_CARD} aria-labelledby="backup-settings-title">
      <SettingsCardHeader
        title={t("Backup")}
        titleId="backup-settings-title"
        icon={<BackupIcon size={18} aria-hidden="true" />}
        description={t("Settings, sound profiles, local playlists, history, stats and what you downloaded, in one file. Never your sign-in.")}
      />
      {pending ? (
        <div className="flex flex-col gap-3 rounded-row bg-background/40 p-3">
          <p className="text-sm text-foreground">
            {t("Restore the backup from {date}?", {
              date: pending.createdAt ? new Date(pending.createdAt).toLocaleString(getLocale()) : t("this file"),
            })}{" "}
            {tn("{n} setting", "{n} settings", Object.keys(pending.settings).length)}
            {pending.downloads.length
              ? tn(", {n} song to download again", ", {n} songs to download again", pending.downloads.length)
              : ""}.{" "}
            {t("Your current settings are replaced and Zuno restarts.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className={CARD_BUTTON_PRIMARY}
              onClick={() => void run(() => restoreBackup(pending))}
            >
              {t("Restore and restart")}
            </button>
            <button type="button" className={CARD_BUTTON} onClick={() => setPending(null)}>
              {t("Cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className={CARD_BUTTON}
            onClick={() => void run(async () => {
              if (await exportBackup()) showNotice(t("Backup saved"));
            })}
          >
            <ExportIcon size={18} aria-hidden="true" />
            {t("Back up")}
          </button>
          <button
            type="button"
            disabled={busy}
            className={CARD_BUTTON}
            onClick={() => void run(async () => {
              const backup = await pickBackup();
              if (backup) setPending(backup);
            })}
          >
            <ImportIcon size={18} aria-hidden="true" />
            {t("Restore…")}
          </button>
        </div>
      )}
    </section>
  );
}

/** Downloads only, no network: Home, search and the queue all behave as if offline. */
function OfflineModeSetting() {
  const t = useT();
  const on = useOfflineMode();
  return (
    <SettingRow
      title={t("Offline mode")}
      description={t("Play only what's downloaded. Nothing is streamed or fetched, so it saves mobile data.")}
    >
      {(labelId) => <Switch checked={on} onCheckedChange={setOfflineMode} aria-labelledby={labelId} />}
    </SettingRow>
  );
}

/** Learning a personal EQ from liked songs: on/off, what has been learned, and a reset. */
function PersonalEqSettings() {
  const t = useT();
  const personal = usePersonalEq();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-row bg-background/40 p-3">
      <SettingRow
        title={t("Learn from my favourite songs")}
        description={t("Builds \"For you\" and \"Made for you\" EQ curves from the songs you like. Everything stays on this device.")}
      >
        {(labelId) => (
          <Switch checked={personal.enabled} onCheckedChange={setPersonalEqEnabled} aria-labelledby={labelId} />
        )}
      </SettingRow>
      {personal.enabled && (personal.learnedSongs > 0 || personal.analysedSongs > 0) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {t("Learned from {learned} plays · {analysed} songs analysed", {
              learned: personal.learnedSongs,
              analysed: personal.analysedSongs,
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              clearPersonalEq();
              setConfirm(false);
            }}
            onBlur={() => setConfirm(false)}
            className={cn(CARD_BUTTON, confirm && "text-destructive")}
          >
            <TrashIcon size={16} aria-hidden="true" />
            {confirm ? t("Tap again to clear") : t("Clear what was learned")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Interface language: follows the system unless the user picks one. */
function LanguageSettings() {
  const t = useT();
  const setting = useLanguageSetting();
  const system = LANGUAGES.find((language) => language.code === resolveLanguage(navigator.languages ?? [navigator.language]));
  return (
    <section className={SETTINGS_CARD} aria-labelledby="language-settings-title">
      <SettingsCardHeader
        title={t("Language")}
        titleId="language-settings-title"
        icon={<GlobalIcon size={18} aria-hidden="true" />}
        description={t("The language of menus and buttons. Song titles and lyrics stay as they are.")}
      />
      <SettingRow title={t("App language")}>
        {(labelId) => (
          <Select
            className="w-56 setting-wide"
            value={setting}
            onValueChange={(value) => void setLanguage(value as LanguageSetting)}
          >
            <SelectTrigger aria-labelledby={labelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                {t("Automatic")}{system ? ` (${system.label})` : ""}
              </SelectItem>
              {LANGUAGES.map((language) => (
                <SelectItem key={language.code} value={language.code}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </SettingRow>
    </section>
  );
}

/** One-button headset gestures and resume-on-connect (Android). */
function HeadsetSettingsCard() {
  const t = useT();
  const settings = useHeadsetSettings();
  const carDevices = useCarDevices();
  const device = useCurrentOutputDevice();
  const gestureRow = (key: "double" | "triple" | "long", title: string, description: string) => (
    <SettingRow title={title} description={description}>
      {(labelId) => (
        <Select
          className="w-44"
          value={settings[key]}
          onValueChange={(value) => setHeadsetSettings({ [key]: value as HeadsetGesture } as Partial<HeadsetSettingsValue>)}
        >
          <SelectTrigger aria-labelledby={labelId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HEADSET_GESTURES.map((gesture) => (
              <SelectItem key={gesture.value} value={gesture.value}>
                {t(gesture.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </SettingRow>
  );
  return (
    <section className={SETTINGS_CARD} aria-labelledby="headset-settings-title">
      <SettingsCardHeader
        title={t("Headphones")}
        titleId="headset-settings-title"
        icon={<HeadphonesIcon size={18} aria-hidden="true" />}
        description={
          device
            ? t("Playing through {device}. Buttons work with the screen off.", { device: device.name })
            : t("Earbud and headset buttons work with the screen off.")
        }
      />
      <div className="flex flex-col">
        <p className="text-sm text-muted-foreground">{t("One press always plays or pauses.")}</p>
        {gestureRow("double", t("Double press"), t("Press the button twice quickly."))}
        {gestureRow("triple", t("Triple press"), t("Press it three times."))}
        {gestureRow("long", t("Press and hold"), t("Hold the button for a second."))}
        {device && device.kind !== "speaker" ? (
          <SettingRow
            title={t("{device} is my car", { device: device.name })}
            description={t("Open car mode automatically when it connects.")}
          >
            {(labelId) => (
              <Switch
                checked={carDevices.includes(device.key)}
                onCheckedChange={(isCar) => setCarDevice(device.key, isCar)}
                aria-labelledby={labelId}
              />
            )}
          </SettingRow>
        ) : null}
        <SettingRow
          title={t("Resume when headphones connect")}
          description={t("Plugging in or pairing headphones picks up where you paused.")}
        >
          {(labelId) => (
            <Switch
              checked={settings.resumeOnConnect}
              onCheckedChange={(resumeOnConnect) => setHeadsetSettings({ resumeOnConnect })}
              aria-labelledby={labelId}
            />
          )}
        </SettingRow>
      </div>
    </section>
  );
}

/** Saved sound setups: save, recall, import/export, link to a device. */
function SoundProfilesSettings({ engineMode }: { engineMode: AudioEngineMode }) {
  const t = useT();
  const available = engineMode === "rust";
  return (
    <section className={SETTINGS_CARD} aria-labelledby="sound-profiles-title">
      <SettingsCardHeader
        title={t("Sound profiles")}
        titleId="sound-profiles-title"
        icon={<SoundProfileIcon size={18} aria-hidden="true" />}
        description={
          available
            ? t("EQ, bass, balance, speed and pitch together. Share them as files or link one to your headphones.")
            : t("Needs the Rust playback method.")
        }
      />
      <SoundProfilesPanel disabled={!available} />
    </section>
  );
}

/** Bit-perfect output for external DACs, with what the device is really receiving. */
function BitPerfectSettings({ engineMode }: { engineMode: AudioEngineMode }) {
  const t = useT();
  const enabled = useBitPerfect();
  const available = engineMode === "rust";
  const format = useOutputFormat();
  const exact = Boolean(format && format.sourceRate > 0 && format.deviceRate === format.sourceRate);
  const khz = (hz: number) => `${formatNumber(hz / 1000, { maximumFractionDigits: 1 })} kHz`;
  return (
    <section className={SETTINGS_CARD} aria-labelledby="bit-perfect-title">
      <SettingsCardHeader
        title={t("Bit-perfect output (DAC)")}
        titleId="bit-perfect-title"
        icon={<HeadphonesIcon size={18} aria-hidden="true" />}
        description={
          available
            ? t("Sends each song to your DAC exactly as decoded: its own sample rate, no EQ, effects or volume changes. Use the DAC's volume.")
            : t("Needs the Rust playback method.")
        }
        status={
          <Switch
            checked={enabled}
            onCheckedChange={(next) => {
              setBitPerfect(next);
              if (next) {
                playerController.setPlaybackRate(1);
                playerController.setPitch(0);
              }
            }}
            disabled={!available}
            aria-labelledby="bit-perfect-title"
          />
        }
      />
      {enabled && format && format.deviceRate > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-row bg-background/40 p-3 text-sm">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", exact ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
            {exact ? t("Bit-perfect") : t("Resampled")}
          </span>
          <span className="tabular-nums text-foreground">
            {format.sourceRate > 0 ? `${t("Song")} ${khz(format.sourceRate)} → ` : ""}
            {t("Device")} {khz(format.deviceRate)} · {format.deviceFormat} · {format.deviceChannels} ch
          </span>
          {!exact && format.sourceRate > 0 ? (
            <span className="w-full text-xs text-muted-foreground">
              {t("This device does not accept {rate}, so it is converted. Try another output or DAC setting.", { rate: khz(format.sourceRate) })}
            </span>
          ) : null}
        </div>
      ) : null}
      {enabled ? (
        <p className="text-xs text-muted-foreground">
          {t("YouTube streams are compressed (Opus/AAC): they reach the DAC unaltered, but do not become lossless. Local FLAC/WAV files get the full benefit.")}{" "}
          {isAndroid
            ? t("On Android 14 or newer with a USB DAC, Zuno also asks the system for its direct (bit-perfect) path.")
            : t("On Windows, set the DAC's format in Sound settings to match your music for a fully bit-perfect path.")}
        </p>
      ) : null}
    </section>
  );
}

/** The equaliser card. The switch is a bypass: off dims the curve but leaves it editable. */
function EqualizerSettings({ engineMode }: { engineMode: AudioEngineMode }) {
  const t = useT();
  const enabled = useEqualizerEnabled();
  const bitPerfect = useBitPerfect();
  // Only the Rust engine has the samples; the YouTube fallback plays unequalised.
  const available = engineMode === "rust" && !bitPerfect;

  return (
    <section className={SETTINGS_CARD} aria-labelledby="equalizer-settings-title">
      <SettingsCardHeader
        title={t("Equaliser")}
        titleId="equalizer-settings-title"
        icon={<EqualizerIcon size={18} aria-hidden="true" />}
        description={
          bitPerfect
            ? t("Off while bit-perfect output is on.")
            : available
              ? t("Ten bands, shaped live on the track that is playing.")
              : t("Needs the Rust playback method.")
        }
        status={
          <Switch
            checked={enabled}
            onCheckedChange={setEqualizerEnabled}
            disabled={!available}
            aria-labelledby="equalizer-settings-title"
          />
        }
      />
      <EqualizerPanel disabled={!available} />
      <PersonalEqSettings />
    </section>
  );
}

/**
 * Which sound card the Rust engine writes to.
 *
 * Only the Rust engine opens one itself — the IFrame and native paths play through the webview
 * and follow whatever the OS default routes to, same as any other browser tab.
 */
function OutputDeviceSetting({ engineMode }: { engineMode: AudioEngineMode }) {
  const t = useT();
  const selected = useOutputDevice();
  const [devices, setDevices] = useState<OutputDevice[]>([]);
  const available = engineMode === "rust";

  useEffect(() => {
    let cancelled = false;
    listOutputDevices()
      .then((found) => {
        if (!cancelled) setDevices(found);
      })
      // The row still works with an empty list — it just offers nothing but "System default".
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingRow
      title={t("Output device")}
      description={t("Which sound card the Rust engine plays to.")}
      disabled={!available}
    >
      {(labelId) => (
        <Select
          className="w-52 setting-wide"
          value={selected ?? SYSTEM_DEFAULT_DEVICE}
          onValueChange={(value) => {
            setOutputDevice(value === SYSTEM_DEFAULT_DEVICE ? null : value);
          }}
        >
          <SelectTrigger aria-labelledby={labelId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SYSTEM_DEFAULT_DEVICE}>{t("System default")}</SelectItem>
            {devices.map((device) => (
              <SelectItem key={device.id} value={device.id}>
                {device.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </SettingRow>
  );
}

/**
 * One settings row: label and description on the left, control on the right.
 *
 * The wrapper is a `div`, not a `label`, because the controls are now buttons
 * (`role="switch"`, `role="listbox"`) rather than native inputs — a button inside a label
 * gets its activation swallowed by the label's own click forwarding. The association is made
 * explicitly instead, via `aria-labelledby` on the control, so screen readers still announce
 * the row title when the control takes focus.
 */
function SettingRow({
  title,
  description,
  disabled,
  children,
}: {
  title: string;
  description?: ReactNode;
  disabled?: boolean;
  /** Receives the id of the row title so the control can point `aria-labelledby` at it. */
  children: (labelId: string) => ReactNode;
}) {
  const labelId = useId();
  return (
    <div
      className={cn(
        "setting-row flex items-start justify-between gap-6 py-2.5 max-sm:gap-3",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span id={labelId} className="text-sm font-medium text-foreground">
          {title}
        </span>
        {description ? (
          <span className="text-sm text-muted-foreground">{description}</span>
        ) : null}
      </span>
      <span className="setting-control flex shrink-0 items-center gap-2 pt-0.5">{children(labelId)}</span>
    </div>
  );
}

/**
 * The Motion & performance card's contents.
 *
 * One switch for the blunt version, and a Manage disclosure for the eleven behind it. The
 * individual switches are a debugging instrument — you flip one, watch the GPU, flip it back —
 * and eleven of them sitting open in Settings read as eleven decisions the user has to make.
 */
function PotatoPcSettings() {
  const t = useT();
  const potatoPcMode = usePotatoPcMode();
  const [isManaging, setIsManaging] = useState(false);
  const panelId = useId();

  return (
    <>
      <SettingRow
        title={t("Potato PC")}
        description={t("Turns off animations, blur, shadows and the ambient artwork, and switches to opaque surfaces. Manage picks them off one at a time.")}
      >
        {(labelId) => (
          <>
            <button
              type="button"
              onClick={() => setIsManaging((current) => !current)}
              aria-expanded={isManaging}
              aria-controls={panelId}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {isManaging ? t("Done") : t("Manage")}
            </button>
            <Switch
              checked={potatoPcMode}
              onCheckedChange={setPotatoPcMode}
              aria-labelledby={labelId}
            />
          </>
        )}
      </SettingRow>

      {isManaging && (
        <div id={panelId} className="flex flex-col">
          <p className="pb-1 pt-2 text-sm text-muted-foreground">
            {t("One switch per effect. Turn them off one at a time to find which one your machine is paying for.")}
          </p>
          {RENDER_EFFECTS.map((effect) => (
            <RenderEffectToggle key={effect.id} effect={effect} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Same reason as `ToolbarItemToggle`: one subscription per row.
 *
 * The switch reads as "effect on", the store as "effect disabled" — inverted here rather than
 * in the store, because the attribute the CSS matches on is a list of what is *off*, and an
 * empty list has to mean "nothing disabled" for a fresh install to look normal.
 */
function RenderEffectToggle({ effect }: { effect: (typeof RENDER_EFFECTS)[number] }) {
  const t = useT();
  const disabled = useEffectDisabled(effect.id);
  return (
    <SettingToggle
      title={t(effect.label)}
      description={t(effect.description)}
      checked={!disabled}
      onCheckedChange={(checked) => setEffectDisabled(effect.id, !checked)}
    />
  );
}

/** Its own component so each row can hold its own subscription rather than one per item here. */
function ToolbarItemToggle({ item }: { item: (typeof TOOLBAR_ITEMS)[number] }) {
  const t = useT();
  const visible = useToolbarItemVisible(item.id);
  return (
    <SettingToggle
      title={t(item.label)}
      description={t(item.description)}
      checked={visible}
      onCheckedChange={(checked) => setToolbarItemVisible(item.id, checked)}
    />
  );
}

/** The common case: a row whose only control is a switch. */
function SettingToggle({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow title={title} description={description} disabled={disabled}>
      {(labelId) => (
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-labelledby={labelId}
        />
      )}
    </SettingRow>
  );
}

/**
 * Header for a settings card: icon, title and description on the left, status on the right.
 *
 * The four cards each rolled their own, and three of them put the status chip immediately
 * after the description inside a plain `flex gap-3` — so "Signed out" read as part of the
 * sentence rather than as the card's state. `justify-between` plus a `min-w-0 flex-1` text
 * column is what actually pins it to the right edge and truncates instead of overflowing.
 */
function SettingsCardHeader({
  title,
  titleId,
  description,
  icon,
  status,
}: {
  title: string;
  titleId: string;
  description: ReactNode;
  icon?: ReactNode;
  /** Right-aligned state, e.g. "Connected". */
  status?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      {icon ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {status ? <span className="shrink-0 text-sm">{status}</span> : null}
    </div>
  );
}

/** Quiet outbound links in the page header. */
type WindowControlStyle = "macos" | "windows" | "native";

const SETTINGS_TABS: Array<{
  id: SettingsTab;
  label: string;
  description: string;
  icon: typeof UserIcon;
}> = [
  { id: "about", label: msg("Account"), description: msg("Sign-in, integrations, updates"), icon: UserIcon },
  { id: "appearance", label: msg("Appearance"), description: msg("Theme and motion"), icon: PaletteIcon },
  {
    id: "playback",
    label: msg("Playback"),
    description: msg("Transitions and session"),
    icon: PlayIcon,
  },
  { id: "system", label: msg("Library"), description: msg("Cache and local files"), icon: FolderIcon },
  { id: "window", label: msg("Window"), description: msg("Chrome and mini player"), icon: QueuePanelIcon },
  { id: "shortcuts", label: msg("Shortcuts"), description: msg("Keyboard bindings"), icon: KeyIcon },
];

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  hint: string;
  swatch: string;
}> = [
  { value: "light", label: msg("Light"), hint: msg("Always light"), swatch: "bg-white" },
  { value: "dark", label: msg("Dark"), hint: msg("Always dark"), swatch: "bg-neutral-900" },
  {
    value: "system",
    label: msg("System"),
    hint: msg("Match the OS"),
    swatch: "bg-linear-to-br from-white to-neutral-900",
  },
];

interface SettingsPageProps {
  libraryController: LibraryController;
  libraryState: LibraryState;
  onRestartOnboarding: () => void;
  onSignIn: () => Promise<void>;
  onDeleteAllAppData: () => Promise<void>;
}

export function SettingsPage({
  libraryController,
  libraryState,
  onRestartOnboarding,
  onSignIn,
  onDeleteAllAppData,
}: SettingsPageProps) {
  const t = useT();
  const tvServer = useTvServer();
  useEffect(() => {
    if (isMobile) return;
    void refreshTvServerInfo();
    // "TV connected 3 minutes ago" stays current while the page is open.
    const id = window.setInterval(() => void refreshTvServerInfo(), 15000);
    return () => window.clearInterval(id);
  }, []);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheSizeGb, setCacheSizeGb] = useState(DEFAULT_CACHE_SIZE_GB.toString());
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [updateResult, setUpdateResult] = useState<UpdateInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "installing" | "current" | "error"
  >("idle");
  const [updateProgress, setUpdateProgress] = useState<UpdateInstallProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [autostartEnabled, setAutostartEnabledState] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(true);
  const [autostartError, setAutostartError] = useState<string | null>(null);
  const [logOpening, setLogOpening] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [miniPlayerResetting, setMiniPlayerResetting] = useState(false);
  const [resetSettingsConfirming, setResetSettingsConfirming] = useState(false);
  const [resetSettingsBusy, setResetSettingsBusy] = useState(false);
  const [resetSettingsError, setResetSettingsError] = useState<string | null>(null);
  const [localPlaylistName, setLocalPlaylistName] = useState("");
  const [localPlaylistPathInputs, setLocalPlaylistPathInputs] = useState<Record<string, string>>({});
  const [localPlaylistError, setLocalPlaylistError] = useState<string | null>(null);
  const [localPlaylistBrowsingId, setLocalPlaylistBrowsingId] = useState<string | null>(null);
  const [lastFmSession, setLastFmSession] = useState<LastFmSessionStatus | null>(null);
  const [lastFmAuth, setLastFmAuth] = useState<LastFmAuthStart | null>(null);
  const [lastFmBusy, setLastFmBusy] = useState(false);
  const [lastFmError, setLastFmError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("about");
  /*
   * Phones show Settings as an accordion: every section is a row, and one opens in place under
   * its own header. Closed at first, so the four sections read as a menu, not a wall of cards.
   */
  const [sectionOpen, setSectionOpen] = useState(!isMobile);
  const mobileTabs = SETTINGS_TABS.filter((tab) => tab.id !== "window" && tab.id !== "shortcuts");
  const activeIndex = Math.max(0, mobileTabs.findIndex((tab) => tab.id === activeTab));
  const sectionHeaderRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (!isMobile || !sectionOpen) return;
    return registerBackHandler(() => {
      setSectionOpen(false);
      return true;
    });
  }, [sectionOpen]);
  const toggleSection = (id: SettingsTab) => {
    if (id === activeTab && sectionOpen) {
      setSectionOpen(false);
      return;
    }
    setActiveTab(id);
    setSectionOpen(true);
    // After the open renders: bring the opened header to the top of the page.
    requestAnimationFrame(() =>
      sectionHeaderRefs.current[id]?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  };
  const [settingsQuery, setSettingsQuery] = useState("");
  const themePreference = useThemePreference();
  const [listeningShortcut, setListeningShortcut] = useState<KeyboardShortcutAction | null>(null);
  const keyboardShortcuts = useKeyboardShortcuts();
  const miniPlayerEnabled = useMiniPlayerEnabled();
  const miniPlayerHoverAction = useMiniPlayerHoverAction();
  const miniPlayerSkin = useMiniPlayerSkin();
  const sidebarMode = useSidebarMode();
  const audioEngineMode = useAudioEngineMode();
  const authenticatedStreaming = useAuthenticatedStreaming();
  const youtubeScrobbling = useYouTubeScrobbling();
  const preferredLyricsSource = usePreferredLyricsSourceId();
  const lyricsFontScale = useLyricsFontScale();
  const zoom = useZoom();
  const lyricsTranslationLang = useLyricsTranslationLang();
  const madeForYouVisible = useMadeForYouVisible();
  const crossfadeSec = useCrossfadeSec();
  const volumeNormalization = useVolumeNormalization();
  const gaplessEnabled = useGaplessEnabled();
  const sessionRestoreEnabled = useSessionRestoreEnabled();
  const extraPlayerControlsAlwaysVisible = useExtraPlayerControlsAlwaysVisible();
  const compactPlayerBar = useCompactPlayerBar();
  const windowsStyleWindowControls = useWindowsStyleWindowControls();
  const nativeWindowControls = useNativeWindowControls();
  const forceWindowControls = useForceWindowControls();
  const windowOutline = useWindowOutline();
  const tilingWindowManager = useSyncExternalStore(
    subscribeTilingWindowManager,
    isTilingWindowManager,
    () => false,
  );
  // "Native" and "Windows-style" used to be two separate switches, one of which only meant
  // anything when the other was off. Collapsing them into one three-way pick removes the
  // combination that did nothing (native + windows-style both on).
  const windowControlStyle: WindowControlStyle = nativeWindowControls
    ? "native"
    : windowsStyleWindowControls ? "windows" : "macos";
  const handleWindowControlStyleChange = (style: WindowControlStyle) => {
    const goingNative = style === "native";
    if (goingNative !== nativeWindowControls) {
      setNativeWindowControls(goingNative);
      // GTK decorations don't reliably flip live on Linux, so this style needs a fresh window.
      if (isLinux) void relaunch().catch(() => window.location.reload());
    }
    if (!goingNative) setWindowsStyleWindowControls(style === "windows");
  };
  const mainWindowGeometryPersistenceEnabled = useMainWindowGeometryPersistenceEnabled();
  const minimizeToTray = useMinimizeToTray();
  const linuxMediaSession = useLinuxMediaSession();
  const offlineState = useOfflineState();
  const streamingQuality = useStreamingQuality();
  const downloadQuality = useDownloadQuality();
  const [offlineMaxGb, setOfflineMaxGb] = useState(
    () => getOfflineMaxBytes() / 1024 ** 3,
  );
  const [clearingDownloads, setClearingDownloads] = useState(false);
  const lastFmScrobblingEnabled = useLastFmScrobblingEnabled();
  const discordPresenceEnabled = useDiscordPresenceEnabled();
  const discordHideWhenPaused = useDiscordHideWhenPaused();
  const localPlaylists = useSyncExternalStore(
    subscribeToLocalPlaylists,
    getLocalPlaylists,
    getLocalPlaylists,
  );
  const account = libraryState.library?.account;
  // Confirmed by YouTube rather than inferred from cached data — see LibraryState.
  const isSignedIn = libraryState.status === "ready"
    && account
    && libraryState.sessionConfirmedAt !== null;
  const authBusy = libraryState.status === "restoring"
    || libraryState.status === "authorizing"
    || libraryState.status === "loading";

  useEffect(() => {
    let active = true;
    void getCacheStats()
      .then((stats) => {
        if (!active) return;
        setCacheStats(stats);
        setCacheSizeGb((stats.maxBytes / 1024 ** 3).toString());
      })
      .catch(() => {
        if (active) setCacheError(t("Unable to load cache settings."));
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    let active = true;
    void getInstalledVersion()
      .then((version) => {
        if (active) setInstalledVersion(version);
      })
      .catch(() => {
        if (active) setInstalledVersion("Unknown");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void LastFmService.getSession()
      .then((session) => {
        if (active) setLastFmSession(session);
      })
      .catch((error) => {
        if (active) {
          setLastFmError(error instanceof Error ? error.message : t("Unable to load Last.fm connection."));
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    if (!resetSettingsConfirming) return undefined;
    const timeout = window.setTimeout(() => setResetSettingsConfirming(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [resetSettingsConfirming]);

  const handleCheckForUpdates = async () => {
    setUpdateStatus("checking");
    setUpdateResult(null);
    setUpdateError(null);
    setUpdateProgress(null);
    try {
      const update = await checkForUpdates();
      setUpdateResult(update);
      setUpdateStatus(update ? "idle" : "current");
    } catch (error) {
      setUpdateError(getUpdateFailureMessage(error));
      setUpdateStatus("error");
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateResult) return;
    setUpdateStatus("installing");
    setUpdateError(null);
    try {
      await installUpdate(updateResult, setUpdateProgress);
    } catch {
      setUpdateError(t("Unable to install the update. You can download it from GitHub."));
      setUpdateStatus("error");
    }
  };

  useEffect(() => {
    let active = true;
    void getAutostartEnabled()
      .then((enabled) => {
        if (active) setAutostartEnabledState(enabled);
      })
      .catch(() => {
        if (active) setAutostartError(t("Unable to load the startup setting."));
      })
      .finally(() => {
        if (active) setAutostartLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const handleAutostartChange = async (enabled: boolean) => {
    setAutostartLoading(true);
    setAutostartError(null);
    try {
      await setAutostartEnabled(enabled);
      setAutostartEnabledState(enabled);
    } catch {
      setAutostartError(t("Unable to update the startup setting."));
    } finally {
      setAutostartLoading(false);
    }
  };

  const handleOpenLog = async () => {
    setLogOpening(true);
    setLogError(null);
    try {
      await invoke("open_current_log");
    } catch {
      setLogError(t("Unable to open the log file."));
    } finally {
      setLogOpening(false);
    }
  };

  const handleResetMiniPlayerPosition = async () => {
    setMiniPlayerResetting(true);
    try {
      await resetMiniPlayerPosition();
    } finally {
      setMiniPlayerResetting(false);
    }
  };

  const saveCacheSize = async (value: string = cacheSizeGb) => {
    const sizeGb = Number(value);
    if (!Number.isFinite(sizeGb) || sizeGb < 0.25 || sizeGb > 64) {
      setCacheError(t("Cache size must be between 0.25 GB and 64 GB."));
      return;
    }

    setCacheBusy(true);
    setCacheError(null);
    try {
      setCacheStats(await setCacheMaxBytes(Math.round(sizeGb * 1024 ** 3)));
    } catch {
      setCacheError(t("Unable to save the cache size."));
    } finally {
      setCacheBusy(false);
    }
  };

  const handleClearCache = async () => {
    setCacheBusy(true);
    setCacheError(null);
    try {
      setCacheStats(await clearCache());
    } catch {
      setCacheError(t("Unable to clear cached content."));
    } finally {
      setCacheBusy(false);
    }
  };

  const handleClearAllSettings = async () => {
    setResetSettingsError(null);
    if (!resetSettingsConfirming) {
      setResetSettingsConfirming(true);
      return;
    }

    setResetSettingsBusy(true);
    try {
      await onDeleteAllAppData();
      await relaunch().catch(() => {
        window.location.reload();
      });
    } catch {
      setResetSettingsError(t("Unable to delete all app data."));
      setResetSettingsBusy(false);
      setResetSettingsConfirming(false);
    }
  };

  const handleCreateLocalPlaylist = () => {
    setLocalPlaylistError(null);
    try {
      createLocalPlaylist(localPlaylistName);
      setLocalPlaylistName("");
    } catch (error) {
      setLocalPlaylistError(error instanceof Error ? error.message : t("Unable to create local playlist."));
    }
  };

  const handleStartLastFmAuth = async () => {
    setLastFmBusy(true);
    setLastFmError(null);
    try {
      const auth = await LastFmService.startAuth();
      setLastFmAuth(auth);
    } catch (error) {
      setLastFmError(error instanceof Error ? error.message : t("Unable to start Last.fm sign-in."));
    } finally {
      setLastFmBusy(false);
    }
  };

  const handleFinishLastFmAuth = async () => {
    if (!lastFmAuth) return;
    setLastFmBusy(true);
    setLastFmError(null);
    try {
      const session = await LastFmService.completeAuth(lastFmAuth.token);
      setLastFmSession(session);
      setLastFmAuth(null);
      setLastFmScrobblingEnabled(true);
    } catch (error) {
      setLastFmError(error instanceof Error ? error.message : t("Unable to finish Last.fm sign-in."));
    } finally {
      setLastFmBusy(false);
    }
  };

  const handleDisconnectLastFm = async () => {
    setLastFmBusy(true);
    setLastFmError(null);
    try {
      await LastFmService.disconnect();
      setLastFmSession(null);
      setLastFmAuth(null);
    } catch (error) {
      setLastFmError(error instanceof Error ? error.message : t("Unable to disconnect Last.fm."));
    } finally {
      setLastFmBusy(false);
    }
  };

  const handleAddLocalPlaylistPath = (playlistId: string) => {
    setLocalPlaylistError(null);
    const path = localPlaylistPathInputs[playlistId]?.trim() ?? "";
    if (!path) {
      setLocalPlaylistError(t("Enter a folder path before adding it."));
      return;
    }
    addLocalPlaylistPath(playlistId, path);
    setLocalPlaylistPathInputs((current) => ({ ...current, [playlistId]: "" }));
  };

  const handleBrowseLocalPlaylistPath = async (playlistId: string) => {
    setLocalPlaylistError(null);
    setLocalPlaylistBrowsingId(playlistId);
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t("Choose music folder"),
      });
      if (typeof selected !== "string") return;
      addLocalPlaylistPath(playlistId, selected);
      setLocalPlaylistPathInputs((current) => ({
        ...current,
        [playlistId]: "",
      }));
    } catch {
      setLocalPlaylistError(t("Unable to open the folder picker."));
    } finally {
      setLocalPlaylistBrowsingId(null);
    }
  };

  const handleShortcutCapture = (
    event: KeyboardEvent<HTMLButtonElement>,
    action: KeyboardShortcutAction,
  ) => {
    if (listeningShortcut !== action) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.code === "Escape") {
      setListeningShortcut(null);
      return;
    }

    const shortcut = captureKeyboardShortcut(event.nativeEvent);
    if (!shortcut) return;

    setKeyboardShortcut(action, shortcut);
    setListeningShortcut(null);
  };

  useEffect(() => {
    if (!listeningShortcut) return undefined;

    const handleShortcutKeyDown = (event: globalThis.KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.code === "Escape") {
        setListeningShortcut(null);
        return;
      }

      const shortcut = captureKeyboardShortcut(event);
      if (!shortcut) return;

      setKeyboardShortcut(listeningShortcut, shortcut);
      setListeningShortcut(null);
    };

    window.addEventListener("keydown", handleShortcutKeyDown, true);
    return () => window.removeEventListener("keydown", handleShortcutKeyDown, true);
  }, [listeningShortcut]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  };

  return (
    <main className="@container/settings flex min-h-0 flex-1 flex-col gap-7">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 @max-4xl/settings:flex-col @max-4xl/settings:items-stretch">
        <div className="flex flex-col gap-1.5">
          <h1>{t("Settings")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Manage your account, library, appearance, and window behaviour.")}
          </p>
        </div>

        {/*
          Card pills rather than the bare text links these were: at text weight they read as
          part of the description above and were routinely missed. They stay unfilled so they
          still sit below the category nav in the hierarchy.
        */}
        <div className="flex flex-wrap items-center justify-end gap-2 @max-4xl/settings:justify-start">
          <div className="w-72 max-w-full @max-4xl/settings:w-full">
            <SettingsSearch query={settingsQuery} onQueryChange={setSettingsQuery} />
          </div>
          {/* On a phone these took a whole row above the tabs; they live in About there. */}
          {!isMobile && (
            <>
              <ExternalLinkButton
                icon={<StarIcon size={16} aria-hidden="true" />}
                label={t("Star on GitHub")}
                url={GITHUB_REPOSITORY_URL}
              />
              <ExternalLinkButton
                icon={<BugIcon size={16} aria-hidden="true" />}
                label={t("Report an issue")}
                url={GITHUB_NEW_ISSUE_URL}
              />
            </>
          )}
        </div>
      </header>

      {/* The category rail follows this pane's width, not the application viewport: an embedded
          or scaled Settings pane can be narrow even on a wide desktop window. */}
      <div className="flex min-h-0 flex-1 items-start gap-10 @max-4xl/settings:flex-col @max-4xl/settings:gap-4 max-sm:gap-2">
        {isMobile ? (
          /* Accordion headers. `order` interleaves them with the one content column below, so
             the open section's content sits directly under its own header. */
          mobileTabs.map((tab, index) => {
            const Icon = tab.icon;
            const open = sectionOpen && activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  sectionHeaderRefs.current[tab.id] = node;
                }}
                type="button"
                aria-expanded={open}
                aria-controls="settings-section-content"
                onClick={() => toggleSection(tab.id)}
                style={{ order: index * 2 }}
                className={cn(
                  "pressable flex w-full scroll-mt-2 items-center gap-3 rounded-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  open ? "bg-primary/10 ring-1 ring-primary/30" : "bg-card/60 shadow-card",
                )}
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-row",
                    open ? "glow bg-primary text-primary-foreground" : "bg-primary/15 text-primary",
                  )}
                >
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-semibold text-foreground">{t(tab.label)}</span>
                  <span className="truncate text-sm text-muted-foreground">{t(tab.description)}</span>
                </span>
                <ChevronDownIcon
                  size={20}
                  aria-hidden="true"
                  className={cn("shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
                />
              </button>
            );
          })
        ) : (
        <nav
          className="sticky top-0 flex w-56 shrink-0 flex-col gap-0.5 @max-4xl/settings:relative @max-4xl/settings:w-full @max-4xl/settings:flex-row @max-4xl/settings:overflow-x-auto @max-4xl/settings:rounded-xl @max-4xl/settings:bg-card/50 @max-4xl/settings:p-1"
          role="tablist"
          aria-label={t("Settings categories")}
        >
          {/* Mobile has no window chrome and no keyboard to bind. */}
          {SETTINGS_TABS.filter((tab) => !isMobile || (tab.id !== "window" && tab.id !== "shortcuts")).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "group/tab relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors @max-4xl/settings:shrink-0 @max-4xl/settings:px-2.5 @max-4xl/settings:py-2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  isActive ? "text-foreground" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="settings-tab-active"
                    transition={{ type: "spring", stiffness: 520, damping: 42 }}
                    className="absolute inset-0 -z-10 rounded-xl bg-card"
                  />
                )}
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
                    isActive ? "bg-primary/15 text-primary" : "bg-card/70 text-muted-foreground",
                  )}
                >
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{t(tab.label)}</span>
                  <span className="block truncate text-xs text-muted-foreground @max-4xl/settings:hidden">
                    {t(tab.description)}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
        )}

        <div
          id="settings-section-content"
          className={cn(
            "flex min-h-0 w-full min-w-0 max-w-2xl flex-1 flex-col @max-4xl/settings:max-w-none",
            // Phones: hidden while every section is closed (search results always show).
            isMobile && !sectionOpen && !settingsQuery.trim() && "hidden",
            isMobile && "animate-in fade-in slide-in-from-top-1",
          )}
          style={isMobile ? { order: settingsQuery.trim() ? -1 : activeIndex * 2 + 1 } : undefined}
        >
          {settingsQuery.trim() ? (
            <SettingsSearchResults
              query={settingsQuery}
              onSelect={(tab) => {
                setActiveTab(tab);
                setSectionOpen(true);
                setSettingsQuery("");
              }}
            />
          ) : isMobile && !sectionOpen ? null /* Phones: a closed section mounts nothing. */ : (
            <>
      {activeTab === "about" && (
        <div className="flex flex-col gap-5" role="tabpanel" aria-label={t("About settings")}>
          <section className={SETTINGS_CARD} aria-labelledby="account-settings-title">
            <SettingsCardHeader
              title={t("Account")}
              titleId="account-settings-title"
              icon={<UserIcon size={18} aria-hidden="true" />}
              description={isSignedIn ? t("Signed in to YouTube Music") : t("No account connected")}
              status={
                <span className={isSignedIn ? "text-primary" : "text-muted-foreground"}>
                  {isSignedIn ? t("Connected") : t("Signed out")}
                </span>
              }
            />

            {/* `justify-between` with a `min-w-0 flex-1` text column: without both, the name
                and description push the sign-out button off the right edge on long channel
                names instead of truncating. */}
            {/* Wraps on a narrow phone, so the sign-in button drops under the name instead of
                pushing past the card's edge. */}
            {/* Phones: a centred profile with a full-width action; wider panes keep the row. */}
            <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:text-center">
              <AccountAvatar
                artworkUrl={account?.artworkUrl}
                className="size-11 max-sm:size-16"
                iconSize={26}
              />

              <div className="flex min-w-0 flex-1 flex-col max-sm:w-full">
                <span className="truncate text-base font-medium text-foreground">
                  {isSignedIn ? account?.name || "YouTube Music" : t("Not signed in")}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {isSignedIn
                    ? t("Session confirmed {age}.", { age: formatSessionAge(libraryState.sessionConfirmedAt) })
                    : t("Sign in to load your library.")}
                </span>
              </div>

              {isSignedIn ? (
                <button
                  className={CARD_BUTTON}
                  type="button"
                  onClick={() => void libraryController.signOut()}
                >
                  <LogoutIcon size={18} aria-hidden="true" />
                  {t("Sign out")}
                </button>
              ) : (
                <div className="max-sm:flex max-sm:w-full max-sm:justify-center">
                  <GoogleSignInButton
                    isBusy={authBusy}
                    onClick={() => void onSignIn()}
                  />
                </div>
              )}
            </div>

            {/* Separate Google logins, not channels — always shown once signed in, since this
                is where a second account gets added, not just switched to. */}
            {isSignedIn && (
              <div className="flex flex-col gap-1.5 rounded-row bg-background/40 p-3">
                <GoogleAccountSwitcher
                  libraryController={libraryController}
                  showSingle
                  allowRemove
                  label={t("Accounts")}
                />
                <AddGoogleAccountButton disabled={authBusy} onClick={() => void onSignIn()} />
              </div>
            )}

            {/* Renders nothing unless the account actually has more than one channel. */}
            {isSignedIn && (
              <div className="flex flex-col gap-1.5 empty:hidden">
                <AccountSwitcher libraryController={libraryController} showSingle label={t("Channel")} />
              </div>
            )}

            {libraryState.error && <p className="text-sm text-destructive">{libraryState.error}</p>}
          </section>

          <section className={SETTINGS_CARD} aria-labelledby="lastfm-settings-title">
            <SettingsCardHeader
              title="Last.fm"
              titleId="lastfm-settings-title"
              icon={<LastFmIcon size={18} aria-hidden="true" />}
              description={
                lastFmSession
                  ? t("Connected as {username}", { username: lastFmSession.username })
                  : t("Connect Last.fm to scrobble your listening history.")
              }
              status={
                <span className={lastFmSession ? "text-primary" : "text-muted-foreground"}>
                  {lastFmSession ? t("Connected") : t("Signed out")}
                </span>
              }
            />

            <div className="flex flex-col gap-5">
              <SettingToggle
                title={t("Scrobble plays")}
                description={t("Send now playing updates and scrobbles after a track reaches the Last.fm listening threshold.")}
                checked={lastFmSession ? lastFmScrobblingEnabled : false}
                disabled={!lastFmSession}
                onCheckedChange={setLastFmScrobblingEnabled}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                  <strong>{t("Account connection")}</strong>
                  <span>
                    {lastFmAuth
                      ? t("Approve the connection in your browser, then finish it here.")
                      : lastFmSession
                        ? t("Disconnecting stops future Last.fm updates from this app.")
                        : t("A browser window will open so you can approve this app on Last.fm.")}
                  </span>
                </span>
                {lastFmSession ? (
                  <button
                    className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    type="button"
                    disabled={lastFmBusy}
                    onClick={() => void handleDisconnectLastFm()}
                  >
                    <LastFmIcon size={18} />
                    {lastFmBusy ? t("Disconnecting...") : t("Disconnect")}
                  </button>
                ) : lastFmAuth ? (
                  <button
                    className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    type="button"
                    disabled={lastFmBusy}
                    onClick={() => void handleFinishLastFmAuth()}
                  >
                    <LastFmIcon size={18} />
                    {lastFmBusy ? t("Finishing...") : t("Finish connection")}
                  </button>
                ) : (
                  <button
                    className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    type="button"
                    disabled={lastFmBusy}
                    onClick={() => void handleStartLastFmAuth()}
                  >
                    <LastFmIcon size={18} />
                    {lastFmBusy ? t("Opening...") : t("Connect Last.fm")}
                  </button>
                )}
              </div>

              {lastFmError && <p className="text-sm text-destructive">{lastFmError}</p>}
            </div>
          </section>

          {/* Desktop only: not meaningful on mobile. */}
          {!isMobile && (
          <section className={SETTINGS_CARD} aria-labelledby="discord-settings-title">
            <h2 className="text-lg font-semibold text-foreground" id="discord-settings-title">
              Discord
            </h2>

            <div className="flex flex-col gap-5">
              <SettingToggle
                title={t("Show what you're playing")}
                description={t("Publishes the current track, artist and artwork to your Discord profile. Turning this off clears whatever is showing there now.")}
                checked={discordPresenceEnabled}
                onCheckedChange={(enabled) => void DiscordRpcService.setEnabled(enabled)}
              />
              <SettingToggle
                title={t("Hide status when paused")}
                description={t("Clear your Discord Rich Presence while playback is paused. It returns when playback resumes.")}
                checked={discordHideWhenPaused}
                disabled={!discordPresenceEnabled}
                onCheckedChange={(hidden) => void DiscordRpcService.setHideWhenPaused(hidden)}
              />
            </div>
          </section>
          )}

          <section className={SETTINGS_CARD} aria-labelledby="about-settings-title">
            <SettingsCardHeader
              title={t("About Zuno")}
              titleId="about-settings-title"
              icon={<img src={appLogo} alt="" className="size-6 rounded-md" />}
              description={t("Version, updates and help.")}
              status={
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                  {installedVersion
                    ? installedVersion === "Unknown" ? t("Unknown") : `v${installedVersion}`
                    : "…"}
                </span>
              }
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                <strong>{t("Updates")}</strong>
                <span>
                  {updateStatus === "current"
                    ? t("You're on the latest version.")
                    : t("See whether a newer version is out.")}
                </span>
              </span>
              <button
                className={CARD_BUTTON}
                type="button"
                disabled={updateStatus === "checking"}
                onClick={() => void handleCheckForUpdates()}
              >
                <RefreshIcon size={18} aria-hidden="true" />
                {updateStatus === "checking" ? t("Checking…") : t("Check for updates")}
              </button>
            </div>

            {/* One inset box for the result, so the message and its actions read as a unit. */}
            {updateResult && (
              <div className="flex flex-col gap-3 rounded-row bg-background/50 p-3 text-sm">
                <span className="font-medium text-foreground">
                  {updateStatus === "installing"
                    ? updateProgress?.percent !== undefined
                      ? t("Downloading version {version}: {percent}%", { version: updateResult.version, percent: updateProgress.percent })
                      : t("Preparing version {version}…", { version: updateResult.version })
                    : t("Version {version} is available.", { version: updateResult.version })}
                </span>
                <div className="flex flex-wrap gap-2">
                  {updateResult.canInstall && (
                    <button
                      className={CARD_BUTTON_PRIMARY}
                      type="button"
                      disabled={updateStatus === "installing"}
                      onClick={() => void handleInstallUpdate()}
                    >
                      {updateStatus === "installing" ? t("Installing…") : t("Install update")}
                    </button>
                  )}
                  {/* The one link where a silent failure strands the user: if this cannot
                      open, they have no other route to the download. */}
                  <ExternalLinkButton
                    label={updateResult.canInstall ? t("View changes") : t("Download")}
                    url={updateResult.releaseUrl}
                    className="px-4 py-2"
                  />
                </div>
              </div>
            )}
            {updateStatus === "error" && (
              <p className="rounded-row bg-destructive/10 p-3 text-sm text-destructive">{updateError}</p>
            )}

            {/* The guided tour points at desktop chrome; a phone gets the project links instead. */}
            {isMobile ? (
              <div className="flex flex-col gap-2">
                <span className={SETTING_LABEL}>
                  <strong>{t("Help and feedback")}</strong>
                  <span>{t("Found a bug or have an idea? Tell us on GitHub.")}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  <ExternalLinkButton
                    icon={<BugIcon size={16} aria-hidden="true" />}
                    label={t("Report an issue")}
                    url={GITHUB_NEW_ISSUE_URL}
                  />
                  <ExternalLinkButton
                    icon={<StarIcon size={16} aria-hidden="true" />}
                    label={t("Star on GitHub")}
                    url={GITHUB_REPOSITORY_URL}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                  <strong>{t("Quick start")}</strong>
                  <span>{t("Replay the guided introduction.")}</span>
                </span>
                <button className={CARD_BUTTON} type="button" onClick={onRestartOnboarding}>
                  <RefreshIcon size={18} aria-hidden="true" />
                  {t("Start onboarding")}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "system" && (
        <div className="flex flex-col gap-5" role="tabpanel" aria-label={t("Library settings")}>
          {/* Desktop only: not meaningful on mobile. */}
          {!isMobile && (
          <section className={SETTINGS_CARD} aria-labelledby="library-local-title">
            <SettingsCardHeader
              title={t("Local music")}
              titleId="library-local-title"
              icon={<FolderIcon size={18} aria-hidden="true" />}
              description={t("Folders on this computer, scanned into playlists.")}
            />

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                  <strong>{t("Local playlists")}</strong>
                  <span>{t("Create playlists from folders on this computer.")}</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={cn(SETTINGS_FIELD, "w-44")}
                    type="text"
                    value={localPlaylistName}
                    placeholder={t("Playlist name")}
                    aria-label={t("Local playlist name")}
                    onChange={(event) => setLocalPlaylistName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleCreateLocalPlaylist();
                    }}
                  />
                  <button
                    className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    type="button"
                    onClick={handleCreateLocalPlaylist}
                  >
                    <FolderAddIcon size={18} />
                    {t("Create")}
                  </button>
                </div>
              </div>

              {localPlaylistError && <p className="text-sm text-destructive">{localPlaylistError}</p>}

              {localPlaylists.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {localPlaylists.map((playlist) => (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-background/40 px-3 py-2 text-sm" key={playlist.id}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-foreground">
                          <FolderIcon size={18} aria-hidden="true" />
                          {playlist.name}
                        </span>
                        <button
                          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          type="button"
                          onClick={() => deleteLocalPlaylist(playlist.id)}
                        >
                          <TrashIcon size={18} />
                          {t("Delete")}
                        </button>
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="flex items-center gap-2">
                          <input
                            className={cn(SETTINGS_FIELD, "flex-1")}
                            type="text"
                            value={localPlaylistPathInputs[playlist.id] ?? ""}
                            placeholder="/Users/name/Music"
                            aria-label={t("Folder path for {name}", { name: playlist.name })}
                            onChange={(event) => setLocalPlaylistPathInputs((current) => ({
                              ...current,
                              [playlist.id]: event.target.value,
                            }))}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") handleAddLocalPlaylistPath(playlist.id);
                            }}
                          />
                          <button
                            type="button"
                            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            disabled={localPlaylistBrowsingId === playlist.id}
                            title={t("Browse for folder")}
                            aria-label={t("Browse for a folder for {name}", { name: playlist.name })}
                            onClick={() => void handleBrowseLocalPlaylistPath(playlist.id)}
                          >
                            <FolderOpenIcon size={17} aria-hidden="true" />
                          </button>
                        </span>
                        <button
                          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          type="button"
                          onClick={() => handleAddLocalPlaylistPath(playlist.id)}
                        >
                          {t("Add")}
                        </button>
                      </div>

                      {playlist.paths.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {playlist.paths.map((path) => (
                            <div className="flex items-center justify-between gap-3 rounded-lg bg-background/40 px-3 py-2 text-sm" key={path}>
                              <span>{path}</span>
                              <button
                                type="button"
                                aria-label={t("Remove {path}", { path })}
                                onClick={() => removeLocalPlaylistPath(playlist.id, path)}
                              >
                                <TrashIcon size={16} aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="px-1 py-3 text-sm text-muted-foreground">{t("No paths added yet.")}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </section>
          )}

          <section className={SETTINGS_CARD} aria-labelledby="library-storage-title">
            <SettingsCardHeader
              title={t("Storage")}
              titleId="library-storage-title"
              icon={<DownloadIcon size={18} aria-hidden="true" />}
              description={t("How much disk Zuno is allowed to use.")}
            />

            {/* Each block: what it is, how full (figures + bar), then its actions on their own row. */}
            <div className="flex flex-col gap-3 rounded-row bg-background/40 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <strong className="text-sm font-medium text-foreground">{t("Cache")}</strong>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {cacheStats
                    ? tn("{used} of {total} · {n} item", "{used} of {total} · {n} items", cacheStats.entryCount, {
                      used: formatBytes(cacheStats.usedBytes),
                      total: formatBytes(cacheStats.maxBytes),
                    })
                    : t("Loading…")}
                </span>
              </div>
              <UsageMeter
                used={cacheStats?.usedBytes ?? 0}
                total={cacheStats?.maxBytes ?? 0}
                label={t("Cache used")}
              />
              <p className="text-xs text-muted-foreground">
                {t("Pages and covers Zuno keeps so the library opens instantly. Safe to clear.")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="w-36 max-sm:w-full"
                  value={
                    CACHE_SIZE_PRESETS_GB.includes(cacheSizeGb) ? cacheSizeGb : undefined
                  }
                  onValueChange={(value) => {
                    setCacheSizeGb(value);
                    void saveCacheSize(value);
                  }}
                >
                  <SelectTrigger aria-label={t("Maximum cache size")}>
                    <SelectValue placeholder={`${cacheSizeGb} GB`} />
                  </SelectTrigger>
                  <SelectContent>
                    {CACHE_SIZE_PRESETS_GB.map((gb) => (
                      <SelectItem key={gb} value={gb}>
                        {t("Up to {size}", { size: formatGb(Number(gb)) })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  className={cn(CARD_BUTTON, "text-destructive")}
                  type="button"
                  disabled={cacheBusy}
                  onClick={() => void handleClearCache()}
                >
                  <TrashIcon size={18} aria-hidden="true" />
                  {t("Clear cache")}
                </button>
              </div>
            </div>

            {cacheError && <p className="text-sm text-destructive">{cacheError}</p>}

            <div className="flex flex-col gap-3 rounded-row bg-background/40 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <strong className="text-sm font-medium text-foreground">{t("Downloads")}</strong>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Object.keys(offlineState.entries).length > 0
                    ? tn("{n} song · {used} of {total}", "{n} songs · {used} of {total}", Object.keys(offlineState.entries).length, {
                      used: formatBytes(offlineState.usedBytes),
                      total: formatGb(Math.round(offlineMaxGb)),
                    })
                    : t("No songs downloaded yet")}
                </span>
              </div>
              <UsageMeter
                used={offlineState.usedBytes}
                total={Math.max(1, offlineMaxGb) * 1024 ** 3}
                label={t("Download space used")}
              />
              {(offlineState.downloadingId || offlineState.queued.length > 0) && (
                <p className="text-xs text-muted-foreground">
                  {offlineState.downloadingId
                    ? offlineState.progress !== null
                      ? t("Downloading {progress}%", { progress: offlineState.progress })
                      : t("Downloading")
                    : ""}
                  {offlineState.queued.length > 0
                    ? ` · ${tn("{n} queued", "{n} queued", offlineState.queued.length)}`
                    : ""}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="w-36 max-sm:w-full"
                  value={String(Math.round(offlineMaxGb))}
                  onValueChange={(value) => {
                    const next = Number(value);
                    if (!Number.isFinite(next)) return;
                    setOfflineMaxGb(next);
                    setOfflineMaxBytes(Math.max(1, next) * 1024 ** 3);
                  }}
                >
                  <SelectTrigger aria-label={t("Maximum download size")}>
                    <SelectValue placeholder={formatGb(Math.round(offlineMaxGb))} />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...DOWNLOAD_SIZE_PRESETS_GB, Math.round(offlineMaxGb)])]
                      .sort((a, b) => a - b)
                      .map((gb) => (
                        <SelectItem key={gb} value={String(gb)}>
                          {t("Up to {size}", { size: formatGb(gb) })}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <button
                  className={cn(CARD_BUTTON, "text-destructive")}
                  type="button"
                  disabled={clearingDownloads || Object.keys(offlineState.entries).length === 0}
                  onClick={() => {
                    setClearingDownloads(true);
                    void removeAllDownloads().finally(() => setClearingDownloads(false));
                  }}
                >
                  <TrashIcon size={18} aria-hidden="true" />
                  {clearingDownloads ? t("Removing…") : t("Remove all")}
                </button>
              </div>
              <OfflineModeSetting />
            </div>

          </section>

          <BackupSettings />

          <section className={SETTINGS_CARD} aria-labelledby="library-quality-title">
            <SettingsCardHeader
              title={t("Quality")}
              titleId="library-quality-title"
              icon={<PlayIcon size={18} aria-hidden="true" />}
              description={t("Bitrate picked when a track is streamed or saved.")}
            />

            <SettingRow
              title={t("Streaming quality")}
              description={t("Applies to songs played over the network. Lower uses less data.")}
            >
              {(labelId) => (
                <Select
                  className="w-52 setting-wide"
                  value={streamingQuality}
                  onValueChange={(value) => setStreamingQuality(value as AudioQuality)}
                >
                  <SelectTrigger aria-labelledby={labelId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUDIO_QUALITY_LABELS) as AudioQuality[]).map((quality) => (
                      <SelectItem key={quality} value={quality}>
                        {t(AUDIO_QUALITY_LABELS[quality])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SettingRow>


            <SettingRow
              title={t("Download quality")}
              description={t("Applies to songs saved for offline. Higher sounds better and uses more disk.")}
            >
              {(labelId) => (
                <Select
                  className="w-52 setting-wide"
                  value={downloadQuality}
                  onValueChange={(value) => setDownloadQuality(value as AudioQuality)}
                >
                  <SelectTrigger aria-labelledby={labelId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUDIO_QUALITY_LABELS) as AudioQuality[]).map((quality) => (
                      <SelectItem key={quality} value={quality}>
                        {t(AUDIO_QUALITY_LABELS[quality])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SettingRow>

          </section>

          <section className={SETTINGS_CARD} aria-labelledby="library-lyrics-title">
            <SettingsCardHeader
              title={t("Lyrics")}
              titleId="library-lyrics-title"
              icon={<LyricsIcon size={18} aria-hidden="true" />}
              description={t("Where lyrics come from and how they read.")}
            />

            <SettingRow
              title={t("Translate lyrics")}
              description={t("Shows a translation under each line. Sends the lyrics to Google Translate.")}
            >
              {(labelId) => (
                <Select
                  className="w-52 setting-wide"
                  value={lyricsTranslationLang}
                  onValueChange={setLyricsTranslationLang}
                >
                  <SelectTrigger aria-labelledby={labelId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TRANSLATION_OFF}>{t("Off")}</SelectItem>
                    {TRANSLATION_LANGUAGES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {getLanguageLabel(code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SettingRow>


            <SettingRow
              title={t("Lyrics text size")}
              description={t("Scales the lyrics screen. The size still adapts to the window on top of this.")}
            >
              {(labelId) => (
                <Select
                  className="w-52 setting-wide"
                  value={String(lyricsFontScale)}
                  onValueChange={(value) => setLyricsFontScale(Number(value))}
                >
                  <SelectTrigger aria-labelledby={labelId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LYRICS_FONT_SCALES.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SettingRow>


            <SettingRow
              title={t("Preferred lyrics source")}
              description={t("Tried first when a song opens. If it has nothing for that song, the others still run.")}
            >
              {(labelId) => (
                <Select
                  className="w-52 setting-wide"
                  value={preferredLyricsSource}
                  onValueChange={setPreferredLyricsSourceId}
                >
                  <SelectTrigger aria-labelledby={labelId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_LYRICS_SOURCE}>{t("Automatic")}</SelectItem>
                    {LYRICS_SOURCES.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {t(source.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SettingRow>

          </section>

          {/* Desktop only: not meaningful on mobile. */}
          {!isMobile && (
          <section className={SETTINGS_CARD} aria-labelledby="library-system-title">
            <SettingsCardHeader
              title={t("System")}
              titleId="library-system-title"
              icon={<SettingsIcon size={18} aria-hidden="true" />}
              description={t("How Zuno behaves outside the window.")}
            />

            <SettingToggle
              title={t("Launch at startup")}
              description={t("Start Zuno when your computer starts.")}
              checked={autostartEnabled}
              disabled={autostartLoading}
              onCheckedChange={(checked) => void handleAutostartChange(checked)}
            />

            {autostartError && <p className="text-sm text-destructive">{autostartError}</p>}

            <SettingToggle
              title={t("Remember window size and location")}
              description={t("Reopen the main window with its last size and screen position.")}
              checked={mainWindowGeometryPersistenceEnabled}
              onCheckedChange={setMainWindowGeometryPersistenceEnabled}
            />


          </section>
          )}

          <section className={SETTINGS_CARD} aria-labelledby="library-trouble-title">
            <SettingsCardHeader
              title={t("Troubleshooting")}
              titleId="library-trouble-title"
              icon={<BugIcon size={18} aria-hidden="true" />}
              description={t("Diagnostics, and the irreversible reset.")}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                <strong>{t("Application log")}</strong>
                <span>{t("Open the current log file for sharing or troubleshooting.")}</span>
              </span>
              <button
                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                type="button"
                disabled={logOpening}
                onClick={() => void handleOpenLog()}
              >
                <LogFileIcon size={18} />
                {logOpening ? t("Opening...") : t("Open log")}
              </button>
            </div>

            {logError && <p className="text-sm text-destructive">{logError}</p>}


            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                <strong>{t("Delete all app data")}</strong>
                <span>{t("Reset settings, cache, account, queue, tabs, onboarding, and local data.")}</span>
              </span>
              <button
                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                type="button"
                disabled={resetSettingsBusy}
                onClick={() => void handleClearAllSettings()}
              >
                <TrashIcon size={18} />
                {resetSettingsBusy
                  ? t("Deleting...")
                  : resetSettingsConfirming
                    ? t("Press again to confirm")
                    : t("Delete everything")}
              </button>
            </div>

            {resetSettingsError && <p className="text-sm text-destructive">{resetSettingsError}</p>}
          </section>
        </div>
      )}

      {activeTab === "shortcuts" && (
        <div className="flex flex-col gap-5" role="tabpanel" aria-label={t("Keyboard shortcut settings")}>
          <section className={SETTINGS_CARD} aria-labelledby="keyboard-shortcuts-settings-title">
            <h2
              className="text-lg font-semibold text-foreground"
              id="keyboard-shortcuts-settings-title"
            >
              {t("Keyboard shortcuts")}
            </h2>

            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                  <strong>{t("Reset shortcuts")}</strong>
                  <span>{t("Restore every keyboard shortcut to its default.")}</span>
                </span>
                <button
                  className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  type="button"
                  onClick={resetKeyboardShortcuts}
                >
                  <RefreshIcon size={18} />
                  {t("Reset all")}
                </button>
              </div>

              {KEYBOARD_SHORTCUT_ACTIONS.map((shortcutAction) => {
                const shortcut = keyboardShortcuts[shortcutAction.id];
                const isListening = listeningShortcut === shortcutAction.id;

                return (
                  <div className="flex items-center justify-between gap-4 py-2" key={shortcutAction.id}>
                    <span className={SETTING_LABEL}>
                      <strong>{t(shortcutAction.label)}</strong>
                      <span>{t(shortcutAction.description)}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        className={cn("min-w-32 rounded-lg bg-background px-2.5 py-1.5 text-center text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", isListening && "text-primary")}
                        type="button"
                        aria-pressed={isListening}
                        onClick={() => setListeningShortcut(shortcutAction.id)}
                        onKeyDown={(event) => handleShortcutCapture(event, shortcutAction.id)}
                        onBlur={() => {
                          if (isListening) setListeningShortcut(null);
                        }}
                      >
                        {isListening ? t("Press shortcut...") : formatKeyboardShortcut(shortcut)}
                      </button>
                      <button
                        className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        type="button"
                        onClick={() => resetKeyboardShortcut(shortcutAction.id)}
                      >
                        {t("Reset")}
                      </button>
                      <button
                        className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        type="button"
                        disabled={!shortcut}
                        onClick={() => setKeyboardShortcut(shortcutAction.id, null)}
                      >
                        {t("Clear")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {activeTab === "window" && (
        <div className="flex flex-col gap-5" role="tabpanel" aria-label={t("Style settings")}>
          <section className={SETTINGS_CARD} aria-labelledby="tv-server-settings-title">
            <SettingsCardHeader
              title={t("Zuno on the TV")}
              titleId="tv-server-settings-title"
              icon={<GlobalIcon size={18} aria-hidden="true" />}
              description={t("Lets the Zuno TV app on an LG webOS television use this computer to find and play music. Keep Zuno open on this computer while you listen on the TV.")}
            />
            <SettingToggle
              title={t("Allow the TV to use this computer")}
              description={t("Both devices must be on the same Wi-Fi network. Windows may ask you to allow Zuno on private networks.")}
              checked={tvServer.info?.enabled ?? false}
              onCheckedChange={(checked) => void setTvServerEnabled(checked)}
            />
            {tvServer.info?.enabled && (
              <div className="flex flex-wrap items-center gap-6 rounded-xl bg-background/60 p-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("Computer address")}</span>
                  <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                    {tvServer.info.ip ?? t("Not connected to a network")}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("Pairing code")}</span>
                  <span className="font-mono text-2xl font-semibold tracking-[0.3em] tabular-nums text-primary">
                    {tvServer.info.code}
                  </span>
                </div>
                <button type="button" className={CARD_BUTTON} onClick={() => void newTvServerCode()}>
                  {t("New code")}
                </button>
                <span className="basis-full text-sm text-muted-foreground">
                  {tvServer.info.lastSeenMs
                    ? t("TV connected {time}", {
                        time: relativeTimeFormat({ numeric: "auto" }).format(
                          -Math.max(0, Math.round((Date.now() - tvServer.info.lastSeenMs) / 60000)),
                          "minute",
                        ),
                      })
                    : t("No TV has connected yet. Open Zuno TV and enter this address and code.")}
                </span>
              </div>
            )}
            {tvServer.error && <p className="text-sm text-destructive">{tvServer.error}</p>}
          </section>
          <section className={SETTINGS_CARD} aria-labelledby="window-settings-title">
            <SettingsCardHeader
              title={t("Window controls")}
              titleId="window-settings-title"
              icon={<QueuePanelIcon size={18} aria-hidden="true" />}
              description={t("Choose the title bar buttons and compact player behavior.")}
            />

            <SettingToggle
              title={t("Mini player")}
              description={t("Show compact playback controls when the main window is not focused. Turning this off closes its window and frees around 30 MB.")}
              checked={miniPlayerEnabled}
              onCheckedChange={setMiniPlayerEnabled}
            />

            <div className="flex flex-col gap-3">
              <span id="mini-player-skin-label" className={SETTING_LABEL}>
                <strong>{t("Mini player skin")}</strong>
                <span>{t("How the mini player looks. It opens in the new skin the next time it appears.")}</span>
              </span>
              <MiniPlayerSkinPicker labelledBy="mini-player-skin-label" />
            </div>

            <SettingRow
              title={t("Library sidebar")}
              description={t("How much room the playlist rail takes. Expand on hover keeps the collapsed width while still letting you read the list.")}
            >
              {() => (
                <Select
                  className="w-52 setting-wide"
                  value={sidebarMode}
                  onValueChange={(value) => setSidebarMode(value as SidebarMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIDEBAR_MODES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SettingRow>

            {miniPlayerSkin === "classic" && (
              <SettingRow
                title={t("Mini player hover bar")}
                description={t("Choose what the expanded hover slider controls.")}
              >
                {() => (
                  <Select
                    className="w-44 setting-wide"
                    value={miniPlayerHoverAction}
                    onValueChange={(value) =>
                      setMiniPlayerHoverAction(value as MiniPlayerHoverAction)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="seek">{t("Song position")}</SelectItem>
                      <SelectItem value="volume">{t("Volume")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </SettingRow>
            )}

            <div className="flex items-center justify-between gap-4 py-2">
              <span className={SETTING_LABEL}>
                <strong>{t("Mini player position")}</strong>
                <span>{t("Move the mini player back to the bottom center of this screen.")}</span>
              </span>
              <button
                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                type="button"
                disabled={miniPlayerResetting}
                onClick={() => void handleResetMiniPlayerPosition()}
              >
                {miniPlayerResetting ? t("Resetting...") : t("Reset position")}
              </button>
            </div>

            <SettingRow
              title={t("Window controls")}
              description={isLinux
                ? t("How minimize, maximize and close are drawn. Switching OS native restarts the app.")
                : t("How minimize, maximize and close are drawn.")}
            >
              {(labelId) => (
                <div role="group" aria-labelledby={labelId}>
                  <Tabs
                    value={windowControlStyle}
                    onValueChange={(value) =>
                      handleWindowControlStyleChange(value as WindowControlStyle)}
                    variant="segment"
                  >
                    <TabsList>
                      <TabsTrigger value="macos">macOS</TabsTrigger>
                      <TabsTrigger value="windows">Windows</TabsTrigger>
                      <TabsTrigger value="native">{t("OS native")}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}
            </SettingRow>

            {/* Next to the window buttons, because it decides what the close button does. */}
            <SettingToggle
              title={t("Minimize to tray")}
              description={t("Closing the window hides Zuno to the system tray and keeps playing. When off, no tray icon is shown.")}
              checked={minimizeToTray}
              onCheckedChange={setMinimizeToTray}
            />

            {/* Only reachable when it does something: hidden once native chrome takes over,
                and off tiling compositors the buttons already show without this. */}
            {isLinux && tilingWindowManager && windowControlStyle !== "native" && (
              <SettingToggle
                title={t("Show on this compositor")}
                description={t("Tiling compositors don't draw window buttons for apps, so they're hidden by default. Turn this on to show them anyway.")}
                checked={forceWindowControls}
                onCheckedChange={setForceWindowControls}
              />
            )}

            {/* The OS frame replaces the outline, so the switch would do nothing there. */}
            {windowControlStyle !== "native" && (
              <SettingToggle
                title={t("Window outline")}
                description={t("Draw a thin edge around the window so it stands apart from what's behind it.")}
                checked={windowOutline}
                onCheckedChange={setWindowOutline}
              />
            )}

            {isLinux && (
              <SettingToggle
                title={t("Show in system media controls")}
                description={t("Expose playback to the desktop's media widget and media keys (MPRIS). Turning this off stops the now-playing notifications some desktops show.")}
                checked={linuxMediaSession}
                onCheckedChange={setLinuxMediaSession}
              />
            )}
          </section>

          <section className={SETTINGS_CARD} aria-labelledby="behavior-settings-title">
            <div className="flex items-center gap-2">
              <h2 className="text-lg" id="behavior-settings-title">{t("Behavior")}</h2>
            </div>

            <SettingToggle
              title={t("Compact player bar")}
              description={t("Tuck the seek bar under the transport controls instead of spanning the full width.")}
              checked={compactPlayerBar}
              onCheckedChange={setCompactPlayerBar}
            />

            <SettingToggle
              title={t("Always show extra controls")}
              description={t("Keep lyrics and queue visible instead of showing them only on hover.")}
              checked={extraPlayerControlsAlwaysVisible}
              onCheckedChange={setExtraPlayerControlsAlwaysVisible}
            />
          </section>
        </div>
      )}

      {activeTab === "playback" && (
        <div className="flex flex-col gap-5" role="tabpanel" aria-label={t("Playback settings")}>
          <section className={SETTINGS_CARD} aria-labelledby="playback-engine-title">
            <SettingsCardHeader
              title={t("Audio engine")}
              titleId="playback-engine-title"
              icon={<PlayIcon size={18} aria-hidden="true" />}
              description={t("What actually plays the sound.")}
            />

            {/* One card per engine with its own description, instead of a dropdown beside a
                description that only knew two of the three engines (Rust showed the YouTube
                player's text). Cards stack and wrap at any width. */}
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("Playback method")}>
              {AUDIO_ENGINE_MODES.map((option) => {
                const selected = audioEngineMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAudioEngineMode(option.value)}
                    className={cn(
                      "pressable flex w-full items-start gap-3 rounded-row p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "bg-primary/10 ring-1 ring-primary/40"
                        : "bg-muted/40 hover:bg-muted/70",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ring-2",
                        selected ? "bg-primary ring-primary" : "ring-muted-foreground/40",
                      )}
                    >
                      {selected ? <span className="size-2 rounded-full bg-primary-foreground" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold text-foreground">
                        {t(option.label)}
                        {option.value === "rust" ? (
                          <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {t("Recommended")}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm text-muted-foreground">{t(option.hint)}</span>
                      {selected ? (
                        <span className="text-xs text-muted-foreground">{t("Applies from the next track.")}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <OutputDeviceSetting engineMode={audioEngineMode} />

            <SettingToggle
              title={t("Resolve streams as your account")}
              description={t("Attaches your session when resolving a track — required for Premium bitrates. Downloads always resolve anonymously.")}
              checked={authenticatedStreaming}
              onCheckedChange={setAuthenticatedStreaming}
            />

            <SettingToggle
              title={t("Add plays to YouTube Music history")}
              description={t("Reports plays to YouTube, feeding its recommendations. Also enables the setting above. The YouTube frame always reports its own.")}
              checked={youtubeScrobbling}
              onCheckedChange={(enabled) => {
                // Paired here rather than inside the setter, so the toolbar shortcut can flip
                // scrobbling on its own without silently changing stream resolution too.
                setYouTubeScrobbling(enabled);
                setAuthenticatedStreaming(enabled);
              }}
            />
          </section>

          <SpeedPitchSettings rustEngine={audioEngineMode === "rust"} />

          <BitPerfectSettings engineMode={audioEngineMode} />
          <SoundProfilesSettings engineMode={audioEngineMode} />
          {isMobile && <HeadsetSettingsCard />}
          <EqualizerSettings engineMode={audioEngineMode} />

          <section className={SETTINGS_CARD} aria-labelledby="playback-settings-title">
            <SettingsCardHeader
              title={t("Transitions")}
              titleId="playback-settings-title"
              icon={<PlayIcon size={18} aria-hidden="true" />}
              description={t("How one track becomes the next.")}
            />

            <SettingToggle
              title={t("Normalize volume")}
              description={
                audioEngineMode === "rust"
                  ? t("Turns loud tracks down to YouTube's reference level, so a playlist plays at one volume.")
                  : t("Needs the Rust audio engine. The YouTube player already levels volume on its own.")
              }
              checked={volumeNormalization}
              onCheckedChange={setVolumeNormalization}
              disabled={audioEngineMode !== "rust"}
            />

            <SettingToggle
              title={t("Gapless playback")}
              description={t("Load the next track while the current one is still playing, so albums and live sets run without a pause between songs.")}
              checked={gaplessEnabled}
              onCheckedChange={setGaplessEnabled}
            />

            <SettingRow
              title={t("Crossfade")}
              description={
                crossfadeSec > 0
                  ? tn("Overlap each track with the next by {n} second.", "Overlap each track with the next by {n} seconds.", crossfadeSec)
                  : t("Off. Move the slider to overlap the end of each track with the start of the next.")
              }
            >
              {(labelId) => (
                <span className="flex items-center gap-3">
                  <RangeSlider
                    className="w-44 setting-wide"
                    value={crossfadeSec}
                    min={0}
                    max={MAX_CROSSFADE_SEC}
                    step={1}
                    onValueChange={setCrossfadeSec}
                    aria-label={t("Crossfade length in seconds")}
                  />
                  <span
                    id={labelId}
                    className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground"
                  >
                    {crossfadeSec > 0 ? `${crossfadeSec}s` : t("Off")}
                  </span>
                </span>
              )}
            </SettingRow>

            {/*
              Crossfading a downloaded track is not possible: offline files play through an
              audio element rather than the deck pair the overlap needs. Saying so beats
              leaving people to wonder why it only sometimes works.
            */}
            <p className="text-sm text-muted-foreground">
              {t("Both apply to streamed tracks. Downloaded and local files always play back to back.")}
            </p>
          </section>

          <section className={SETTINGS_CARD} aria-labelledby="session-settings-title">
            <SettingsCardHeader
              title={t("Session")}
              titleId="session-settings-title"
              icon={<QueuePanelIcon size={18} aria-hidden="true" />}
              description={t("What comes back when you reopen Zuno.")}
            />

            <SettingToggle
              title={t("Restore tabs and queues")}
              description={t("Reopen your tabs, queues and playback position on launch. Playback always starts paused.")}
              checked={sessionRestoreEnabled}
              onCheckedChange={setSessionRestoreEnabled}
            />
          </section>
        </div>
      )}

      {activeTab === "appearance" && (
        <div className="flex flex-col gap-5" role="tabpanel" aria-label={t("Appearance settings")}>
          <LanguageSettings />
          <section className={SETTINGS_CARD} aria-labelledby="theme-settings-title">
            <SettingsCardHeader
              title={t("Look & feel")}
              titleId="theme-settings-title"
              icon={<PaletteIcon size={18} aria-hidden="true" />}
              description={t("Theme, colour and style. Changes apply instantly.")}
            />

            <h3 className="-mb-2 text-sm font-medium text-foreground">{t("Theme")}</h3>

            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-labelledby="theme-settings-title"
            >
              {THEME_OPTIONS.map((option) => {
                const isActive = themePreference === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setThemePreference(option.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl p-3 transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      isActive ? "bg-primary/15" : "bg-background/40 hover:bg-card",
                    )}
                  >
                    {/* Miniature window preview rather than a colour dot — it shows what
                        the choice actually does. */}
                    <span
                      className={cn(
                        "flex h-12 w-full flex-col justify-end overflow-hidden rounded-lg p-1 ring-1",
                        option.swatch,
                        isActive ? "ring-primary" : "ring-border",
                      )}
                      aria-hidden="true"
                    >
                      <span
                        className={cn(
                          "h-2 w-full rounded-sm",
                          option.value === "light" ? "bg-neutral-300" : "bg-neutral-700",
                        )}
                      />
                    </span>
                    <span className="text-sm font-medium text-foreground">{t(option.label)}</span>
                    <span className="text-xs text-muted-foreground">{t(option.hint)}</span>
                  </button>
                );
              })}
            </div>

            <AppearancePicker />

            {/* Desktop only: not meaningful on mobile. */}
            {!isMobile && (
            <SettingRow
              title={t("App size")}
              description={t("Zooms the whole app. {key} with + or − works too, and 0 resets it.", { key: isMacOS ? "⌘" : "Ctrl" })}
            >
              {(labelId) => (
                <Select
                  className="w-52 setting-wide"
                  value={String(zoom)}
                  onValueChange={(value) => setZoom(Number(value))}
                >
                  <SelectTrigger aria-labelledby={labelId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ZOOM_LEVELS.map((level) => (
                      <SelectItem key={level} value={String(level)}>
                        {`${Math.round(level * 100)}%`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SettingRow>
            )}
          </section>

          {/* No title bar on a phone, so nothing for this card to configure there. */}
          {!isMobile && (
          <section className={SETTINGS_CARD} aria-labelledby="toolbar-settings-title">
            <SettingsCardHeader
              title={t("Title bar")}
              titleId="toolbar-settings-title"
              icon={<QueuePanelIcon size={18} aria-hidden="true" />}
              description={t("Which optional buttons sit next to the window controls.")}
            />

            {TOOLBAR_ITEMS.map((item) => (
              <ToolbarItemToggle key={item.id} item={item} />
            ))}
          </section>
          )}

          <section className={SETTINGS_CARD} aria-labelledby="home-settings-title">
            <SettingsCardHeader
              title={t("Home")}
              titleId="home-settings-title"
              icon={<HomeIcon size={18} aria-hidden="true" />}
              description={t("Which sections the home page shows.")}
            />

            <SettingToggle
              title={t("Made for you")}
              description={t("The recommendation carousel at the top. Hiding it leaves the surprise button and More recommendations working.")}
              checked={madeForYouVisible}
              onCheckedChange={setMadeForYouVisible}
            />
          </section>

          <section className={SETTINGS_CARD} aria-labelledby="motion-settings-title">
            <SettingsCardHeader
              title={t("Motion & performance")}
              titleId="motion-settings-title"
              icon={<SettingsIcon size={18} aria-hidden="true" />}
              description={t("Turn these off on low-powered devices.")}
            />

            <PotatoPcSettings />
          </section>
        </div>
      )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
