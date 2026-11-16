import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  hydrateLocalBooleanSetting,
  readLocalBooleanSetting,
  writeLocalBooleanSetting,
} from "../../internal/durableLocalSetting";
import { logInternalWarn } from "../../internal/logging";
import { isAndroid } from "../platform";

/**
 * Bit-perfect output for external DACs.
 *
 * On, the Rust engine stops touching samples (no EQ, effects, normalisation, speed or pitch,
 * unity volume) and opens the device at each track's own sample rate, so the mixer never
 * resamples. On Android 14+ with a USB DAC it also asks the system for its bit-perfect mixer
 * path. Volume is then the DAC's (or the phone's hardware) volume.
 *
 * Honest limits, shown in Settings: YouTube streams are lossy (Opus/AAC) — bit-perfect means
 * they reach the DAC unaltered, not that they become lossless; local FLAC/WAV benefit most.
 * Windows shares the device (no WASAPI exclusive in cpal), so the device format in Sound
 * settings should match the music for a true bit-perfect path.
 */
const STORAGE_KEY = "bit-perfect-output";
const CHANGE_EVENT = "bit-perfect-change";

export interface OutputFormat {
  deviceRate: number;
  deviceChannels: number;
  deviceFormat: string;
  sourceRate: number;
  bitPerfect: boolean;
}

export const isBitPerfect = () => readLocalBooleanSetting(STORAGE_KEY, false);

function push(): void {
  void invoke("native_audio_set_bit_perfect", { enabled: isBitPerfect() }).catch((error: unknown) => {
    logInternalWarn("bit-perfect push failed", { error: String(error) });
  });
  if (isAndroid && !isBitPerfect()) {
    void invoke("android_set_bit_perfect", { enabled: false, sampleRate: 48_000 }).catch(() => {});
    androidRate = 0;
  }
}

export function setBitPerfect(enabled: boolean): void {
  writeLocalBooleanSetting(STORAGE_KEY, enabled, CHANGE_EVENT);
  push();
}

export async function hydrateBitPerfect(): Promise<void> {
  await hydrateLocalBooleanSetting(STORAGE_KEY, false, CHANGE_EVENT);
  push();
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

export function useBitPerfect(): boolean {
  return useSyncExternalStore(subscribe, isBitPerfect, () => false);
}

export async function readOutputFormat(): Promise<OutputFormat | null> {
  try {
    return await invoke<OutputFormat>("native_audio_output_format");
  } catch {
    return null;
  }
}

/** Android: the rate the system bit-perfect path is set to, and its last status. */
let androidRate = 0;
let androidStatus = "";

/**
 * Keeps Android's USB bit-perfect mixer at the playing track's rate. Called after each track
 * starts; cheap when nothing changed.
 */
export async function syncAndroidBitPerfect(): Promise<void> {
  if (!isAndroid || !isBitPerfect()) return;
  const format = await readOutputFormat();
  if (!format?.sourceRate || format.sourceRate === androidRate) return;
  try {
    const reply = await invoke<{ status: string }>("android_set_bit_perfect", { enabled: true, sampleRate: format.sourceRate });
    androidRate = format.sourceRate;
    androidStatus = reply.status;
  } catch (error) {
    logInternalWarn("android bit-perfect failed", { error: String(error) });
  }
}

export function getAndroidBitPerfectStatus(): string {
  return androidStatus;
}

/** Live output format while a component is mounted (Settings indicator). */
export function useOutputFormat(intervalMs = 2_000): OutputFormat | null {
  const [format, setFormat] = useState<OutputFormat | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = () => void readOutputFormat().then((next) => {
      if (!cancelled) setFormat(next);
    });
    poll();
    const id = window.setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return format;
}
