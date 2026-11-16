import { useSyncExternalStore } from "react";
import { onAndroidEvent } from "../android";
import { isAndroid } from "../platform";
import { showNotice } from "../notice";
import { applyAudioProfile, deviceKey, profileForDevice } from "./audioProfiles";
import { getOutputDevice, listOutputDevices } from "./audioOutputDevice";
import { isCarDevice } from "./carDevices";
import { openCarMode } from "../components/CarModeView";

/**
 * Which device the sound is coming out of right now, so a sound profile can follow it: plug in
 * the studio headphones and their profile applies; go back to the speaker and its profile does.
 *
 * - Android: PlaybackService reports the route (`device` events) at startup and on every change.
 * - Desktop: the device picked in Settings, or the OS default's name, re-checked every few
 *   seconds while the window is visible (cpal has no change notification).
 */
export interface CurrentOutputDevice {
  key: string;
  name: string;
  kind: string;
}

const CHANGE_EVENT = "current-output-device-change";
const POLL_MS = 5_000;

let current: CurrentOutputDevice | null = null;

function setCurrent(name: string, kind: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const key = deviceKey(trimmed, kind);
  if (current?.key === key) return;
  const first = current === null;
  current = { key, name: trimmed, kind };
  window.dispatchEvent(new Event(CHANGE_EVENT));

  // A device marked as the car opens car mode when it connects (not at launch).
  if (!first && isCarDevice(key)) openCarMode();

  const profile = profileForDevice(key);
  if (profile) {
    applyAudioProfile(profile);
    // Quiet on launch: the profile simply is the sound; only a switch is news.
    if (!first) showNotice(`${profile.name} · ${trimmed}`);
  }
}

async function pollDesktop(): Promise<void> {
  try {
    const devices = await listOutputDevices();
    const chosen = getOutputDevice();
    const device = devices.find((entry) => (chosen ? entry.id === chosen : entry.isDefault));
    if (device) setCurrent(device.name, "output");
  } catch {
    // The engine may not be up yet; the next tick tries again.
  }
}

let started = false;

/** Starts watching. Idempotent; called once from `main.tsx`. */
export function startOutputDeviceWatch(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  if (isAndroid) {
    onAndroidEvent("device", (event) => {
      if (event.connected) setCurrent(event.name, event.kind);
      // A disconnect is followed by the route the system fell back to, reported as connected.
    });
    return;
  }

  void pollDesktop();
  window.setInterval(() => {
    if (document.visibilityState === "visible") void pollDesktop();
  }, POLL_MS);
  window.addEventListener("audio-output-device-change", () => void pollDesktop());
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

export function useCurrentOutputDevice(): CurrentOutputDevice | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
