import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  hydrateLocalBooleanSetting,
  hydrateLocalJsonSetting,
  readLocalBooleanSetting,
  readLocalJsonSetting,
  writeLocalBooleanSetting,
  writeLocalJsonSetting,
} from "../../internal/durableLocalSetting";
import { onListen } from "../../player/listenLog";
import { libraryController } from "../../player/playerStore";
import { usesRustAudioEngine } from "./audioEngine";
import { getEqualizer, isEqualizerEnabled } from "./equalizer";
import type { EqualizerSettings } from "./equalizerCurve";
import {
  ANALYSIS_MIN_SONGS,
  learnedCurve,
  learnProgress,
  madeForYouCurve,
  type EqObservation,
} from "./personalEqMath";

/**
 * Personal EQ curves built from the songs you like, kept only on this device.
 *
 * - "For you": every time a liked song finishes (30 s+ heard), the EQ that was on is recorded
 *   with how long it played; the curve is your time-weighted average.
 * - "Made for you": while a liked song plays, Rust measures its band levels (analysis.rs);
 *   the curve leans into what your favourites sound like (personalEqMath.ts).
 */
const LEARN_KEY = "personal-eq-learn-v1";
const SPECTRA_KEY = "personal-eq-spectra-v1";
const ENABLED_KEY = "personal-eq-enabled";
const CHANGE_EVENT = "personal-eq-change";
const MAX_OBSERVATIONS = 400;
const MAX_SPECTRA = 500;

const isObservations = (value: unknown): value is EqObservation[] => Array.isArray(value);
const isSpectra = (value: unknown): value is Record<string, number[]> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

let observations: EqObservation[] | null = null;
let spectra: Record<string, number[]> | null = null;
let snapshot: PersonalEqSnapshot | null = null;

const readObservations = () => (observations ??= readLocalJsonSetting(LEARN_KEY, isObservations) ?? []);
const readSpectra = () => (spectra ??= readLocalJsonSetting(SPECTRA_KEY, isSpectra) ?? {});
export const isPersonalEqEnabled = () => readLocalBooleanSetting(ENABLED_KEY, true);

export interface PersonalEqSnapshot {
  enabled: boolean;
  learned: EqualizerSettings | null;
  madeForYou: EqualizerSettings | null;
  learnNeeds: { songs: number; minutes: number };
  analysisNeeds: number;
  learnedSongs: number;
  analysedSongs: number;
}

function compute(): PersonalEqSnapshot {
  const obs = readObservations();
  const measured = Object.values(readSpectra());
  return {
    enabled: isPersonalEqEnabled(),
    learned: learnedCurve(obs),
    madeForYou: madeForYouCurve(measured),
    learnNeeds: learnProgress(obs),
    analysisNeeds: Math.max(0, ANALYSIS_MIN_SONGS - measured.length),
    learnedSongs: obs.length,
    analysedSongs: measured.length,
  };
}

function changed(): void {
  snapshot = null;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getPersonalEq(): PersonalEqSnapshot {
  return read();
}

function read(): PersonalEqSnapshot {
  return (snapshot ??= compute());
}

export function setPersonalEqEnabled(enabled: boolean): void {
  writeLocalBooleanSetting(ENABLED_KEY, enabled, CHANGE_EVENT);
  if (!enabled) void invoke("native_audio_set_analysis", { enabled: false }).catch(() => {});
  changed();
}

export function clearPersonalEq(): void {
  observations = [];
  spectra = {};
  writeLocalJsonSetting(LEARN_KEY, []);
  writeLocalJsonSetting(SPECTRA_KEY, {});
  changed();
}

function record(trackId: string, seconds: number): void {
  if (!isPersonalEqEnabled() || !libraryController.isTrackLiked(trackId)) return;
  const curve = isEqualizerEnabled() ? getEqualizer().bandsDb : new Array(10).fill(0);
  const next = [...readObservations(), { bandsDb: [...curve], weight: Math.round(seconds) }];
  observations = next.slice(-MAX_OBSERVATIONS);
  writeLocalJsonSetting(LEARN_KEY, observations);
  changed();
}

/** The liked track being measured right now, if any. */
let measuring: string | null = null;

async function finishMeasurement(): Promise<void> {
  const trackId = measuring;
  measuring = null;
  if (!trackId) return;
  const bands = await invoke<number[] | null>("native_audio_take_spectrum").catch(() => null);
  if (!bands || bands.length !== 10) return;
  const all = { ...readSpectra(), [trackId]: bands.map((value) => Math.round(value * 10) / 10) };
  const keys = Object.keys(all);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_SPECTRA))) delete all[key];
  spectra = all;
  writeLocalJsonSetting(SPECTRA_KEY, all);
  changed();
}

/** On every track change: close the previous measurement, start one if the new song is liked. */
async function onTrackChange(trackId: string | undefined): Promise<void> {
  await finishMeasurement();
  const want = Boolean(
    trackId && isPersonalEqEnabled() && usesRustAudioEngine() && libraryController.isTrackLiked(trackId),
  );
  await invoke("native_audio_set_analysis", { enabled: want }).catch(() => {});
  measuring = want ? trackId ?? null : null;
}

let started = false;

/** Follows the player. Idempotent; called once from playerStore. */
export function startPersonalEq(
  subscribe: (listener: () => void) => () => void,
  readTrackId: () => string | undefined,
): void {
  if (started || typeof window === "undefined") return;
  started = true;
  onListen((track, seconds) => record(track.id, seconds));
  let last: string | undefined;
  subscribe(() => {
    const id = readTrackId();
    if (id === last) return;
    last = id;
    void onTrackChange(id);
  });
}

export async function hydratePersonalEq(): Promise<void> {
  await Promise.all([
    hydrateLocalJsonSetting(LEARN_KEY, isObservations),
    hydrateLocalJsonSetting(SPECTRA_KEY, isSpectra),
    hydrateLocalBooleanSetting(ENABLED_KEY, true, CHANGE_EVENT),
  ]);
  observations = null;
  spectra = null;
  changed();
}

function subscribeStore(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

export function usePersonalEq(): PersonalEqSnapshot {
  return useSyncExternalStore(subscribeStore, read, read);
}
