/*!
 * Over-the-air updates for the Android build (desktop uses tauri-plugin-updater).
 *
 * The release publishes `android-latest.json` beside the APKs (see `scripts/release.sh`):
 *
 * ```json
 * { "version": "1.6.0", "versionCode": 1006000, "notes": "...",
 *   "apks": { "arm64": { "url": "https://github.com/…/Zuno-1.6.0-android-arm64.apk", "sha256": "…" },
 *             "armv7": { "url": "…", "sha256": "…" } } }
 * ```
 *
 * The webview cannot fetch GitHub release assets itself (no CORS headers), so Rust fetches the
 * manifest, downloads the APK into the app cache, and checks its SHA-256 before Kotlin hands it
 * to the system installer. Android then also refuses any APK not signed with the installed
 * app's key, so a tampered or wrong-key file can never replace Zuno.
 */

use std::path::PathBuf;

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager};

use crate::CommandError;

const MAX_MANIFEST_BYTES: usize = 256 * 1024;
const MAX_APK_BYTES: u64 = 400 * 1024 * 1024;

fn error(message: impl Into<String>) -> CommandError {
    CommandError { message: message.into() }
}

/// Only GitHub release hosts: the manifest decides what gets installed.
fn is_release_url(url: &str) -> bool {
    let Ok(parsed) = url::Url::parse(url) else {
        return false;
    };
    parsed.scheme() == "https"
        && matches!(
            parsed.host_str(),
            Some("github.com" | "objects.githubusercontent.com" | "release-assets.githubusercontent.com" | "raw.githubusercontent.com")
        )
}

/// Fetches the small JSON manifest of the latest release. `None` when there is none (404).
#[tauri::command]
pub async fn update_fetch_manifest(url: String) -> Result<Option<String>, CommandError> {
    if !is_release_url(&url) {
        return Err(error("update manifest must come from GitHub releases"));
    }
    let response = crate::http_client(None)
        .get(&url)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| error(format!("update check failed: {e}")))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let response = response.error_for_status().map_err(|e| error(format!("update check failed: {e}")))?;
    let bytes = response.bytes().await.map_err(|e| error(format!("update check failed: {e}")))?;
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err(error("update manifest is too large"));
    }
    String::from_utf8(bytes.to_vec()).map(Some).map_err(|_| error("update manifest is not text"))
}

/// The ABI name used in the manifest for this build.
#[tauri::command]
pub fn update_abi() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "arm" => "armv7",
        "x86_64" => "x86_64",
        "x86" => "x86",
        other => other,
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

fn update_path(app: &tauri::AppHandle) -> Result<PathBuf, CommandError> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| error(format!("cache directory unavailable: {e}")))?
        .join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| error(format!("cache directory failed: {e}")))?;
    Ok(dir.join("zuno-update.apk"))
}

/**
 * Downloads the APK to the cache, emitting `update-download-progress`, and verifies its SHA-256.
 * Returns the file path for `android_install_apk`. A mismatch deletes the file and fails.
 */
#[tauri::command]
pub async fn update_download_apk(app: tauri::AppHandle, url: String, sha256: String) -> Result<String, CommandError> {
    use std::io::Write;
    if !is_release_url(&url) {
        return Err(error("update must come from GitHub releases"));
    }
    let expected = sha256.trim().to_ascii_lowercase();
    if expected.len() != 64 || !expected.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(error("update manifest has no valid checksum"));
    }
    let path = update_path(&app)?;
    let response = crate::http_client(None)
        .get(&url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| error(format!("update download failed: {e}")))?;
    let total = response.content_length();
    if total.is_some_and(|t| t > MAX_APK_BYTES) {
        return Err(error("update is unexpectedly large"));
    }
    let mut file = std::fs::File::create(&path).map_err(|e| error(format!("update save failed: {e}")))?;
    let mut hasher = Sha256::new();
    let mut downloaded = 0u64;
    let mut last_emit = 0u64;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| error(format!("update download failed: {e}")))?;
        downloaded += chunk.len() as u64;
        if downloaded > MAX_APK_BYTES {
            let _ = std::fs::remove_file(&path);
            return Err(error("update is unexpectedly large"));
        }
        hasher.update(&chunk);
        file.write_all(&chunk).map_err(|e| error(format!("update save failed: {e}")))?;
        if downloaded - last_emit >= 256 * 1024 {
            last_emit = downloaded;
            let _ = app.emit("update-download-progress", DownloadProgress { downloaded, total });
        }
    }
    file.flush().map_err(|e| error(format!("update save failed: {e}")))?;
    drop(file);
    let _ = app.emit("update-download-progress", DownloadProgress { downloaded, total });

    let actual: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if actual != expected {
        let _ = std::fs::remove_file(&path);
        return Err(error("the downloaded update is damaged (checksum mismatch); try again"));
    }
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::is_release_url;

    #[test]
    fn only_github_release_hosts_are_trusted() {
        assert!(is_release_url("https://github.com/me/zuno/releases/latest/download/android-latest.json"));
        assert!(is_release_url("https://objects.githubusercontent.com/x"));
        assert!(!is_release_url("http://github.com/me/zuno"));
        assert!(!is_release_url("https://github.com.evil.example/x"));
        assert!(!is_release_url("https://example.com/zuno.apk"));
    }
}
