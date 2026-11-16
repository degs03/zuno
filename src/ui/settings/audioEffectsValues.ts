// Tone/stereo effect values: types, limits and normalisation. Pure, so it can be checked.

export interface AudioEffects {
  /** Low shelf, 0..12 dB. */
  bassDb: number;
  /** High shelf, -12..12 dB. */
  trebleDb: number;
  /** -1 (left) .. 1 (right). */
  balance: number;
  /** 0 mono, 1 normal, 2 extra wide. */
  width: number;
}

export const AUDIO_EFFECTS_NEUTRAL: AudioEffects = Object.freeze({ bassDb: 0, trebleDb: 0, balance: 0, width: 1 });

export const AUDIO_EFFECT_LIMITS = {
  bassDb: { min: 0, max: 12, step: 0.5 },
  trebleDb: { min: -12, max: 12, step: 0.5 },
  balance: { min: -1, max: 1, step: 0.05 },
  width: { min: 0, max: 2, step: 0.05 },
} as const satisfies Record<keyof AudioEffects, { min: number; max: number; step: number }>;

export function isAudioEffects(value: unknown): value is AudioEffects {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (Object.keys(AUDIO_EFFECT_LIMITS) as (keyof AudioEffects)[]).every(
    (key) => typeof candidate[key] === "number" && Number.isFinite(candidate[key]),
  );
}

/** Clamps and snaps every field to its control's range and step. */
export function normalizeAudioEffects(effects: AudioEffects): AudioEffects {
  const out = { ...AUDIO_EFFECTS_NEUTRAL };
  for (const key of Object.keys(AUDIO_EFFECT_LIMITS) as (keyof AudioEffects)[]) {
    const { min, max, step } = AUDIO_EFFECT_LIMITS[key];
    const raw = Number.isFinite(effects[key]) ? effects[key] : AUDIO_EFFECTS_NEUTRAL[key];
    const snapped = Math.round(raw / step) * step;
    // Rounded again so 0.1 + 0.2 style noise never reaches storage or a dB readout.
    out[key] = Math.round(Math.min(max, Math.max(min, snapped)) * 100) / 100;
  }
  return out;
}

export function sameAudioEffects(a: AudioEffects, b: AudioEffects): boolean {
  return a.bassDb === b.bassDb && a.trebleDb === b.trebleDb && a.balance === b.balance && a.width === b.width;
}
