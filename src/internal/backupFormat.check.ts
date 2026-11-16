// Self-check for backup files (`npm run check`): only whitelisted settings travel either way.
import { BACKUP_KEYS, buildBackup, parseBackup } from "./backupFormat";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

const store: Record<string, string> = {
  theme: "dark",
  "equalizer-v1": JSON.stringify({ preampDb: 0, bandsDb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
  "youtube-music:selected-account": "secret-account",
  "yt-music-dock.app-session.v1": "{}",
};

const backup = buildBackup((key) => store[key] ?? null, [{ id: "a", title: "A", artist: "X" }], "{\"t\":1}\n");
check(backup.settings.theme === "dark", "a whitelisted setting is included");
check(!("youtube-music:selected-account" in backup.settings), "the account is never exported");
check(!("yt-music-dock.app-session.v1" in backup.settings), "the session is never exported");
check(backup.downloads.length === 1, "downloads travel as a list");

const roundTrip = parseBackup(JSON.parse(JSON.stringify(backup)));
check(roundTrip !== null && roundTrip.settings.theme === "dark", "a backup we wrote parses");

const planted = parseBackup({
  format: "zuno-backup",
  settings: { theme: "light", "youtube-music:selected-account": "evil", "keyboard-shortcuts": 5 },
  downloads: [{ id: "ok", title: "T", artist: "" }, { nope: true }],
});
check(planted !== null, "a minimal file parses");
check(planted!.settings.theme === "light", "known keys are restored");
check(!("youtube-music:selected-account" in planted!.settings), "unknown keys cannot be planted");
check(!("keyboard-shortcuts" in planted!.settings), "non-string values are dropped");
check(planted!.downloads.length === 1, "malformed downloads are dropped");
check(parseBackup({ format: "zuno-audio-profile" }) === null, "other Zuno files are rejected");
check(new Set(BACKUP_KEYS).size === BACKUP_KEYS.length, "no duplicate keys");
// "session-restore-enabled" is an on/off preference, the one allowed "session" key.
check(!BACKUP_KEYS.some((key) => /cookie|token|secret|account|app-session/i.test(key)), "nothing sensitive-looking is whitelisted");

console.log("backupFormat: ok");
