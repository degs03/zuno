//! Hands the JavaVM and the Activity to `ndk-context`.
//!
//! cpal's AAudio backend asks `ndk_context::android_context()` for them when it enumerates
//! output devices, and panics ("android context was not initialized") if nobody has set them.
//! A NativeActivity app gets this for free from `android-activity`; Tauri does not use that
//! crate, so it is done here from the main webview's JNI handle.

use std::sync::{Condvar, Mutex};
use std::time::Duration;

use tauri::Manager;

static READY: Mutex<bool> = Mutex::new(false);
static READY_SIGNAL: Condvar = Condvar::new();

/// Called once from `setup`. The JNI callback runs later on the Activity's thread.
pub fn initialize(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[internal][tauri][warn] no main window; android audio context not set");
        return;
    };
    let result = window.with_webview(|webview| {
        webview.jni_handle().exec(|env, activity, _webview| {
            let vm = match env.get_java_vm() {
                Ok(vm) => vm,
                Err(error) => {
                    eprintln!("[internal][tauri][warn] JavaVM unavailable: {error}");
                    return;
                }
            };
            let activity = match env.new_global_ref(activity) {
                Ok(activity) => activity,
                Err(error) => {
                    eprintln!("[internal][tauri][warn] activity ref failed: {error}");
                    return;
                }
            };
            // SAFETY: both pointers stay valid for the life of the process — the VM by
            // definition, the Activity because its global ref is leaked right below.
            unsafe {
                ndk_context::initialize_android_context(
                    vm.get_java_vm_pointer().cast(),
                    activity.as_obj().as_raw().cast(),
                );
            }
            std::mem::forget(activity);
            *READY.lock().unwrap_or_else(|e| e.into_inner()) = true;
            READY_SIGNAL.notify_all();
        });
    });
    if let Err(error) = result {
        eprintln!("[internal][tauri][warn] android audio context not set: {error}");
    }
}

/// Blocks the audio thread's start until the context is set, or gives up after `timeout`.
pub fn wait(timeout: Duration) -> bool {
    let guard = READY.lock().unwrap_or_else(|e| e.into_inner());
    let (guard, _) = READY_SIGNAL
        .wait_timeout_while(guard, timeout, |ready| !*ready)
        .unwrap_or_else(|e| e.into_inner());
    *guard
}
