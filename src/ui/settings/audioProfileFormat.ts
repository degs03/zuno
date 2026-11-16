// Sound profiles as data: the shape, the file format, and validation. Pure, so it can be checked.
import {
  EQUALIZER_BANDS_HZ,
  snapGain,
  type EqualizerPreset,
  type EqualizerSettings,
} from "./equalizerCurve";
import {
  AUDIO_EFFECTS_NEUTRAL,
  isAudioEffects,
  normalizeAudioEffects,
  type AudioEffects,
} from "./audioEffectsValues";

/** Everything that shapes how a track sounds, captured together so it can be recalled or shared. */
export interface AudioProfile {
  id: string;
  name: string;
  equalizer: EqualizerSettings & { enabled: boolean };
  effects: AudioEffects;
  /** 1 is normal speed. Same limits as `savePlaybackSettings`. */
  playbackRate: number;
  /** Whole semitones. */
  pitchSemitones: number;
  volumeNormalization: boolean;
}

export const AUDIO_PROFILE_FORMAT = "zuno-audio-profile";
/** Bumped only on a breaking shape change; import accepts anything it still understands. */
export const AUDIO_PROFILE_VERSION = 1;
export const AUDIO_PROFILE_NAME_MAX = 32;

export interface AudioProfileFile {
  format: typeof AUDIO_PROFILE_FORMAT;
  version: number;
  exportedAt: string;
  profiles: AudioProfile[];
  /** The user's own EQ presets, so a shared setup carries its curves too. */
  equalizerPresets: EqualizerPreset[];
}

export function clampPlaybackRate(rate: unknown): number {
  const value = typeof rate === "number" && Number.isFinite(rate) ? rate : 1;
  return Math.round(Math.min(4, Math.max(0.25, value)) * 100) / 100;
}

export function clampPitch(semitones: unknown): number {
  const value = typeof semitones === "number" && Number.isFinite(semitones) ? semitones : 0;
  return Math.min(12, Math.max(-12, Math.round(value)));
}

function normalizeCurve(value: unknown): EqualizerSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<EqualizerSettings>;
  if (!Array.isArray(candidate.bandsDb) || candidate.bandsDb.length !== EQUALIZER_BANDS_HZ.length) return null;
  if (!candidate.bandsDb.every((gain) => typeof gain === "number")) return null;
  return {
    preampDb: snapGain(typeof candidate.preampDb === "number" ? candidate.preampDb : 0),
    bandsDb: candidate.bandsDb.map(snapGain),
  };
}

export function newProfileId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validates one profile from storage or a file, clamping every value into range. Missing optional
 * parts fall back to neutral rather than rejecting the profile; a missing or broken EQ curve,
 * or no name, rejects it.
 */
export function normalizeProfile(value: unknown): AudioProfile | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, AUDIO_PROFILE_NAME_MAX) : "";
  if (!name) return null;
  const curve = normalizeCurve(candidate.equalizer);
  if (!curve) return null;
  const equalizerEnabled = (candidate.equalizer as { enabled?: unknown }).enabled;
  return {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : newProfileId(),
    name,
    equalizer: { ...curve, enabled: equalizerEnabled !== false },
    effects: isAudioEffects(candidate.effects) ? normalizeAudioEffects(candidate.effects) : { ...AUDIO_EFFECTS_NEUTRAL },
    playbackRate: clampPlaybackRate(candidate.playbackRate),
    pitchSemitones: clampPitch(candidate.pitchSemitones),
    volumeNormalization: candidate.volumeNormalization === true,
  };
}

export function buildProfileFile(profiles: AudioProfile[], equalizerPresets: EqualizerPreset[]): AudioProfileFile {
  return {
    format: AUDIO_PROFILE_FORMAT,
    version: AUDIO_PROFILE_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
    equalizerPresets,
  };
}

/** Null when `value` is not a Zuno sound-profile file, or holds no usable profile or preset. */
export function parseProfileFile(value: unknown): { profiles: AudioProfile[]; equalizerPresets: EqualizerPreset[] } | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<AudioProfileFile>;
  if (candidate.format !== AUDIO_PROFILE_FORMAT) return null;
  // Malformed entries cost themselves, not the whole file.
  const profiles = (Array.isArray(candidate.profiles) ? candidate.profiles : [])
    .map(normalizeProfile)
    .filter((profile): profile is AudioProfile => profile !== null);
  const equalizerPresets = (Array.isArray(candidate.equalizerPresets) ? candidate.equalizerPresets : [])
    .flatMap((preset: unknown) => {
      const entry = preset as Partial<EqualizerPreset> | null;
      const settings = normalizeCurve(entry?.settings);
      const name = typeof entry?.name === "string" ? entry.name.trim() : "";
      return settings && name ? [{ name, settings }] : [];
    });
  if (profiles.length === 0 && equalizerPresets.length === 0) return null;
  return { profiles, equalizerPresets };
}

/** `name`, or `name (2)`, `name (3)`… — whichever is not in `taken` (case-insensitive). */
export function uniqueName(name: string, taken: readonly string[]): string {
  const lower = new Set(taken.map((entry) => entry.toLowerCase()));
  const base = name.trim().slice(0, AUDIO_PROFILE_NAME_MAX - 4);
  let candidate = base;
  for (let n = 2; lower.has(candidate.toLowerCase()); n += 1) candidate = `${base} (${n})`;
  return candidate;
}

/** Whether two profiles would sound the same (names and ids aside). */
export function sameProfileSound(a: AudioProfile, b: AudioProfile): boolean {
  return a.equalizer.enabled === b.equalizer.enabled
    && a.equalizer.preampDb === b.equalizer.preampDb
    && a.equalizer.bandsDb.every((gain, index) => gain === b.equalizer.bandsDb[index])
    && a.effects.bassDb === b.effects.bassDb
    && a.effects.trebleDb === b.effects.trebleDb
    && a.effects.balance === b.effects.balance
    && a.effects.width === b.effects.width
    && a.playbackRate === b.playbackRate
    && a.pitchSemitones === b.pitchSemitones
    && a.volumeNormalization === b.volumeNormalization;
}
