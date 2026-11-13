import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from "react";
import { Switch } from "@/components/motion/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { RangeSlider } from "@/components/motion/range-slider";
import appLogo from "../../../assets/img/logo-72.png";
import { playerController } from "../../player/playerStore";
import { setEqualizerEnabled, useEqualizerEnabled } from "../settings/equalizer";
import { EqualizerPanel } from "../components/Equalizer";
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
  FolderAddIcon,
  FolderIcon,
  FolderOpenIcon,
  CheckActiveIcon,
  HomeIcon,
  KeyIcon,
  LastFmIcon,
  LogFileIcon,
  LogoutIcon,
  LyricsIcon,
  PaletteIcon,
  PlayIcon,
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
import { isLinux, isMacOS, isMobile, isTilingWindowManager, subscribeTilingWindowManager } from "../platform";
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
  const accent = useAccent();
  const customAccent = useCustomAccent();
  const style = useStyle();
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h3 className="text-sm font-medium text-foreground" id="accent-settings-title">Accent colour</h3>
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-labelledby="accent-settings-title">
          {ACCENTS.map((option) => {
            const selected = accent === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={option.label}
                title={option.label}
                onClick={() => setAccent(option.id)}
                className={cn(
                  "pressable grid size-10 place-items-center rounded-full ring-offset-2 ring-offset-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "ring-2 ring-foreground",
                )}
                style={{ backgroundColor: option.swatch }}
              >
                {selected ? <CheckActiveIcon size={18} className="text-white" aria-hidden="true" /> : null}
              </button>
            );
          })}
          <label
            className={cn(
              "pressable relative grid size-10 cursor-pointer place-items-center overflow-hidden rounded-full ring-offset-2 ring-offset-card focus-within:ring-2 focus-within:ring-ring",
              accent === "custom" && "ring-2 ring-foreground",
            )}
            title="Custom colour"
            style={{
              background:
                accent === "custom"
                  ? customAccent
                  : "conic-gradient(#e8002e, #c2410c, #ca8a04, #047857, #2563eb, #7c3aed, #be185d, #e8002e)",
            }}
          >
            <input
              type="color"
              aria-label="Custom accent colour"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              value={customAccent}
              onChange={(event) => setCustomAccent(event.target.value)}
            />
            {accent === "custom" ? (
              <CheckActiveIcon size={18} className="pointer-events-none text-white" aria-hidden="true" />
            ) : null}
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <h3 className="text-sm font-medium text-foreground" id="style-settings-title">Style</h3>
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
                <span className="text-sm font-semibold text-foreground">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.hint}</span>
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
    <section className={SETTINGS_CARD} aria-labelledby="speed-settings-title">
      <SettingsCardHeader
        title="Speed & pitch"
        titleId="speed-settings-title"
        icon={<SpeedIcon size={18} aria-hidden="true" />}
        description="Change tempo without chipmunk voices, or key without changing tempo."
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
              Reset
            </button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground" id="speed-row-label">
          Speed <span className="tabular-nums text-muted-foreground">· {rate}×</span>
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
            Pitch{" "}
            <span className="tabular-nums text-muted-foreground">
              · {pitch === 0 ? "original key" : `${pitch > 0 ? "+" : ""}${pitch} semitone${Math.abs(pitch) === 1 ? "" : "s"}`}
            </span>
          </span>
          <div className="flex items-center gap-2" role="group" aria-labelledby="pitch-row-label">
            <button
              type="button"
              aria-label="Lower pitch a semitone"
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
              aria-label="Pitch in semitones"
              className="h-10 min-w-0 flex-1 accent-[var(--color-primary)]"
              onChange={(event) => applyPitch(Number(event.target.value))}
            />
            <button
              type="button"
              aria-label="Raise pitch a semitone"
              className={cn(chip(false), "flex-none text-lg")}
              disabled={pitch >= 12}
              onClick={() => applyPitch(pitch + 1)}
            >
              +
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Pitch needs the Rust audio engine.</p>
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
  if (confirmedAt === null) return "not yet";
  const minutes = Math.floor((Date.now() - confirmedAt) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

/**
 * Text field. Preflight strips the browser's default input chrome, and these two fields were
 * left bare by the CSS Modules migration — they rendered as invisible text on the card.
 */
const SETTINGS_FIELD =
  "min-w-0 rounded-lg bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring/60";

/** The equaliser card. The switch is a bypass: off dims the curve but leaves it editable. */
function EqualizerSettings({ engineMode }: { engineMode: AudioEngineMode }) {
  const enabled = useEqualizerEnabled();
  // Only the Rust engine has the samples; the YouTube fallback plays unequalised.
  const available = engineMode === "rust";

  return (
    <section className={SETTINGS_CARD} aria-labelledby="equalizer-settings-title">
      <SettingsCardHeader
        title="Equaliser"
        titleId="equalizer-settings-title"
        icon={<EqualizerIcon size={18} aria-hidden="true" />}
        description={
          available
            ? "Ten bands, shaped live on the track that is playing."
            : "Needs the Rust playback method."
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
      title="Output device"
      description="Which sound card the Rust engine plays to."
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
            <SelectItem value={SYSTEM_DEFAULT_DEVICE}>System default</SelectItem>
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
  const potatoPcMode = usePotatoPcMode();
  const [isManaging, setIsManaging] = useState(false);
  const panelId = useId();

  return (
    <>
      <SettingRow
        title="Potato PC"
        description="Turns off animations, blur, shadows and the ambient artwork, and switches to opaque surfaces. Manage picks them off one at a time."
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
              {isManaging ? "Done" : "Manage"}
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
            One switch per effect. Turn them off one at a time to find which one your machine is
            paying for.
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
  const disabled = useEffectDisabled(effect.id);
  return (
    <SettingToggle
      title={effect.label}
      description={effect.description}
      checked={!disabled}
      onCheckedChange={(checked) => setEffectDisabled(effect.id, !checked)}
    />
  );
}

/** Its own component so each row can hold its own subscription rather than one per item here. */
function ToolbarItemToggle({ item }: { item: (typeof TOOLBAR_ITEMS)[number] }) {
  const visible = useToolbarItemVisible(item.id);
  return (
    <SettingToggle
      title={item.label}
      description={item.description}
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
  { id: "about", label: "Account", description: "Sign-in, integrations, updates", icon: UserIcon },
  { id: "appearance", label: "Appearance", description: "Theme and motion", icon: PaletteIcon },
  {
    id: "playback",
    label: "Playback",
    description: "Transitions and session",
    icon: PlayIcon,
  },
  { id: "system", label: "Library", description: "Cache and local files", icon: FolderIcon },
  { id: "window", label: "Window", description: "Chrome and mini player", icon: QueuePanelIcon },
  { id: "shortcuts", label: "Shortcuts", description: "Keyboard bindings", icon: KeyIcon },
];

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  hint: string;
  swatch: string;
}> = [
  { value: "light", label: "Light", hint: "Always light", swatch: "bg-white" },
  { value: "dark", label: "Dark", hint: "Always dark", swatch: "bg-neutral-900" },
  {
    value: "system",
    label: "System",
    hint: "Match the OS",
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
        if (active) setCacheError("Unable to load cache settings.");
      });
    return () => {
      active = false;
    };
  }, []);

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
          setLastFmError(error instanceof Error ? error.message : "Unable to load Last.fm connection.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

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
      setUpdateError("Unable to install the update. You can download it from GitHub.");
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
        if (active) setAutostartError("Unable to load the startup setting.");
      })
      .finally(() => {
        if (active) setAutostartLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleAutostartChange = async (enabled: boolean) => {
    setAutostartLoading(true);
    setAutostartError(null);
    try {
      await setAutostartEnabled(enabled);
      setAutostartEnabledState(enabled);
    } catch {
      setAutostartError("Unable to update the startup setting.");
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
      setLogError("Unable to open the log file.");
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
      setCacheError("Cache size must be between 0.25 GB and 64 GB.");
      return;
    }

    setCacheBusy(true);
    setCacheError(null);
    try {
      setCacheStats(await setCacheMaxBytes(Math.round(sizeGb * 1024 ** 3)));
    } catch {
      setCacheError("Unable to save the cache size.");
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
      setCacheError("Unable to clear cached content.");
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
      setResetSettingsError("Unable to delete all app data.");
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
      setLocalPlaylistError(error instanceof Error ? error.message : "Unable to create local playlist.");
    }
  };

  const handleStartLastFmAuth = async () => {
    setLastFmBusy(true);
    setLastFmError(null);
    try {
      const auth = await LastFmService.startAuth();
      setLastFmAuth(auth);
    } catch (error) {
      setLastFmError(error instanceof Error ? error.message : "Unable to start Last.fm sign-in.");
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
      setLastFmError(error instanceof Error ? error.message : "Unable to finish Last.fm sign-in.");
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
      setLastFmError(error instanceof Error ? error.message : "Unable to disconnect Last.fm.");
    } finally {
      setLastFmBusy(false);
    }
  };

  const handleAddLocalPlaylistPath = (playlistId: string) => {
    setLocalPlaylistError(null);
    const path = localPlaylistPathInputs[playlistId]?.trim() ?? "";
    if (!path) {
      setLocalPlaylistError("Enter a folder path before adding it.");
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
        title: "Choose music folder",
      });
      if (typeof selected !== "string") return;
      addLocalPlaylistPath(playlistId, selected);
      setLocalPlaylistPathInputs((current) => ({
        ...current,
        [playlistId]: "",
      }));
    } catch {
      setLocalPlaylistError("Unable to open the folder picker.");
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
          <h1>Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account, library, appearance, and window behaviour.
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
                label="Star on GitHub"
                url={GITHUB_REPOSITORY_URL}
              />
              <ExternalLinkButton
                icon={<BugIcon size={16} aria-hidden="true" />}
                label="Report an issue"
                url={GITHUB_NEW_ISSUE_URL}
              />
            </>
          )}
        </div>
      </header>

      {/* The category rail follows this pane's width, not the application viewport: an embedded
          or scaled Settings pane can be narrow even on a wide desktop window. */}
      <div className="flex min-h-0 flex-1 items-start gap-10 @max-4xl/settings:flex-col @max-4xl/settings:gap-4">
        <nav
          className="sticky top-0 flex w-56 shrink-0 flex-col gap-0.5 @max-4xl/settings:relative @max-4xl/settings:w-full @max-4xl/settings:flex-row @max-4xl/settings:overflow-x-auto @max-4xl/settings:rounded-xl @max-4xl/settings:bg-card/50 @max-4xl/settings:p-1"
          role="tablist"
          aria-label="Settings categories"
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
                  <span className="block truncate text-sm font-medium">{tab.label}</span>
                  <span className="block truncate text-xs text-muted-foreground @max-4xl/settings:hidden">
                    {tab.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 w-full min-w-0 max-w-2xl flex-1 flex-col @max-4xl/settings:max-w-none">
          {settingsQuery.trim() ? (
            <SettingsSearchResults
              query={settingsQuery}
              onSelect={(tab) => {
                setActiveTab(tab);
                setSettingsQuery("");
              }}
            />
          ) : (
            <>
      {activeTab === "about" && (
        <div className="flex flex-col gap-5" role="tabpanel" aria-label="About settings">
          <section className={SETTINGS_CARD} aria-labelledby="account-settings-title">
            <SettingsCardHeader
              title="Account"
              titleId="account-settings-title"
              icon={<UserIcon size={18} aria-hidden="true" />}
              description={isSignedIn ? "Signed in to YouTube Music" : "No account connected"}
              status={
                <span className={isSignedIn ? "text-primary" : "text-muted-foreground"}>
                  {isSignedIn ? "Connected" : "Signed out"}
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
                  {isSignedIn ? account?.name || "YouTube Music" : "Not signed in"}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {isSignedIn
                    ? `Session confirmed ${formatSessionAge(libraryState.sessionConfirmedAt)}.`
                    : "Sign in to load your library."}
                </span>
              </div>

              {isSignedIn ? (
                <button
                  className={CARD_BUTTON}
                  type="button"
                  onClick={() => void libraryController.signOut()}
                >
                  <LogoutIcon size={18} aria-hidden="true" />
                  Sign out
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
                  label="Accounts"
                />
                <AddGoogleAccountButton disabled={authBusy} onClick={() => void onSignIn()} />
              </div>
            )}

            {/* Renders nothing unless the account actually has more than one channel. */}
            {isSignedIn && (
              <div className="flex flex-col gap-1.5 empty:hidden">
                <AccountSwitcher libraryController={libraryController} showSingle label="Channel" />
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
                  ? `Connected as ${lastFmSession.username}`
                  : "Connect Last.fm to scrobble your listening history."
              }
              status={
                <span className={lastFmSession ? "text-primary" : "text-muted-foreground"}>
                  {lastFmSession ? "Connected" : "Signed out"}
                </span>
              }
            />

            <div className="flex flex-col gap-5">
              <SettingToggle
                title="Scrobble plays"
                description="Send now playing updates and scrobbles after a track reaches the Last.fm listening threshold."
                checked={lastFmSession ? lastFmScrobblingEnabled : false}
                disabled={!lastFmSession}
                onCheckedChange={setLastFmScrobblingEnabled}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                  <strong>Account connection</strong>
                  <span>
                    {lastFmAuth
                      ? "Approve the connection in your browser, then finish it here."
                      : lastFmSession
                        ? "Disconnecting stops future Last.fm updates from this app."
                        : "A browser window will open so you can approve this app on Last.fm."}
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
                    {lastFmBusy ? "Disconnecting..." : "Disconnect"}
                  </button>
                ) : lastFmAuth ? (
                  <button
                    className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    type="button"
                    disabled={lastFmBusy}
                    onClick={() => void handleFinishLastFmAuth()}
                  >
                    <LastFmIcon size={18} />
                    {lastFmBusy ? "Finishing..." : "Finish connection"}
                  </button>
                ) : (
                  <button
                    className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    type="button"
                    disabled={lastFmBusy}
                    onClick={() => void handleStartLastFmAuth()}
                  >
                    <LastFmIcon size={18} />
                    {lastFmBusy ? "Opening..." : "Connect Last.fm"}
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
                title="Show what you're playing"
                description="Publishes the current track, artist and artwork to your Discord profile. Turning this off clears whatever is showing there now."
                checked={discordPresenceEnabled}
                onCheckedChange={(enabled) => void DiscordRpcService.setEnabled(enabled)}
              />
              <SettingToggle
                title="Hide status when paused"
                description="Clear your Discord Rich Presence while playback is paused. It returns when playback resumes."
                checked={discordHideWhenPaused}
                disabled={!discordPresenceEnabled}
                onCheckedChange={(hidden) => void DiscordRpcService.setHideWhenPaused(hidden)}
              />
            </div>
          </section>
          )}

          <section className={SETTINGS_CARD} aria-labelledby="about-settings-title">
            <SettingsCardHeader
              title="About Zuno"
              titleId="about-settings-title"
              icon={<img src={appLogo} alt="" className="size-6 rounded-md" />}
              description="Version, updates and help."
              status={
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                  {installedVersion
                    ? installedVersion === "Unknown" ? installedVersion : `v${installedVersion}`
                    : "…"}
                </span>
              }
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                <strong>Updates</strong>
                <span>
                  {updateStatus === "current"
                    ? "You're on the latest version."
                    : "See whether a newer version is out."}
                </span>
              </span>
              <button
                className={CARD_BUTTON}
                type="button"
                disabled={updateStatus === "checking"}
                onClick={() => void handleCheckForUpdates()}
              >
                <RefreshIcon size={18} aria-hidden="true" />
                {updateStatus === "checking" ? "Checking…" : "Check for updates"}
              </button>
            </div>

            {/* One inset box for the result, so the message and its actions read as a unit. */}
            {updateResult && (
              <div className="flex flex-col gap-3 rounded-row bg-background/50 p-3 text-sm">
                <span className="font-medium text-foreground">
                  {updateStatus === "installing"
                    ? updateProgress?.percent !== undefined
                      ? `Downloading version ${updateResult.version}: ${updateProgress.percent}%`
                      : `Preparing version ${updateResult.version}…`
                    : `Version ${updateResult.version} is available.`}
                </span>
                <div className="flex flex-wrap gap-2">
                  {updateResult.canInstall && (
                    <button
                      className={CARD_BUTTON_PRIMARY}
                      type="button"
                      disabled={updateStatus === "installing"}
                      onClick={() => void handleInstallUpdate()}
                    >
                      {updateStatus === "installing" ? "Installing…" : "Install update"}
                    </button>
                  )}
                  {/* The one link where a silent failure strands the user: if this cannot
                      open, they have no other route to the download. */}
                  <ExternalLinkButton
                    label={updateResult.canInstall ? "View changes" : "Download"}
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
                  <strong>Help and feedback</strong>
                  <span>Found a bug or have an idea? Tell us on GitHub.</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  <ExternalLinkButton
                    icon={<BugIcon size={16} aria-hidden="true" />}
                    label="Report an issue"
                    url={GITHUB_NEW_ISSUE_URL}
                  />
                  <ExternalLinkButton
                    icon={<StarIcon size={16} aria-hidden="true" />}
                    label="Star on GitHub"
                    url={GITHUB_REPOSITORY_URL}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                  <strong>Quick start</strong>
                  <span>Replay the guided introduction.</span>
                </span>
                <button className={CARD_BUTTON} type="button" onClick={onRestartOnboarding}>
                  <RefreshIcon size={18} aria-hidden="true" />
                  Start onboarding
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "system" && (
        <div className="flex flex-col gap-5" role="tabpanel" aria-label="Library settings">
          {/* Desktop only: not meaningful on mobile. */}
          {!isMobile && (
          <section className={SETTINGS_CARD} aria-labelledby="library-local-title">
            <SettingsCardHeader
              title="Local music"
              titleId="library-local-title"
              icon={<FolderIcon size={18} aria-hidden="true" />}
              description="Folders on this computer, scanned into playlists."
            />

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                  <strong>Local playlists</strong>
                  <span>Create playlists from folders on this computer.</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={cn(SETTINGS_FIELD, "w-44")}
                    type="text"
                    value={localPlaylistName}
                    placeholder="Playlist name"
                    aria-label="Local playlist name"
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
                    Create
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
                          Delete
                        </button>
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="flex items-center gap-2">
                          <input
                            className={cn(SETTINGS_FIELD, "flex-1")}
                            type="text"
                            value={localPlaylistPathInputs[playlist.id] ?? ""}
                            placeholder="/Users/name/Music"
                            aria-label={`Folder path for ${playlist.name}`}
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
                            title="Browse for folder"
                            aria-label={`Browse for a folder for ${playlist.name}`}
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
                          Add
                        </button>
                      </div>

                      {playlist.paths.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {playlist.paths.map((path) => (
                            <div className="flex items-center justify-between gap-3 rounded-lg bg-background/40 px-3 py-2 text-sm" key={path}>
                              <span>{path}</span>
                              <button
                                type="button"
                                aria-label={`Remove ${path}`}
                                onClick={() => removeLocalPlaylistPath(playlist.id, path)}
                              >
                                <TrashIcon size={16} aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="px-1 py-3 text-sm text-muted-foreground">No paths added yet.</p>
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
              title="Storage"
              titleId="library-storage-title"
              icon={<DownloadIcon size={18} aria-hidden="true" />}
              description="How much disk Zuno is allowed to use."
            />

            {/* Each block: what it is, how full (figures + bar), then its actions on their own row. */}
            <div className="flex flex-col gap-3 rounded-row bg-background/40 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <strong className="text-sm font-medium text-foreground">Cache</strong>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {cacheStats
                    ? `${formatBytes(cacheStats.usedBytes)} of ${formatBytes(cacheStats.maxBytes)} · ${cacheStats.entryCount} items`
                    : "Loading…"}
                </span>
              </div>
              <UsageMeter
                used={cacheStats?.usedBytes ?? 0}
                total={cacheStats?.maxBytes ?? 0}
                label="Cache used"
              />
              <p className="text-xs text-muted-foreground">
                Pages and covers Zuno keeps so the library opens instantly. Safe to clear.
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
                  <SelectTrigger aria-label="Maximum cache size">
                    <SelectValue placeholder={`${cacheSizeGb} GB`} />
                  </SelectTrigger>
                  <SelectContent>
                    {CACHE_SIZE_PRESETS_GB.map((gb) => (
                      <SelectItem key={gb} value={gb}>
                        Up to {formatGb(Number(gb))}
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
                  Clear cache
                </button>
              </div>
            </div>

            {cacheError && <p className="text-sm text-destructive">{cacheError}</p>}

            <div className="flex flex-col gap-3 rounded-row bg-background/40 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <strong className="text-sm font-medium text-foreground">Downloads</strong>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Object.keys(offlineState.entries).length > 0
                    ? `${Object.keys(offlineState.entries).length} songs · ${formatBytes(offlineState.usedBytes)} of ${formatGb(Math.round(offlineMaxGb))}`
                    : "No songs downloaded yet"}
                </span>
              </div>
              <UsageMeter
                used={offlineState.usedBytes}
                total={Math.max(1, offlineMaxGb) * 1024 ** 3}
                label="Download space used"
              />
              {(offlineState.downloadingId || offlineState.queued.length > 0) && (
                <p className="text-xs text-muted-foreground">
                  {offlineState.downloadingId
                    ? offlineState.progress !== null
                      ? `Downloading ${offlineState.progress}%`
                      : "Downloading"
                    : ""}
                  {offlineState.queued.length > 0 ? ` · ${offlineState.queued.length} queued` : ""}
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
                  <SelectTrigger aria-label="Maximum download size">
                    <SelectValue placeholder={formatGb(Math.round(offlineMaxGb))} />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...DOWNLOAD_SIZE_PRESETS_GB, Math.round(offlineMaxGb)])]
                      .sort((a, b) => a - b)
                      .map((gb) => (
                        <SelectItem key={gb} value={String(gb)}>
                          Up to {formatGb(gb)}
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
                  {clearingDownloads ? "Removing…" : "Remove all"}
                </button>
              </div>
            </div>

          </section>

          <section className={SETTINGS_CARD} aria-labelledby="library-quality-title">
            <SettingsCardHeader
              title="Quality"
              titleId="library-quality-title"
              icon={<PlayIcon size={18} aria-hidden="true" />}
              description="Bitrate picked when a track is streamed or saved."
            />

            <SettingRow
              title="Streaming quality"
              description="Applies to songs played over the network. Lower uses less data."
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
                        {AUDIO_QUALITY_LABELS[quality]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SettingRow>


            <SettingRow
              title="Download quality"
              description="Applies to songs saved for offline. Higher sounds better and uses more disk."
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
                        {AUDIO_QUALITY_LABELS[quality]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SettingRow>

          </section>

          <section className={SETTINGS_CARD} aria-labelledby="library-lyrics-title">
            <SettingsCardHeader
              title="Lyrics"
              titleId="library-lyrics-title"
              icon={<LyricsIcon size={18} aria-hidden="true" />}
              description="Where lyrics come from and how they read."
            />

            <SettingRow
              title="Translate lyrics"
              description="Shows a translation under each line. Sends the lyrics to Google Translate."
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
                    <SelectItem value={TRANSLATION_OFF}>Off</SelectItem>
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
              title="Lyrics text size"
              description="Scales the lyrics screen. The size still adapts to the window on top of this."
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
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SettingRow>


            <SettingRow
              title="Preferred lyrics source"
              description="Tried first when a song opens. If it has nothing for that song, the others still run."
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
                    <SelectItem value={AUTO_LYRICS_SOURCE}>Automatic</SelectItem>
                    {LYRICS_SOURCES.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.label}
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
              title="System"
              titleId="library-system-title"
              icon={<SettingsIcon size={18} aria-hidden="true" />}
              description="How Zuno behaves outside the window."
            />

            <SettingToggle
              title="Launch at startup"
              description="Start Zuno when your computer starts."
              checked={autostartEnabled}
              disabled={autostartLoading}
              onCheckedChange={(checked) => void handleAutostartChange(checked)}
            />

            {autostartError && <p className="text-sm text-destructive">{autostartError}</p>}

            <SettingToggle
              title="Remember window size and location"
              description="Reopen the main window with its last size and screen position."
              checked={mainWindowGeometryPersistenceEnabled}
              onCheckedChange={setMainWindowGeometryPersistenceEnabled}
            />


          </section>
          )}

          <section className={SETTINGS_CARD} aria-labelledby="library-trouble-title">
            <SettingsCardHeader
              title="Troubleshooting"
              titleId="library-trouble-title"
              icon={<BugIcon size={18} aria-hidden="true" />}
              description="Diagnostics, and the irreversible reset."
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                <strong>Application log</strong>
                <span>Open the current log file for sharing or troubleshooting.</span>
              </span>
              <button
                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                type="button"
                disabled={logOpening}
                onClick={() => void handleOpenLog()}
              >
                <LogFileIcon size={18} />
                {logOpening ? "Opening..." : "Open log"}
              </button>
            </div>

            {logError && <p className="text-sm text-destructive">{logError}</p>}


            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                <strong>Delete all app data</strong>
                <span>Reset settings, cache, account, queue, tabs, onboarding, and local data.</span>
              </span>
              <button
                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                type="button"
                disabled={resetSettingsBusy}
                onClick={() => void handleClearAllSettings()}
              >
                <TrashIcon size={18} />
                {resetSettingsBusy
                  ? "Deleting..."
                  : resetSettingsConfirming
                    ? "Press again to confirm"
                    : "Delete everything"}
              </button>
            </div>

            {resetSettingsError && <p className="text-sm text-destructive">{resetSettingsError}</p>}
          </section>
        </div>
      )}

      {activeTab === "shortcuts" && (
        <div className="flex flex-col gap-5" role="tabpanel" aria-label="Keyboard shortcut settings">
          <section className={SETTINGS_CARD} aria-labelledby="keyboard-shortcuts-settings-title">
            <h2
              className="text-lg font-semibold text-foreground"
              id="keyboard-shortcuts-settings-title"
            >
              Keyboard shortcuts
            </h2>

            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={cn(SETTING_LABEL, "min-w-0 flex-1")}>
                  <strong>Reset shortcuts</strong>
                  <span>Restore every keyboard shortcut to its default.</span>
                </span>
                <button
                  className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  type="button"
                  onClick={resetKeyboardShortcuts}
                >
                  <RefreshIcon size={18} />
                  Reset all
                </button>
              </div>

              {KEYBOARD_SHORTCUT_ACTIONS.map((shortcutAction) => {
                const shortcut = keyboardShortcuts[shortcutAction.id];
                const isListening = listeningShortcut === shortcutAction.id;

                return (
                  <div className="flex items-center justify-between gap-4 py-2" key={shortcutAction.id}>
                    <span className={SETTING_LABEL}>
                      <strong>{shortcutAction.label}</strong>
                      <span>{shortcutAction.description}</span>
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
                        {isListening ? "Press shortcut..." : formatKeyboardShortcut(shortcut)}
                      </button>
                      <button
                        className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        type="button"
                        onClick={() => resetKeyboardShortcut(shortcutAction.id)}
                      >
                        Reset
                      </button>
                      <button
                        className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        type="button"
                        disabled={!shortcut}
                        onClick={() => setKeyboardShortcut(shortcutAction.id, null)}
                      >
                        Clear
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
        <div className="flex flex-col gap-5" role="tabpanel" aria-label="Style settings">
          <section className={SETTINGS_CARD} aria-labelledby="window-settings-title">
            <SettingsCardHeader
              title="Window controls"
              titleId="window-settings-title"
              icon={<QueuePanelIcon size={18} aria-hidden="true" />}
              description="Choose the title bar buttons and compact player behavior."
            />

            <SettingToggle
              title="Mini player"
              description="Show compact playback controls when the main window is not focused. Turning this off closes its window and frees around 30 MB."
              checked={miniPlayerEnabled}
              onCheckedChange={setMiniPlayerEnabled}
            />

            <div className="flex flex-col gap-3">
              <span id="mini-player-skin-label" className={SETTING_LABEL}>
                <strong>Mini player skin</strong>
                <span>How the mini player looks. It opens in the new skin the next time it appears.</span>
              </span>
              <MiniPlayerSkinPicker labelledBy="mini-player-skin-label" />
            </div>

            <SettingRow
              title="Library sidebar"
              description="How much room the playlist rail takes. Expand on hover keeps the collapsed width while still letting you read the list."
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
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SettingRow>

            {miniPlayerSkin === "classic" && (
              <SettingRow
                title="Mini player hover bar"
                description="Choose what the expanded hover slider controls."
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
                      <SelectItem value="seek">Song position</SelectItem>
                      <SelectItem value="volume">Volume</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </SettingRow>
            )}

            <div className="flex items-center justify-between gap-4 py-2">
              <span className={SETTING_LABEL}>
                <strong>Mini player position</strong>
                <span>Move the mini player back to the bottom center of this screen.</span>
              </span>
              <button
                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                type="button"
                disabled={miniPlayerResetting}
                onClick={() => void handleResetMiniPlayerPosition()}
              >
                {miniPlayerResetting ? "Resetting..." : "Reset position"}
              </button>
            </div>

            <SettingRow
              title="Window controls"
              description={isLinux
                ? "How minimize, maximize and close are drawn. Switching OS native restarts the app."
                : "How minimize, maximize and close are drawn."}
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
                      <TabsTrigger value="native">OS native</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}
            </SettingRow>

            {/* Next to the window buttons, because it decides what the close button does. */}
            <SettingToggle
              title="Minimize to tray"
              description="Closing the window hides Zuno to the system tray and keeps playing. When off, no tray icon is shown."
              checked={minimizeToTray}
              onCheckedChange={setMinimizeToTray}
            />

            {/* Only reachable when it does something: hidden once native chrome takes over,
                and off tiling compositors the buttons already show without this. */}
            {isLinux && tilingWindowManager && windowControlStyle !== "native" && (
              <SettingToggle
                title="Show on this compositor"
                description="Tiling compositors don't draw window buttons for apps, so they're hidden by default. Turn this on to show them anyway."
                checked={forceWindowControls}
                onCheckedChange={setForceWindowControls}
              />
            )}

            {/* The OS frame replaces the outline, so the switch would do nothing there. */}
            {windowControlStyle !== "native" && (
              <SettingToggle
                title="Window outline"
                description="Draw a thin edge around the window so it stands apart from what's behind it."
                checked={windowOutline}
                onCheckedChange={setWindowOutline}
              />
            )}

            {isLinux && (
              <SettingToggle
                title="Show in system media controls"
                description="Expose playback to the desktop's media widget and media keys (MPRIS). Turning this off stops the now-playing notifications some desktops show."
                checked={linuxMediaSession}
                onCheckedChange={setLinuxMediaSession}
              />
            )}
          </section>

          <section className={SETTINGS_CARD} aria-labelledby="behavior-settings-title">
            <div className="flex items-center gap-2">
              <h2 className="text-lg" id="behavior-settings-title">Behavior</h2>
            </div>

            <SettingToggle
              title="Compact player bar"
              description="Tuck the seek bar under the transport controls instead of spanning the full width."
              checked={compactPlayerBar}
              onCheckedChange={setCompactPlayerBar}
            />

            <SettingToggle
              title="Always show extra controls"
              description="Keep lyrics and queue visible instead of showing them only on hover."
              checked={extraPlayerControlsAlwaysVisible}
              onCheckedChange={setExtraPlayerControlsAlwaysVisible}
            />
          </section>
        </div>
      )}

      {activeTab === "playback" && (
        <div className="flex flex-col gap-5" role="tabpanel" aria-label="Playback settings">
          <section className={SETTINGS_CARD} aria-labelledby="playback-engine-title">
            <SettingsCardHeader
              title="Audio engine"
              titleId="playback-engine-title"
              icon={<PlayIcon size={18} aria-hidden="true" />}
              description="What actually plays the sound."
            />

            {/* One card per engine with its own description, instead of a dropdown beside a
                description that only knew two of the three engines (Rust showed the YouTube
                player's text). Cards stack and wrap at any width. */}
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Playback method">
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
                        {option.label}
                        {option.value === "rust" ? (
                          <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                            Recommended
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm text-muted-foreground">{option.hint}</span>
                      {selected ? (
                        <span className="text-xs text-muted-foreground">Applies from the next track.</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <OutputDeviceSetting engineMode={audioEngineMode} />

            <SettingToggle
              title="Resolve streams as your account"
              description="Attaches your session when resolving a track — required for Premium bitrates. Downloads always resolve anonymously."
              checked={authenticatedStreaming}
              onCheckedChange={setAuthenticatedStreaming}
            />

            <SettingToggle
              title="Add plays to YouTube Music history"
              description="Reports plays to YouTube, feeding its recommendations. Also enables the setting above. The YouTube frame always reports its own."
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

          <EqualizerSettings engineMode={audioEngineMode} />

          <section className={SETTINGS_CARD} aria-labelledby="playback-settings-title">
            <SettingsCardHeader
              title="Transitions"
              titleId="playback-settings-title"
              icon={<PlayIcon size={18} aria-hidden="true" />}
              description="How one track becomes the next."
            />

            <SettingToggle
              title="Normalize volume"
              description={
                audioEngineMode === "rust"
                  ? "Turns loud tracks down to YouTube's reference level, so a playlist plays at one volume."
                  : "Needs the Rust audio engine. The YouTube player already levels volume on its own."
              }
              checked={volumeNormalization}
              onCheckedChange={setVolumeNormalization}
              disabled={audioEngineMode !== "rust"}
            />

            <SettingToggle
              title="Gapless playback"
              description="Load the next track while the current one is still playing, so albums and live sets run without a pause between songs."
              checked={gaplessEnabled}
              onCheckedChange={setGaplessEnabled}
            />

            <SettingRow
              title="Crossfade"
              description={
                crossfadeSec > 0
                  ? `Overlap each track with the next by ${crossfadeSec} second${
                    crossfadeSec === 1 ? "" : "s"
                  }.`
                  : "Off. Move the slider to overlap the end of each track with the start of the next."
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
                    aria-label="Crossfade length in seconds"
                  />
                  <span
                    id={labelId}
                    className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground"
                  >
                    {crossfadeSec > 0 ? `${crossfadeSec}s` : "Off"}
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
              Both apply to streamed tracks. Downloaded and local files always play back to back.
            </p>
          </section>

          <section className={SETTINGS_CARD} aria-labelledby="session-settings-title">
            <SettingsCardHeader
              title="Session"
              titleId="session-settings-title"
              icon={<QueuePanelIcon size={18} aria-hidden="true" />}
              description="What comes back when you reopen Zuno."
            />

            <SettingToggle
              title="Restore tabs and queues"
              description="Reopen your tabs, queues and playback position on launch. Playback always starts paused."
              checked={sessionRestoreEnabled}
              onCheckedChange={setSessionRestoreEnabled}
            />
          </section>
        </div>
      )}

      {activeTab === "appearance" && (
        <div className="flex flex-col gap-5" role="tabpanel" aria-label="Appearance settings">
          <section className={SETTINGS_CARD} aria-labelledby="theme-settings-title">
            <SettingsCardHeader
              title="Look & feel"
              titleId="theme-settings-title"
              icon={<PaletteIcon size={18} aria-hidden="true" />}
              description="Theme, colour and style. Changes apply instantly."
            />

            <h3 className="-mb-2 text-sm font-medium text-foreground">Theme</h3>

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
                    <span className="text-sm font-medium text-foreground">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.hint}</span>
                  </button>
                );
              })}
            </div>

            <AppearancePicker />

            {/* Desktop only: not meaningful on mobile. */}
            {!isMobile && (
            <SettingRow
              title="App size"
              description={`Zooms the whole app. ${isMacOS ? "⌘" : "Ctrl"} with + or − works too, and 0 resets it.`}
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
              title="Title bar"
              titleId="toolbar-settings-title"
              icon={<QueuePanelIcon size={18} aria-hidden="true" />}
              description="Which optional buttons sit next to the window controls."
            />

            {TOOLBAR_ITEMS.map((item) => (
              <ToolbarItemToggle key={item.id} item={item} />
            ))}
          </section>
          )}

          <section className={SETTINGS_CARD} aria-labelledby="home-settings-title">
            <SettingsCardHeader
              title="Home"
              titleId="home-settings-title"
              icon={<HomeIcon size={18} aria-hidden="true" />}
              description="Which sections the home page shows."
            />

            <SettingToggle
              title="Made for you"
              description="The recommendation carousel at the top. Hiding it leaves the surprise button and More recommendations working."
              checked={madeForYouVisible}
              onCheckedChange={setMadeForYouVisible}
            />
          </section>

          <section className={SETTINGS_CARD} aria-labelledby="motion-settings-title">
            <SettingsCardHeader
              title="Motion & performance"
              titleId="motion-settings-title"
              icon={<SettingsIcon size={18} aria-hidden="true" />}
              description="Turn these off on low-powered devices."
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
