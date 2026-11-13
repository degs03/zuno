//! Android-only glue: secret storage for `keyring`, and the bridge to the Kotlin side
//! (`ZunoPlugin` in gen/android) for sign-in and the system media session.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use base64::Engine as _;
use tauri::Manager;

/// `keyring` has no Android backend and silently falls back to its in-memory mock, so every
/// "saved" session vanished on restart. This store keeps the same entries in one JSON file in
/// the app's private data directory, which other apps cannot read; `allowBackup="false"` in the
/// manifest keeps it out of cloud/adb backups. It is the same protection the platform gives
/// SharedPreferences, which is where Android music clients keep these cookies.
pub mod secret_store {
    use super::*;
    use keyring::credential::{Credential, CredentialApi, CredentialBuilderApi};
    use keyring::Error;

    static PATH: OnceLock<PathBuf> = OnceLock::new();
    static LOCK: Mutex<()> = Mutex::new(());

    type Store = BTreeMap<String, String>;

    fn read(path: &PathBuf) -> Store {
        std::fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    fn write(path: &PathBuf, store: &Store) -> Result<(), Error> {
        let bytes = serde_json::to_vec(store).map_err(|e| Error::PlatformFailure(Box::new(e)))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| Error::PlatformFailure(Box::new(e)))?;
        }
        // Write-then-rename so a crash mid-write cannot leave a truncated store behind.
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, bytes).map_err(|e| Error::PlatformFailure(Box::new(e)))?;
        std::fs::rename(&tmp, path).map_err(|e| Error::PlatformFailure(Box::new(e)))
    }

    #[derive(Debug)]
    struct FileCredential {
        key: String,
    }

    impl CredentialApi for FileCredential {
        fn set_secret(&self, secret: &[u8]) -> keyring::Result<()> {
            let path = PATH.get().ok_or(Error::NoStorageAccess(
                "secret store used before initialisation".into(),
            ))?;
            let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let mut store = read(path);
            store.insert(self.key.clone(), base64::engine::general_purpose::STANDARD.encode(secret));
            write(path, &store)
        }

        fn get_secret(&self) -> keyring::Result<Vec<u8>> {
            let path = PATH.get().ok_or(Error::NoEntry)?;
            let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let value = read(path).remove(&self.key).ok_or(Error::NoEntry)?;
            base64::engine::general_purpose::STANDARD
                .decode(value)
                .map_err(|e| Error::BadEncoding(e.to_string().into_bytes()))
        }

        fn delete_credential(&self) -> keyring::Result<()> {
            let path = PATH.get().ok_or(Error::NoEntry)?;
            let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let mut store = read(path);
            if store.remove(&self.key).is_none() {
                return Err(Error::NoEntry);
            }
            write(path, &store)
        }

        fn as_any(&self) -> &dyn std::any::Any {
            self
        }
    }

    #[derive(Debug)]
    struct FileCredentialBuilder;

    impl CredentialBuilderApi for FileCredentialBuilder {
        fn build(&self, target: Option<&str>, service: &str, user: &str) -> keyring::Result<Box<Credential>> {
            // Unit separator: cannot appear in the service/user names this app uses.
            let key = format!("{}\u{1f}{service}\u{1f}{user}", target.unwrap_or_default());
            Ok(Box::new(FileCredential { key }))
        }

        fn as_any(&self) -> &dyn std::any::Any {
            self
        }

        fn persistence(&self) -> keyring::credential::CredentialPersistence {
            keyring::credential::CredentialPersistence::UntilDelete
        }
    }

    /// Must run before the first `keyring::Entry::new`.
    pub fn initialize(app: &tauri::AppHandle) {
        match app.path().app_data_dir() {
            Ok(dir) => {
                let _ = PATH.set(dir.join("secure-store-v1.json"));
                keyring::set_default_credential_builder(Box::new(FileCredentialBuilder));
            }
            Err(error) => eprintln!("[internal][tauri][warn] secret store unavailable: {error}"),
        }
    }
}

// ---- Bridge to ZunoPlugin.kt ---------------------------------------------------------------

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder as PluginBuilder, PluginHandle, TauriPlugin};
use tauri::Wry;

use crate::CommandError;

pub struct ZunoAndroid(PluginHandle<Wry>);

pub fn plugin() -> TauriPlugin<Wry> {
    PluginBuilder::<Wry>::new("zuno-android")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.zuno.desktop", "ZunoPlugin")?;
            app.manage(ZunoAndroid(handle));
            Ok(())
        })
        .build()
}

