import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { logInternalError } from "./logging";
import { getInvokeErrorMessage } from "./appSettings";
import { t } from "../i18n";
import { isNewerVersion as isNewer, parseAndroidManifest, pickApk, type AndroidApk } from "./androidUpdate";
import {
  ANDROID_MANIFEST_URL,
  RELEASES_API_URL,
  RELEASES_PAGE_URL,
  UPDATE_REPO_CONFIGURED,
} from "./updateConfig";

const RELEASE_TAG_PREFIX = "v";
const RELEASES_URL = `${RELEASES_PAGE_URL}/tag`;
const SNOOZE_PREFIX = "just-another-music-client:update-snooze:";
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;

export interface UpdateInfo {
  installedVersion: string;
  version: string;
  releaseUrl: string;
  canInstall: boolean;
  update?: Update;
  /** Android: the APK for this device and its checksum, from `android-latest.json`. */
  androidApk?: AndroidApk;
  notes?: string;
}

export interface UpdateInstallProgress {
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
}

export async function getInstalledVersion(): Promise<string> {
  return getVersion();
}

function parseVersion(version: string): number[] {
  return version.replace(/^v/, "").split(".").map(Number);
}

function isNewerVersion(installed: string, candidate: string): boolean {
  const installedParts = parseVersion(installed);
  const candidateParts = parseVersion(candidate);
  for (let i = 0; i < Math.max(installedParts.length, candidateParts.length); i++) {
    const a = installedParts[i] ?? 0;
    const b = candidateParts[i] ?? 0;
    if (b > a) return true;
    if (b < a) return false;
  }
  return false;
}

async function checkViaGithubApi(): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(RELEASES_API_URL);
    if (!response.ok) return null;
    const data = await response.json() as { tag_name?: string };
    const tagName = data.tag_name ?? "";
    const latestVersion = tagName.replace(RELEASE_TAG_PREFIX, "");
    const installedVersion = await getVersion();

    if (!UPDATE_REPO_CONFIGURED || !latestVersion || !isNewerVersion(installedVersion, latestVersion)) {
      return null;
    }

    return {
      installedVersion,
      version: latestVersion,
      releaseUrl: `${RELEASES_URL}/${encodeURIComponent(tagName || latestVersion)}`,
      canInstall: false,
    };
  } catch {
    return null;
  }
}

const isAndroidRuntime = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

/** Android: `android-latest.json` from the latest release, fetched by Rust (GitHub sends no CORS). */
async function checkAndroid(): Promise<UpdateInfo | null> {
  if (!UPDATE_REPO_CONFIGURED) return null;
  const text = await invoke<string | null>("update_fetch_manifest", { url: ANDROID_MANIFEST_URL });
  if (!text) return null;
  const manifest = parseAndroidManifest(text);
  if (!manifest) throw new Error("the release has an invalid android-latest.json");
  const installedVersion = await getVersion();
  if (!isNewer(installedVersion, manifest.version)) return null;
  const apk = pickApk(manifest, await invoke<string>("update_abi"));
  return {
    installedVersion,
    version: manifest.version,
    releaseUrl: `${RELEASES_URL}/${RELEASE_TAG_PREFIX}${encodeURIComponent(manifest.version)}`,
    canInstall: apk !== null,
    androidApk: apk ?? undefined,
    notes: manifest.notes,
  };
}

async function installAndroid(
  info: UpdateInfo,
  onProgress?: (progress: UpdateInstallProgress) => void,
): Promise<void> {
  const apk = info.androidApk;
  if (!apk) throw new Error(t("There is no download for this phone in that release."));
  const stop = await listen<{ downloaded: number; total?: number }>("update-download-progress", ({ payload }) => {
    onProgress?.({
      downloadedBytes: payload.downloaded,
      totalBytes: payload.total,
      percent: payload.total ? Math.min(100, Math.round((payload.downloaded / payload.total) * 100)) : undefined,
    });
  });
  try {
    let path: string;
    try {
      path = await invoke<string>("update_download_apk", { url: apk.url, sha256: apk.sha256 });
    } catch (error) {
      throw new Error(getInvokeErrorMessage(error));
    }
    try {
      await invoke("android_install_apk", { path });
    } catch (error) {
      const message = getInvokeErrorMessage(error);
      if (message.includes("permission")) {
        throw new Error("Allow Zuno to install apps in the screen that just opened, then tap Install again.");
      }
      throw new Error(message);
    }
  } finally {
    stop();
  }
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  if (isAndroidRuntime()) {
    try {
      return await checkAndroid();
    } catch (error) {
      logInternalError("updateChecker.checkAndroid failed", error);
      throw error;
    }
  }
  const isMacOS =
    typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);

  if (isMacOS) {
    return checkViaGithubApi();
  }

  let update: Update | null;
  try {
    update = await check();
  } catch (error) {
    logInternalError("updateChecker.checkForUpdates failed", error);
    throw error;
  }

  if (!update) return null;

  return {
    installedVersion: update.currentVersion,
    version: update.version,
    releaseUrl: `${RELEASES_URL}/${RELEASE_TAG_PREFIX}${encodeURIComponent(update.version)}`,
    canInstall: true,
    update,
  };
}

export async function installUpdate(
  info: UpdateInfo,
  onProgress?: (progress: UpdateInstallProgress) => void,
): Promise<void> {
  if (info.androidApk) return installAndroid(info, onProgress);
  if (!info.update) {
    throw new Error(
      t("This update cannot be installed automatically. Please download it from the release page."),
    );
  }

  let downloadedBytes = 0;
  let totalBytes: number | undefined;

  const reportProgress = (event: DownloadEvent) => {
    if (event.event === "Started") {
      downloadedBytes = 0;
      totalBytes = event.data.contentLength;
    } else if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
    } else if (event.event === "Finished" && totalBytes !== undefined) {
      downloadedBytes = totalBytes;
    }

    onProgress?.({
      downloadedBytes,
      totalBytes,
      percent: totalBytes && totalBytes > 0
        ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
        : undefined,
    });
  };

  try {
    await info.update.downloadAndInstall(reportProgress);
    await relaunch();
  } catch (error) {
    logInternalError("updateChecker.installUpdate failed", error, {
      version: info.version,
    });
    throw error;
  }
}

export function getUpdateFailureMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.trim();

  if (!message) {
    return t("Unable to check for updates. The updater did not return an error message.");
  }

  return t("Unable to check for updates: {message}", { message });
}

export function isUpdateSnoozed(version: string): boolean {
  const snoozedUntil = Number(localStorage.getItem(`${SNOOZE_PREFIX}${version}`));
  return Number.isFinite(snoozedUntil) && snoozedUntil > Date.now();
}

export function snoozeUpdate(version: string): void {
  localStorage.setItem(
    `${SNOOZE_PREFIX}${version}`,
    String(Date.now() + SNOOZE_DURATION_MS),
  );
}
