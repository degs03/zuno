import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isAndroid } from "../platform";

/** Mounted screens that want the display on; the flag is held while any of them is open. */
let holders = 0;
let wakeLock: { release(): Promise<void> } | null = null;

async function apply(on: boolean): Promise<void> {
  if (isAndroid) {
    await invoke("android_keep_screen_on", { on }).catch(() => {});
    return;
  }
  const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
  if (on && !wakeLock && nav.wakeLock) {
    wakeLock = await nav.wakeLock.request("screen").catch(() => null);
  } else if (!on && wakeLock) {
    await wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

/** Keeps the screen on while the calling component is mounted and `active` is true. */
export function useKeepScreenOn(active = true): void {
  useEffect(() => {
    if (!active) return;
    holders += 1;
    if (holders === 1) void apply(true);
    return () => {
      holders -= 1;
      if (holders === 0) void apply(false);
    };
  }, [active]);
}
