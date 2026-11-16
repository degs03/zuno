import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  hydrateLocalJsonSetting,
  readLocalJsonSetting,
  writeLocalJsonSetting,
} from "../../internal/durableLocalSetting";
import { logInternalWarn } from "../../internal/logging";
import { isAndroid } from "../platform";
import { msg } from "../../i18n";

/**
 * What a one-button headset or earbud does (Android). One press always plays/pauses; these are
 * the double, triple and long presses, plus resuming when headphones connect.
 *
 * Kept here for the UI and pushed down to Kotlin (`AudioRoutes`), which acts on them directly so
 * they work with the screen off and the page asleep.
 */
export type HeadsetGesture = "next" | "previous" | "like" | "none";

export interface HeadsetSettings {
  double: HeadsetGesture;
  triple: HeadsetGesture;
  long: HeadsetGesture;
  resumeOnConnect: boolean;
}

export const HEADSET_DEFAULTS: HeadsetSettings = { double: "next", triple: "previous", long: "none", resumeOnConnect: false };
export const HEADSET_GESTURES: { value: HeadsetGesture; label: string }[] = [
  { value: "next", label: msg("Next track") },
  { value: "previous", label: msg("Previous track") },
  { value: "like", label: msg("Like song") },
  { value: "none", label: msg("Nothing") },
];

const STORAGE_KEY = "headset-settings-v1";
const CHANGE_EVENT = "headset-settings-change";
const GESTURES = new Set<string>(["next", "previous", "like", "none"]);

function isHeadsetSettings(value: unknown): value is HeadsetSettings {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return GESTURES.has(String(v.double)) && GESTURES.has(String(v.triple)) && GESTURES.has(String(v.long))
    && typeof v.resumeOnConnect === "boolean";
}

let cached: HeadsetSettings | null = null;

function read(): HeadsetSettings {
  if (cached === null) cached = readLocalJsonSetting(STORAGE_KEY, isHeadsetSettings) ?? HEADSET_DEFAULTS;
  return cached;
}

function push(): void {
  if (!isAndroid) return;
  void invoke("android_set_headset_prefs", { prefs: read() }).catch((error: unknown) => {
    logInternalWarn("Headset prefs push failed", { error: String(error) });
  });
}

export function setHeadsetSettings(next: Partial<HeadsetSettings>): void {
  cached = { ...read(), ...next };
  writeLocalJsonSetting(STORAGE_KEY, cached);
  push();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export async function hydrateHeadsetSettings(): Promise<void> {
  await hydrateLocalJsonSetting(STORAGE_KEY, isHeadsetSettings);
  cached = null;
  push();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

export function useHeadsetSettings(): HeadsetSettings {
  return useSyncExternalStore(subscribe, read, () => HEADSET_DEFAULTS);
}
