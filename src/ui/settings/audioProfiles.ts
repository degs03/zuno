import { useSyncExternalStore } from "react";
import {
  hydrateLocalJsonSetting,
  readLocalJsonSetting,
  writeLocalJsonSetting,
} from "../../internal/durableLocalSetting";
import { exportJsonFile, importJsonFile, sanitizeFileName } from "../../internal/fileTransfer";
import { readPlaybackSettings } from "../../player/playbackSettings";
import { playerController } from "../../player/playerStore";
import { t } from "../../i18n";
import { getAudioEffects, setAudioEffects, useAudioEffects } from "./audioEffects";
import {
  AUDIO_PROFILE_NAME_MAX,
  buildProfileFile,
  clampPitch,
  clampPlaybackRate,
  newProfileId,
  normalizeProfile,
  parseProfileFile,
  sameProfileSound,
  uniqueName,
  type AudioProfile,
} from "./audioProfileFormat";
import {
  getEqualizer,
  getEqualizerUserPresets,
  importEqualizerPresets,
  isEqualizerEnabled,
  setEqualizer,
  setEqualizerEnabled,
  useEqualizer,
  useEqualizerEnabled,
} from "./equalizer";
import { isVolumeNormalizationEnabled, setVolumeNormalization, useVolumeNormalization } from "./volumeNormalization";

export type { AudioProfile } from "./audioProfileFormat";
export { AUDIO_PROFILE_NAME_MAX } from "./audioProfileFormat";

/**
 * Named sound setups — EQ curve and switch, tone/stereo effects, speed, pitch, normalisation —
 * that can be recalled in one tap, exported to a file, imported on another device, and tied to
 * an output device (see `profileForDevice`).
 *
 * A profile is applied through each setting's own setter, never by writing their storage, so
 * every side effect (pushing to Rust, persisting, events) happens exactly as a manual change.
 */
const STORAGE_KEY = "audio-profiles-v1";
const DEVICES_KEY = "audio-profile-devices-v1";
const CHANGE_EVENT = "audio-profiles-change";

const isProfileList = (value: unknown): value is unknown[] => Array.isArray(value);
const isDeviceMap = (value: unknown): value is Record<string, string> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.values(value).every((entry) => typeof entry === "string");

let profilesCached: AudioProfile[] | null = null;
let devicesCached: Record<string, string> | null = null;
const NO_PROFILES: AudioProfile[] = [];
const NO_DEVICES: Record<string, string> = {};

export function getAudioProfiles(): AudioProfile[] {
  return readProfiles();
}

function readProfiles(): AudioProfile[] {
  if (profilesCached === null) {
    profilesCached = (readLocalJsonSetting(STORAGE_KEY, isProfileList) ?? [])
      .map(normalizeProfile)
      .filter((profile): profile is AudioProfile => profile !== null);
  }
  return profilesCached;
}

function readDevices(): Record<string, string> {
  if (devicesCached === null) devicesCached = readLocalJsonSetting(DEVICES_KEY, isDeviceMap) ?? {};
  return devicesCached;
}

