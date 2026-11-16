// Self-check for the personalised EQ curves (`npm run check`).
import { learnedCurve, learnProgress, madeForYouCurve, type EqObservation } from "./personalEqMath";
import { EQUALIZER_BANDS_HZ } from "./equalizerCurve";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

const flat = new Array(10).fill(0);
const bassy = [6, 5, 3, 1, 0, 0, 0, 0, 0, 0];

// Not enough data yet.
check(learnedCurve([{ bandsDb: bassy, weight: 3000 }]) === null, "one song is not enough");
check(learnProgress([{ bandsDb: bassy, weight: 180 }]).songs === 7, "progress counts songs left");

// Mostly bass-heavy listening, some flat: the average leans bass, scaled by time.
const observations: EqObservation[] = [
  ...Array.from({ length: 8 }, () => ({ bandsDb: bassy, weight: 240 })),
  ...Array.from({ length: 2 }, () => ({ bandsDb: flat, weight: 240 })),
];
const learned = learnedCurve(observations);
check(learned !== null, "enough songs and minutes give a curve");
check(learned!.bandsDb[0] === 5 && learned!.bandsDb[9] === 0, `weighted average (got ${learned!.bandsDb})`);
check(learned!.preampDb <= 0, "a boosting curve gets headroom from the preamp");

// All flat: no point in a preset.
check(learnedCurve(Array.from({ length: 10 }, () => ({ bandsDb: flat, weight: 300 }))) === null, "flat taste gives no curve");

// Analysis: a pink-ish (−3 dB/octave) spectrum is "average music", so the curve is ~flat.
const pink = EQUALIZER_BANDS_HZ.map((hz) => -20 - 3 * Math.log2(hz / 1000));
const neutral = madeForYouCurve(Array.from({ length: 8 }, () => pink));
check(neutral !== null && neutral.bandsDb.every((gain) => Math.abs(gain) <= 0.5), `pink spectra give a flat curve (got ${neutral?.bandsDb})`);

// Songs with extra low end: the curve lifts the lows and stays within ±6 dB.
const heavy = pink.map((level, band) => level + (band < 3 ? 8 : 0));
const forYou = madeForYouCurve(Array.from({ length: 8 }, () => heavy))!;
check(forYou.bandsDb[0] > forYou.bandsDb[6], "bass-heavy favourites lift the bass");
check(forYou.bandsDb.every((gain) => Math.abs(gain) <= 6), "never beyond ±6 dB");
check(madeForYouCurve([heavy]) === null, "one song is not enough to analyse");

console.log("personalEqMath: ok");
