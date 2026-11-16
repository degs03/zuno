import { useSyncExternalStore } from "react";
import {
  hydrateLocalBooleanSetting,
  readLocalBooleanSetting,
  writeLocalBooleanSetting,
} from "./durableLocalSetting";
import { t } from "../i18n";

/**
 * Whether the app may use the network: the network is reachable (PlayerBar's probe) *and* the
 * user has not switched on Offline mode.
 *
 * A module rather than PlayerBar state because the player needs it too: offline, it has to
 * step over songs that are not downloaded instead of failing on each one.
 *
 * Offline mode makes the whole app behave exactly as it does with no connection — Home shows
 * downloads, search searches downloads, the queue skips what is not saved — and on top of that
 * `tauriFetch` refuses every request, so nothing is streamed or fetched (handy on mobile data).
 */
let detected = typeof navigator === "undefined" ? true : navigator.onLine;
const FORCED_KEY = "offline-mode-v1";
const FORCED_EVENT = "offline-mode-change";
let forced = typeof localStorage === "undefined" ? false : readLocalBooleanSetting(FORCED_KEY, false);
let online = detected && !forced;
const listeners = new Set<() => void>();

function recompute(): void {
  const next = detected && !forced;
  if (next === online) return;
  online = next;
  for (const listener of listeners) listener();
}

export function isOnline(): boolean {
  return online;
}

/** The probe's verdict on the network itself, whatever Offline mode says. */
export function isNetworkReachable(): boolean {
  return detected;
}

export function setOnline(next: boolean): void {
  detected = next;
  recompute();
}

export function isOfflineModeOn(): boolean {
  return forced;
}

export function setOfflineMode(on: boolean): void {
  if (forced === on) return;
  forced = on;
  writeLocalBooleanSetting(FORCED_KEY, on, FORCED_EVENT);
  recompute();
}

export async function hydrateOfflineMode(): Promise<void> {
  await hydrateLocalBooleanSetting(FORCED_KEY, false, FORCED_EVENT, (on) => {
    forced = on;
    recompute();
  });
}

function subscribeForced(listener: () => void): () => void {
  window.addEventListener(FORCED_EVENT, listener);
  return () => window.removeEventListener(FORCED_EVENT, listener);
}

export function useOfflineMode(): boolean {
  return useSyncExternalStore(subscribeForced, isOfflineModeOn, () => false);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}

/** Runs `callback` each time the app comes back online. */
export function onReconnect(callback: () => void): () => void {
  return subscribe(() => {
    if (online) callback();
  });
}

/** A failed load's message, saying so plainly when the real cause is being offline. */
export function loadFailedMessage(message: string): string {
  if (forced) return t("Offline mode is on. Turn it off to load this.");
  return online ? message : t("You're offline. Reconnect and try again.");
}
