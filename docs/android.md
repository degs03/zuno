# Android

Zuno builds for Android from the same codebase. Tauri 2 compiles the Rust crate for the phone,
the React UI runs in the system WebView, and a small Kotlin layer under
`src-tauri/gen/android` handles what a WebView cannot do on its own.

arm64 (`aarch64`) and 32-bit ARM (`armv7`) are built, one APK per ABI, so older and Android Go
phones are covered too. Android 8.0 (API 26) is the minimum, because that is the first version
with AAudio, which the Rust audio engine plays through.

## Running well on slow phones

- **Audio never waits on the network inside the realtime callback.** `prefetch.rs` decodes on
  its own thread into ~0.7 s of chunks. If the download falls behind, the deck plays silence and
  increments `prefetch::UNDERRUNS` (logged with every `native_audio_load`) instead of stalling the
  callback. Android also gets an ~85 ms device buffer.
- **Per-sample work is minimal.** The equaliser runs only the bands that filter, and the
  position clock publishes in batches.
- **First launch picks lean defaults** (`renderEffects.ts`, `applyMobileDefaults`): no backdrop
  blur or ambient artwork, and full Potato mode on 2 GB or dual-core devices. Users can change all
  of these later in Settings → Appearance.
- **Startup and idle cost is cut.** Settings are hydrated in a single IPC round trip, the intro is
  a still image instead of a video, the BotGuard warm-up waits for idle, and the seek bar does not
  poll while paused. The data cache is capped at 512 MB.
- **Measuring:** `app_memory_report` returns the process's VmRSS/RssAnon on Android. The
  WebView renderer is a separate process; `adb shell dumpsys meminfo` shows both.

## How it maps onto the desktop app

| Concern | Desktop | Android |
|---|---|---|
| Google sign-in | A separate window with an address bar and a per-account webview partition (`build_login_window`) | `LoginActivity.kt`: a native WebView with a read-only address bar. The cookie is harvested with the same rule as `harvest_session_cookie` |
| Multiple accounts | One webview partition per slot | One shared cookie store, plus a per-slot snapshot of the Google cookies (`LoginSnapshots`) |
| Silent session refresh | A hidden login window on the slot's partition | `SilentRefresh`: an off-screen WebView after restoring the slot's snapshot |
| Stored session (and Last.fm) | OS keyring / DPAPI / encrypted file | `android::secret_store`: a `keyring` credential builder backed by a file in the app's private data dir. `allowBackup` is off |
| System media controls | SMTC / MPNowPlayingInfoCenter / MPRIS | `PlaybackService.kt`: a `mediaPlayback` foreground service with a MediaSession and notification |
| Keeping audio alive | Not needed | The same foreground service. The Rust engine decodes in-process |
| UI serving in release | `http://localhost:{port}` (`tauri-plugin-localhost`) | Tauri's own `tauri.localhost` scheme (release APKs forbid cleartext) |
| Window chrome, tray, mini player, autostart, updater, zoom, Discord | Yes | None. Gated with `#[cfg(desktop)]` in Rust and `isMobile` in the UI |

Rust reaches Kotlin through the inline plugin in `src-tauri/src/android.rs`, using
`run_mobile_plugin`. That call blocks until the Android main thread answers, so it must never
run *on* that thread: always call it through `android::call`. Kotlin reaches the UI by
dispatching a `zuno-android` CustomEvent on `window` (`src/ui/android.ts`). Media controls
arrive there with the same action names the desktop sessions emit.

On mobile the UI swaps the sidebar and title bar for `MobileNavBar` and uses a compact player
bar. The system back button goes to the handlers registered with `registerBackHandler`, and
when none of them consumes it the app moves to the background instead of quitting.

## Building

You need Android Studio (SDK and NDK 27.1), Java 17 (the one bundled with Android Studio works)
and Rust with the target:

```sh
rustup target add aarch64-linux-android armv7-linux-androideabi
npm ci
npx tauri android build --apk --target aarch64 --target armv7 --split-per-abi  # release, unsigned
npx tauri android build --apk --target aarch64 --debug                          # debug, installable
npx tauri android dev                                                           # live reload
```

**Windows:** the Tauri CLI links the built library into `jniLibs` with a symlink, and creating
symlinks needs Developer Mode (Settings → System → For developers). The alternative is to run
`cargo build --target aarch64-linux-android --lib --features tauri/custom-protocol`, copy the
resulting `libzuno_lib.so` into `gen/android/app/src/main/jniLibs/arm64-v8a/`, and then run
`gradlew :app:assembleArm64Debug -x rustBuildArm64Debug`.

CI (`.github/workflows/android.yml`) runs clippy for both Android targets and uploads one APK per
ABI, signed with a throwaway key, so a pull request can be tried on a phone.

## Known gaps

- **Local music folders** are hidden. The file picker returns `content://` URIs, and the
  `local_audio_*` commands work on filesystem paths.
- **Signing and distribution:** there is no release keystore, and Zuno is not suitable for Play
  Store distribution.
- **Multi-account refresh** relies on restoring cookie snapshots without their original
  attributes. If it fails, the app asks the user to sign in again, as it would after a real
  expiry on desktop.
