// Self-check for sound-profile files (`npm run check`): round-trips, clamping, and rejection.
import {
  buildProfileFile,
  normalizeProfile,
  parseProfileFile,
  sameProfileSound,
  uniqueName,
  type AudioProfile,
} from "./audioProfileFormat";
import { normalizeAudioEffects } from "./audioEffectsValues";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  check(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const profile: AudioProfile = {
  id: "abc",
  name: "Bus ride",
  equalizer: { enabled: true, preampDb: -3, bandsDb: [4, 3, 1, 0, 0, 0, 1, 2, 3, 2] },
  effects: { bassDb: 6, trebleDb: -1.5, balance: 0.1, width: 1.3 },
  playbackRate: 1.25,
  pitchSemitones: -2,
  volumeNormalization: true,
};

// Round trip through JSON text, exactly like a file on disk.
const text = JSON.stringify(buildProfileFile([profile], [{ name: "Mine", settings: { preampDb: 0, bandsDb: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] } }]));
const parsed = parseProfileFile(JSON.parse(text));
check(parsed !== null, "a file we wrote must parse");
equal(parsed!.profiles.length, 1, "one profile back");
check(sameProfileSound(parsed!.profiles[0], profile), "the profile must sound the same after a round trip");
equal(parsed!.profiles[0].name, "Bus ride", "name survives");
equal(parsed!.equalizerPresets.length, 1, "EQ presets travel with the file");

// Out-of-range values are clamped, not rejected.
const wild = normalizeProfile({
  name: "  Loud  ",
  equalizer: { preampDb: 40, bandsDb: [99, -99, 0.26, 0, 0, 0, 0, 0, 0, 0] },
  effects: { bassDb: 50, trebleDb: -50, balance: 9, width: -1 },
  playbackRate: 99,
  pitchSemitones: 3.6,
});
check(wild !== null, "a profile with wild values is clamped, not dropped");
equal(wild!.name, "Loud", "names are trimmed");
equal(wild!.equalizer.preampDb, 12, "preamp clamps to +12");
equal(wild!.equalizer.bandsDb[0], 12, "band clamps to +12");
equal(wild!.equalizer.bandsDb[1], -12, "band clamps to -12");
equal(wild!.equalizer.bandsDb[2], 0.5, "bands snap to 0.5 dB");
equal(wild!.effects.bassDb, 12, "bass clamps");
equal(wild!.effects.trebleDb, -12, "treble clamps");
equal(wild!.effects.balance, 1, "balance clamps");
equal(wild!.effects.width, 0, "width clamps");
equal(wild!.playbackRate, 4, "speed clamps to 4x");
equal(wild!.pitchSemitones, 4, "pitch rounds to whole semitones");
equal(wild!.equalizer.enabled, true, "EQ switch defaults on");
equal(wild!.volumeNormalization, false, "normalisation defaults off");

// Missing effects fall back to neutral.
const plain = normalizeProfile({ name: "Old", equalizer: { preampDb: 0, bandsDb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } });
equal(plain!.effects.width, 1, "missing effects are neutral");

// Rejections.
equal(parseProfileFile({ format: "zuno-playlist", profiles: [profile] }), null, "a playlist file is not a profile file");
equal(parseProfileFile(null), null, "null is not a file");
equal(parseProfileFile({ format: "zuno-audio-profile", profiles: [] }), null, "an empty file has nothing to import");
equal(normalizeProfile({ name: "", equalizer: profile.equalizer }), null, "a nameless profile is dropped");
equal(normalizeProfile({ name: "x", equalizer: { preampDb: 0, bandsDb: [1, 2] } }), null, "a short curve is dropped");
const mixed = parseProfileFile({ format: "zuno-audio-profile", profiles: [profile, { name: "bad" }] });
equal(mixed!.profiles.length, 1, "one bad entry costs only itself");

// Names.
equal(uniqueName("Rock", ["rock"]), "Rock (2)", "clash gets a suffix");
equal(uniqueName("Rock", ["Rock", "Rock (2)"]), "Rock (3)", "suffix keeps counting");
equal(uniqueName("Jazz", ["Rock"]), "Jazz", "no clash, no suffix");

// Effects snapping never leaks float noise.
equal(normalizeAudioEffects({ bassDb: 0.1 + 0.2, trebleDb: 0, balance: 0.07, width: 1 }).balance, 0.05, "balance snaps to its step");

console.log("audioProfileFormat: ok");
