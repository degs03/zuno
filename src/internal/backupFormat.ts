// The backup file: which settings travel, and validation. Pure, so it can be checked.

export const BACKUP_FORMAT = "zuno-backup";
export const BACKUP_VERSION = 1;

/**
 * Exactly what a backup carries. A whitelist, not "everything but secrets": anything new has to
 * be added on purpose, so a future key holding an account id or a token can never leak into a
 * file the user shares. Sign-in cookies live in the OS keyring and are never in local storage.
 *
 * Left out on purpose: the signed-in account and library caches (they belong to the account,
 * not the device), window geometry (it belongs to the screen), the app session/queue, and
 * one-off flags like onboarding.
 */
export const BACKUP_KEYS = [
  // Appearance
  "theme", "app-language-v1", "appearance-accent", "appearance-accent-custom", "appearance-style", "ui-zoom",
  "paper-pc-mode", "render-effects-off", "sidebar-mode", "compact-player-bar",
  "extra-player-controls-always-visible", "home-made-for-you-visible", "window-outline-visible",
  // Sound
  "equalizer-v1", "equalizer-enabled-v1", "equalizer-presets-v1", "equalizer-custom-v1",
  "audio-effects-v1", "audio-profiles-v1", "audio-profile-devices-v1", "playback-settings",
  "volume-normalization-enabled", "audio-engine-mode", "audio-quality-streaming",
  "audio-quality-download", "headset-settings-v1", "bit-perfect-output", "car-devices-v1",
  "personal-eq-learn-v1", "personal-eq-spectra-v1", "personal-eq-enabled",
  // Lyrics
  "lyrics-font-scale", "lyrics-offset", "lyrics-source-preference", "lyrics-translation-lang",
  // Behaviour
  "keyboard-shortcuts", "session-restore-enabled", "mini-player-enabled", "mini-player-skin",
  "mini-player-hover-action", "minimize-to-tray", "discord-presence-enabled",
  "discord-hide-when-paused", "lastfm-scrobbling-enabled", "youtube-scrobbling",
  "youtube-authenticated-streaming", "offline-mode-v1",
  // Your stuff
  "ytc-local-playlists-v1", "ytc-local-playlist-tracks-v1", "ytc-local-playlist-track-order-v1",
  "zuno.play-history.v1", "zuno:disliked-tracks-v1", "zuno.offline-pins.v1",
  "zuno.offline-max-bytes.v1",
] as const;

export interface DownloadedTrackRef {
  id: string;
  title: string;
  artist: string;
  [extra: string]: unknown;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  /** Raw local-storage strings, keyed by setting. */
  settings: Record<string, string>;
  /** What was downloaded; the audio is fetched again after a restore. */
  downloads: DownloadedTrackRef[];
  /** `listen-log-v1.jsonl` as text. */
  listenLog: string;
}

const ALLOWED = new Set<string>(BACKUP_KEYS);

export function buildBackup(
  readSetting: (key: string) => string | null,
  downloads: DownloadedTrackRef[],
  listenLog: string,
): BackupFile {
  const settings: Record<string, string> = {};
  for (const key of BACKUP_KEYS) {
    const value = readSetting(key);
    if (value !== null) settings[key] = value;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    settings,
    downloads,
    listenLog,
  };
}

/**
 * Validates a backup file. Unknown setting keys are dropped (a hand-edited or newer file cannot
 * plant arbitrary keys), as are malformed downloads. Null when it is not a Zuno backup.
 */
export function parseBackup(value: unknown): BackupFile | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<BackupFile>;
  if (candidate.format !== BACKUP_FORMAT) return null;
  const settings: Record<string, string> = {};
  if (candidate.settings && typeof candidate.settings === "object") {
    for (const [key, raw] of Object.entries(candidate.settings)) {
      if (ALLOWED.has(key) && typeof raw === "string" && raw.length < 8 * 1024 * 1024) settings[key] = raw;
    }
  }
  const downloads = (Array.isArray(candidate.downloads) ? candidate.downloads : []).filter(
    (track): track is DownloadedTrackRef =>
      typeof track === "object" && track !== null
      && typeof (track as DownloadedTrackRef).id === "string"
      && typeof (track as DownloadedTrackRef).title === "string",
  );
  return {
    format: BACKUP_FORMAT,
    version: typeof candidate.version === "number" ? candidate.version : BACKUP_VERSION,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
    settings,
    downloads,
    listenLog: typeof candidate.listenLog === "string" ? candidate.listenLog : "",
  };
}
