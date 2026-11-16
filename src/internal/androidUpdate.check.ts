// Self-check for the Android update manifest (`npm run check`).
import { isNewerVersion, parseAndroidManifest, pickApk } from "./androidUpdate";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

const sha = "a".repeat(64);
const manifest = parseAndroidManifest(JSON.stringify({
  version: "v1.6.0",
  versionCode: 1006000,
  notes: "New",
  apks: {
    arm64: { url: "https://github.com/me/zuno/releases/download/v1.6.0/a.apk", sha256: sha },
    armv7: { url: "http://insecure.example/b.apk", sha256: sha },
    x86: { url: "https://github.com/x.apk", sha256: "nothex" },
  },
}));
check(manifest !== null, "a valid manifest parses");
check(manifest!.version === "1.6.0", "a leading v is dropped");
check(Object.keys(manifest!.apks).join() === "arm64", "insecure URLs and bad checksums are dropped");
check(pickApk(manifest!, "arm64") !== null, "the matching ABI is picked");
check(pickApk(manifest!, "armv7") === null, "no APK for an ABI that was not published");

check(parseAndroidManifest("not json") === null, "garbage is rejected");
check(parseAndroidManifest(JSON.stringify({ version: "latest", apks: {} })) === null, "a non-numeric version is rejected");

check(isNewerVersion("1.5.0", "1.6.0"), "1.6.0 is newer than 1.5.0");
check(isNewerVersion("1.5.9", "1.10.0"), "versions compare numerically, not as text");
check(!isNewerVersion("1.6.0", "1.6.0"), "same version is not an update");
check(!isNewerVersion("2.0.0", "1.9.9"), "older is not an update");

console.log("androidUpdate: ok");
