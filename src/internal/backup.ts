import { relaunch } from "@tauri-apps/plugin-process";
import { setAppSetting } from "./appSettings";
import { buildBackup, parseBackup, type BackupFile } from "./backupFormat";
import { exportJsonFile, importJsonFile } from "./fileTransfer";
import { t } from "../i18n";
import { getOfflineState, REDOWNLOAD_KEY } from "../player/offlineStore";
import { readListenLogText, replaceListenLog } from "../player/listenLog";

/**
 * Everything worth keeping on one file: settings, sound profiles, local playlists, history,
 * stats and the list of downloads (re-fetched after a restore). See `BACKUP_KEYS` for exactly
 * what is in it — never sign-in data.
 */
export async function exportBackup(): Promise<string | null> {
  const downloads = Object.values(getOfflineState().entries).map((entry) => ({ ...entry.track }));
  const backup = buildBackup(
    (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    downloads,
    await readListenLogText().catch(() => ""),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return exportJsonFile(t("Back up Zuno"), `zuno-backup-${stamp}.json`, t("Zuno backup"), backup);
}

export async function pickBackup(): Promise<BackupFile | null> {
  return importJsonFile(t("Restore Zuno"), t("Zuno backup"), parseBackup, t("That file is not a Zuno backup."));
}

/** Writes a backup over the current settings, then restarts so every store starts from it. */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const writes: Promise<unknown>[] = [];
  for (const [key, raw] of Object.entries(backup.settings)) {
    try {
      localStorage.setItem(key, raw);
    } catch {
      // The durable copy below is what hydration prefers anyway.
    }
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      // Stored as a plain string.
    }
    writes.push(setAppSetting(key, value));
  }
  if (backup.downloads.length > 0) {
    // Picked up by `hydrateOfflineStore` after the restart, which queues whatever is missing.
    const list = JSON.stringify(backup.downloads);
    try {
      localStorage.setItem(REDOWNLOAD_KEY, list);
    } catch {
      // Durable copy below.
    }
    writes.push(setAppSetting(REDOWNLOAD_KEY, backup.downloads));
  }
  if (backup.listenLog) writes.push(replaceListenLog(backup.listenLog));
  await Promise.allSettled(writes);
  try {
    await relaunch();
  } catch {
    // Some platforms cannot restart themselves; the caller tells the user to reopen Zuno.
    throw new Error(t("Restored. Close and reopen Zuno to finish."));
  }
}
