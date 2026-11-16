/**
 * Where Zuno looks for its own updates: a GitHub repository (`owner/name`) whose Releases carry
 * the files `scripts/release.sh` publishes (Windows installer + `latest.json`, Android APKs +
 * `android-latest.json`).
 *
 * Desktop reads the same repository through `plugins.updater.endpoints` in `tauri.conf.json`;
 * `scripts/release.sh` refuses to publish while either still points elsewhere.
 */
export const UPDATE_REPO = "CONFIGURE_ME/zuno-releases";

export const UPDATE_REPO_CONFIGURED = !UPDATE_REPO.startsWith("CONFIGURE_ME/");

export const RELEASES_PAGE_URL = `https://github.com/${UPDATE_REPO}/releases`;
export const RELEASES_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
export const ANDROID_MANIFEST_URL = `https://github.com/${UPDATE_REPO}/releases/latest/download/android-latest.json`;
