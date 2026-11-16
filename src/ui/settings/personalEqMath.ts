// The maths behind the personalised EQ curves. Pure, so it can be checked.
import { autoPreampDb, EQUALIZER_BANDS_HZ, snapGain, type EqualizerSettings } from "./equalizerCurve";

/** The EQ that was on while a liked song played, and for how long. */
export interface EqObservation {
  bandsDb: number[];
  /** Seconds heard. */
  weight: number;
}

export const LEARN_MIN_SONGS = 8;
export const LEARN_MIN_SECONDS = 20 * 60;
export const ANALYSIS_MIN_SONGS = 8;
const MADE_FOR_YOU_MAX_DB = 6;

function withAutoPreamp(bandsDb: number[]): EqualizerSettings {
  const snapped = bandsDb.map(snapGain);
  return { bandsDb: snapped, preampDb: snapGain(autoPreampDb(snapped)) };
}

/**
 * "For you": how you set the EQ while your favourite songs play, averaged by time heard.
 * Null until there is enough to go on (songs and minutes), or when every curve was flat — a
 * flat average would be a preset that does nothing.
 */
export function learnedCurve(observations: readonly EqObservation[]): EqualizerSettings | null {
  const valid = observations.filter((entry) => entry.weight > 0 && entry.bandsDb.length === EQUALIZER_BANDS_HZ.length);
  const totalWeight = valid.reduce((sum, entry) => sum + entry.weight, 0);
  if (valid.length < LEARN_MIN_SONGS || totalWeight < LEARN_MIN_SECONDS) return null;
  const bands = EQUALIZER_BANDS_HZ.map((_, band) =>
    valid.reduce((sum, entry) => sum + entry.bandsDb[band] * entry.weight, 0) / totalWeight);
  if (bands.every((gain) => Math.abs(gain) < 0.25)) return null;
  return withAutoPreamp(bands);
}

/** How many more liked songs (and minutes) "For you" still needs. */
export function learnProgress(observations: readonly EqObservation[]): { songs: number; minutes: number } {
  const totalWeight = observations.reduce((sum, entry) => sum + entry.weight, 0);
  return {
    songs: Math.max(0, LEARN_MIN_SONGS - observations.length),
    minutes: Math.max(0, Math.ceil((LEARN_MIN_SECONDS - totalWeight) / 60)),
  };
}

/**
 * "Made for you": a gentle curve that leans into the sound of the songs you like.
 *
 * Each liked song's measured band levels are averaged. Typical music falls off at about
 * 3 dB per octave (pink-ish), so that slope is removed first — otherwise every curve would
 * just be "more bass". What is left is what makes *your* music different from average music;
 * half of that, centred and capped at ±6 dB and smoothed between neighbours, becomes the curve.
 * Null with fewer than `ANALYSIS_MIN_SONGS` measured songs.
 */
export function madeForYouCurve(spectra: readonly number[][]): EqualizerSettings | null {
  const valid = spectra.filter((bands) => bands.length === EQUALIZER_BANDS_HZ.length && bands.every(Number.isFinite));
  if (valid.length < ANALYSIS_MIN_SONGS) return null;
  const average = EQUALIZER_BANDS_HZ.map((_, band) => valid.reduce((sum, bands) => sum + bands[band], 0) / valid.length);
  const deviation = average.map((level, band) => level + 3 * Math.log2(EQUALIZER_BANDS_HZ[band] / 1000));
  const mean = deviation.reduce((sum, value) => sum + value, 0) / deviation.length;
  const centred = deviation.map((value) => value - mean);
  const smoothed = centred.map((value, band) => {
    const left = centred[band - 1] ?? value;
    const right = centred[band + 1] ?? value;
    return 0.25 * left + 0.5 * value + 0.25 * right;
  });
  const curve = smoothed.map((value) => Math.max(-MADE_FOR_YOU_MAX_DB, Math.min(MADE_FOR_YOU_MAX_DB, value * 0.5)));
  return withAutoPreamp(curve);
}
