import { invoke } from "@tauri-apps/api/core";
import { logInternalWarn } from "./logging";

/** `invoke` rejects with a plain `{ message }` object, not an `Error`. */
export function getInvokeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;

    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

/*
 * Reads requested in the same tick go out as one `app_settings_get_many` call. Startup hydrates
 * ~30 settings back to back, and on a phone each round trip through the IPC bridge costs more
 * than the lookup itself. Every read still sees the store as it is when the batch is sent.
 */
let pendingReads: Map<string, Array<(value: unknown) => void>> | null = null;

function flushPendingReads(): void {
  const batch = pendingReads;
  pendingReads = null;
  if (!batch) return;
  const keys = [...batch.keys()];
  invoke<Record<string, unknown>>("app_settings_get_many", { keys })
    .then((values) => {
      for (const [key, resolvers] of batch) {
        for (const resolve of resolvers) resolve(values[key] ?? null);
      }
    })
    .catch((error) => {
      logInternalWarn("appSetting.get failed", {
        keys,
        error: getInvokeErrorMessage(error),
      });
      for (const resolvers of batch.values()) {
        for (const resolve of resolvers) resolve(null);
      }
    });
}

export function getAppSetting<T>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    if (!pendingReads) {
      pendingReads = new Map();
      queueMicrotask(flushPendingReads);
    }
    const resolvers = pendingReads.get(key) ?? [];
    resolvers.push(resolve as (value: unknown) => void);
    pendingReads.set(key, resolvers);
  });
}

export async function setAppSetting<T>(key: string, value: T): Promise<void> {
  try {
    await invoke("app_setting_set", { key, value });
  } catch (error) {
    logInternalWarn("appSetting.set failed", {
      key,
      error: getInvokeErrorMessage(error),
    });
  }
}

export async function removeAppSetting(key: string): Promise<void> {
  try {
    await invoke("app_setting_remove", { key });
  } catch (error) {
    logInternalWarn("appSetting.remove failed", {
      key,
      error: getInvokeErrorMessage(error),
    });
  }
}

export async function clearAppSettings(): Promise<void> {
  try {
    await invoke("app_settings_clear");
  } catch (error) {
    logInternalWarn("appSettings.clear failed", {
      error: getInvokeErrorMessage(error),
    });
    throw error;
  }
}