function writeProfiles(profiles: AudioProfile[]): void {
  profilesCached = profiles;
  writeLocalJsonSetting(STORAGE_KEY, profiles);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function writeDevices(devices: Record<string, string>): void {
  devicesCached = devices;
  writeLocalJsonSetting(DEVICES_KEY, devices);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** What is playing right now, as an unnamed profile. */
export function captureCurrentSound(name = ""): AudioProfile {
  const playback = readPlaybackSettings();
  return {
    id: newProfileId(),
    name,
    equalizer: { ...getEqualizer(), enabled: isEqualizerEnabled() },
    effects: { ...getAudioEffects() },
    playbackRate: clampPlaybackRate(playback.playbackRate),
    pitchSemitones: clampPitch(playback.pitchSemitones),
    volumeNormalization: isVolumeNormalizationEnabled(),
  };
}

export function applyAudioProfile(profile: AudioProfile): void {
  setEqualizer({ preampDb: profile.equalizer.preampDb, bandsDb: [...profile.equalizer.bandsDb] });
  setAudioEffects(profile.effects);
  if (isEqualizerEnabled() !== profile.equalizer.enabled) setEqualizerEnabled(profile.equalizer.enabled);
  if (isVolumeNormalizationEnabled() !== profile.volumeNormalization) setVolumeNormalization(profile.volumeNormalization);
  playerController.setPlaybackRate(profile.playbackRate);
  playerController.setPitch(profile.pitchSemitones);
}

export function audioProfileNameError(name: string, renamingId?: string): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return t("Give it a name");
  if (key.length > AUDIO_PROFILE_NAME_MAX) return t("Up to {max} characters", { max: AUDIO_PROFILE_NAME_MAX });
  if (readProfiles().some((profile) => profile.id !== renamingId && profile.name.toLowerCase() === key)) {
    return t("Another profile already has that name");
  }
  return null;
}

export function suggestAudioProfileName(): string {
  return uniqueName(t("My sound"), readProfiles().map((profile) => profile.name));
}

/** Saves the current sound under `name`. Returns the new profile. */
export function saveCurrentAsProfile(name: string): AudioProfile {
  const profile = captureCurrentSound(name.trim().slice(0, AUDIO_PROFILE_NAME_MAX));
  writeProfiles([...readProfiles(), profile]);
  return profile;
}

/** Overwrites a profile's sound with what is playing now, keeping its name and id. */
export function updateProfileFromCurrent(id: string): void {
  writeProfiles(readProfiles().map((profile) =>
    profile.id === id ? { ...captureCurrentSound(profile.name), id } : profile,
  ));
}

export function renameAudioProfile(id: string, name: string): void {
  const trimmed = name.trim().slice(0, AUDIO_PROFILE_NAME_MAX);
  writeProfiles(readProfiles().map((profile) => (profile.id === id ? { ...profile, name: trimmed } : profile)));
}

export function deleteAudioProfile(id: string): void {
  writeProfiles(readProfiles().filter((profile) => profile.id !== id));
  const devices = Object.fromEntries(Object.entries(readDevices()).filter(([, profileId]) => profileId !== id));
  writeDevices(devices);
}

// ---- Files ---------------------------------------------------------------------------------

/** Exports one profile, or every profile (plus the user's EQ presets) when `id` is omitted. */
export async function exportAudioProfiles(id?: string): Promise<string | null> {
  const profiles = id ? readProfiles().filter((profile) => profile.id === id) : readProfiles();
  const one = id ? profiles[0] : undefined;
  const file = buildProfileFile(profiles, id ? [] : getEqualizerUserPresets());
  const baseName = one ? sanitizeFileName(one.name, "sound") : "zuno-sound-profiles";
  return exportJsonFile(
    one ? t("Export \"{name}\"", { name: one.name }) : t("Export sound profiles"),
    `${baseName}.zuno-audio.json`,
    t("Zuno sound profile"),
    file,
  );
}

export interface ProfileImportResult {
  profiles: number;
  presets: number;
  /** The single imported profile, so the caller can offer to apply it. */
  only?: AudioProfile;
}

/** Imports a sound-profile file. Clashing names get a suffix; identical sounds are skipped. */
export async function importAudioProfiles(): Promise<ProfileImportResult | null> {
  const parsed = await importJsonFile(
    t("Import sound profiles"),
    t("Zuno sound profile"),
    parseProfileFile,
    t("That file is not a Zuno sound profile."),
  );
  if (!parsed) return null;

  const profiles = [...readProfiles()];
  const added: AudioProfile[] = [];
  for (const incoming of parsed.profiles) {
    if (profiles.some((existing) => sameProfileSound(existing, incoming) && existing.name === incoming.name)) continue;
    const profile: AudioProfile = {
      ...incoming,
      id: newProfileId(),
      name: uniqueName(incoming.name, profiles.map((existing) => existing.name)),
    };
    profiles.push(profile);
    added.push(profile);
  }
  if (added.length > 0) writeProfiles(profiles);
  const presets = importEqualizerPresets(parsed.equalizerPresets);
  return { profiles: added.length, presets, only: added.length === 1 ? added[0] : undefined };
}

// ---- Output devices (auto EQ per headphone) ------------------------------------------------

/** Stable key for an output device: kind plus lower-cased name. */
export function deviceKey(name: string, kind = "output"): string {
  return `${kind}:${name.trim().toLowerCase()}`;
}

export function profileForDevice(key: string): AudioProfile | undefined {
  const id = readDevices()[key];
  return id ? readProfiles().find((profile) => profile.id === id) : undefined;
}

/** Ties `profileId` to a device, or unties it when `profileId` is null. */
export function setDeviceProfile(key: string, profileId: string | null): void {
  const devices = { ...readDevices() };
  if (profileId) devices[key] = profileId;
  else delete devices[key];
  writeDevices(devices);
}

// ---- Store plumbing ------------------------------------------------------------------------

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
    if (event.key === null || event.key === STORAGE_KEY || event.key === DEVICES_KEY) {
      profilesCached = null;
      devicesCached = null;
    }
  });
}

export async function hydrateAudioProfiles(): Promise<void> {
  await Promise.all([
    hydrateLocalJsonSetting(STORAGE_KEY, isProfileList),
    hydrateLocalJsonSetting(DEVICES_KEY, isDeviceMap),
  ]);
  profilesCached = null;
  devicesCached = null;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAudioProfiles(): AudioProfile[] {
  return useSyncExternalStore(subscribe, readProfiles, () => NO_PROFILES);
}

export function useDeviceProfiles(): Record<string, string> {
  return useSyncExternalStore(subscribe, readDevices, () => NO_DEVICES);
}

/** The saved profile that sounds exactly like what is playing, if any. */
export function useActiveAudioProfile(): AudioProfile | undefined {
  const profiles = useAudioProfiles();
  // Subscribed so the match re-evaluates whenever any part of the sound changes.
  useEqualizer();
  useEqualizerEnabled();
  useAudioEffects();
  useVolumeNormalization();
  if (profiles.length === 0) return undefined;
  const current = captureCurrentSound();
  return profiles.find((profile) => sameProfileSound(profile, current));
}