/// `run_mobile_plugin` hands the call to the Android main thread and blocks until it answers,
/// so it must never run *on* that thread (sync commands do) — always off it, here.
async fn call<T, P>(app: &tauri::AppHandle, command: &'static str, payload: P) -> Result<T, CommandError>
where
    T: serde::de::DeserializeOwned + Send + 'static,
    P: Serialize + Send + 'static,
{
    let handle = app.state::<ZunoAndroid>().0.clone();
    tauri::async_runtime::spawn_blocking(move || handle.run_mobile_plugin::<T>(command, payload))
        .await
        .map_err(|error| CommandError { message: format!("android bridge failed: {error}") })?
        .map_err(|error| CommandError { message: error.to_string() })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SlotArgs {
    slot_id: String,
}

#[derive(Deserialize)]
struct CookieReply {
    cookie: Option<String>,
}

/// Interactive Google sign-in in `LoginActivity`; the `Cookie` header for music.youtube.com.
pub async fn sign_in(app: &tauri::AppHandle, slot_id: &str) -> Result<String, CommandError> {
    let reply: CookieReply = call(app, "signIn", SlotArgs { slot_id: slot_id.into() }).await?;
    reply.cookie.ok_or_else(|| CommandError {
        message: "YouTube Music sign-in was cancelled.".into(),
    })
}

/// Silent renewal from the slot's saved Google session; `None` when it needs the user.
pub async fn refresh(app: &tauri::AppHandle, slot_id: &str) -> Result<Option<String>, CommandError> {
    let reply: CookieReply = call(app, "refreshSession", SlotArgs { slot_id: slot_id.into() }).await?;
    Ok(reply.cookie)
}

pub async fn save_snapshot(app: &tauri::AppHandle, slot_id: &str) {
    if let Err(error) = call::<serde_json::Value, _>(app, "saveSnapshot", SlotArgs { slot_id: slot_id.into() }).await {
        eprintln!("[internal][tauri][warn] login snapshot not saved: {}", error.message);
    }
}

/// Fire-and-forget: callers are sync and may be on any thread, including the main one.
pub fn forget_slot(app: &tauri::AppHandle, slot_id: &str) {
    let app = app.clone();
    let slot_id = slot_id.to_string();
    tauri::async_runtime::spawn(async move {
        let _ = call::<serde_json::Value, _>(&app, "forgetSlot", SlotArgs { slot_id }).await;
    });
}

#[derive(Serialize)]
struct SystemBarsArgs {
    light: bool,
}

/// Status/navigation bar icons and the window background follow the app theme.
#[tauri::command]
pub async fn android_set_system_bars(app: tauri::AppHandle, light: bool) -> Result<(), CommandError> {
    call::<serde_json::Value, _>(&app, "setSystemBars", SystemBarsArgs { light }).await.map(|_| ())
}

#[derive(Serialize)]
struct AccentArgs {
    color: String,
}

/// Accent colour (`#rrggbb`) for the home-screen widget and the media notification.
#[tauri::command]
pub async fn android_set_accent(app: tauri::AppHandle, color: String) -> Result<(), CommandError> {
    call::<serde_json::Value, _>(&app, "setAccent", AccentArgs { color }).await.map(|_| ())
}

#[tauri::command]
pub async fn android_cancel_sign_in(app: tauri::AppHandle) -> Result<(), CommandError> {
    call::<serde_json::Value, _>(&app, "cancelSignIn", ()).await.map(|_| ())
}

/// Same payload as the desktop `update_*_media_session` commands.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSessionUpdate {
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artwork_url: Option<String>,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    position_sec: Option<f64>,
    #[serde(default, skip_serializing)]
    #[allow(dead_code)]
    force_metadata: Option<bool>,
}

#[tauri::command]
pub async fn update_android_media_session(
    app: tauri::AppHandle,
    mut update: MediaSessionUpdate,
) -> Result<(), CommandError> {
    // Offline artwork is served to the webview from the app; the notification needs the file.
    if let Some(url) = update.artwork_url.as_deref() {
        if let Some(path) = crate::offline_artwork_file(&app, url) {
            update.artwork_url = Some(path.to_string_lossy().into_owned());
        }
    }
    call::<serde_json::Value, _>(&app, "updateMediaSession", update).await.map(|_| ())
}
