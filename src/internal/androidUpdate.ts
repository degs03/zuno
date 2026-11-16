// The Android update manifest (`android-latest.json`): parsing and choosing an APK. Pure, so it can be checked.

export interface AndroidApk {
  url: string;
  sha256: string;
}

export interface AndroidManifest {
  version: string;
  versionCode?: number;
  notes?: string;
  apks: Record<string, AndroidApk>;
}

export function parseAndroidManifest(text: string): AndroidManifest | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<AndroidManifest>;
  if (typeof candidate.version !== "string" || !/^\d+(\.\d+){1,3}$/.test(candidate.version.replace(/^v/, ""))) return null;
  if (typeof candidate.apks !== "object" || candidate.apks === null) return null;
  const apks: Record<string, AndroidApk> = {};
  for (const [abi, apk] of Object.entries(candidate.apks)) {
    const entry = apk as Partial<AndroidApk> | null;
    if (
      typeof entry?.url === "string" && entry.url.startsWith("https://")
      && typeof entry.sha256 === "string" && /^[0-9a-f]{64}$/i.test(entry.sha256)
    ) {
      apks[abi] = { url: entry.url, sha256: entry.sha256.toLowerCase() };
    }
  }
  if (Object.keys(apks).length === 0) return null;
  return {
    version: candidate.version.replace(/^v/, ""),
    versionCode: typeof candidate.versionCode === "number" ? candidate.versionCode : undefined,
    notes: typeof candidate.notes === "string" ? candidate.notes : undefined,
    apks,
  };
}

/** The APK for this device: its own ABI, else a universal build if one was published. */
export function pickApk(manifest: AndroidManifest, abi: string): AndroidApk | null {
  return manifest.apks[abi] ?? manifest.apks.universal ?? null;
}

export function isNewerVersion(installed: string, candidate: string): boolean {
  const a = installed.replace(/^v/, "").split(".").map(Number);
  const b = candidate.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false;
}
