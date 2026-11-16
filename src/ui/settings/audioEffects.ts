import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  hydrateLocalJsonSetting,
  readLocalJsonSetting,
  writeLocalJsonSetting,
} from "../../internal/durableLocalSetting";
import { logInternalWarn } from "../../internal/logging";
import {
  AUDIO_EFFECTS_NEUTRAL,
  isAudioEffects,
  normalizeAudioEffects,
  sameAudioEffects,
  type AudioEffects,
} from "./audioEffectsValues";

export * from "./audioEffectsValues";

/**
 * Tone and stereo controls beside the ten-band EQ: bass and treble shelves, balance and width.
 *
 * Like the EQ, the processing is in Rust (`equalizer.rs`, `native_audio_set_effects`), so it only
 * applies on the Rust engine, and Rust starts neutral each launch — `hydrateAudioEffects` pushes
 * the stored values back down. They follow the EQ's bypass switch too: off means neutral.
 */
const STORAGE_KEY = "audio-effects-v1";
const CHANGE_EVENT = "audio-effects-change";

let cached: AudioEffects | null = null;
/** Whether the EQ bypass switch is on; set by `equalizer.ts` through `setAudioEffectsBypassed`. */
let bypassed = false;

function read(): AudioEffects {
  if (cached === null) {
    const stored = readLocalJsonSetting(STORAGE_KEY, isAudioEffects);
    cached = stored ? normalizeAudioEffects(stored) : AUDIO_EFFECTS_NEUTRAL;
  }
  return cached;
}

function push(): void {
  const applied = bypassed ? AUDIO_EFFECTS_NEUTRAL : read();
  void invoke("native_audio_set_effects", { ...applied }).catch((error: unknown) => {
    logInternalWarn("Audio effects push failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

const PERSIST_DELAY_MS = 400;
let persistTimer: number | undefined;

function persistNow(): void {
  window.clearTimeout(persistTimer);
  persistTimer = undefined;
  writeLocalJsonSetting(STORAGE_KEY, read());
}

export function getAudioEffects(): AudioEffects {
  return read();
}

export function setAudioEffects(next: Partial<AudioEffects>): void {
  const merged = normalizeAudioEffects({ ...read(), ...next });
  if (sameAudioEffects(merged, read())) return;
  cached = merged;
  push();
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistNow, PERSIST_DELAY_MS);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Follows the EQ on/off switch: one switch bypasses the whole sound chain. */
export function setAudioEffectsBypassed(value: boolean): void {
  if (bypassed === value) return;
  bypassed = value;
  push();
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === STORAGE_KEY) cached = null;
  });
  window.addEventListener("pagehide", () => {
    if (persistTimer !== undefined) persistNow();
  });
}

export async function hydrateAudioEffects(bypass: boolean): Promise<void> {
  await hydrateLocalJsonSetting(STORAGE_KEY, isAudioEffects);
  cached = null;
  bypassed = bypass;
  push();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAudioEffects(): AudioEffects {
  return useSyncExternalStore(subscribe, read, () => AUDIO_EFFECTS_NEUTRAL);
}
