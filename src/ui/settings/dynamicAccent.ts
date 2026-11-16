import { invoke } from "@tauri-apps/api/core";
import { getArtworkUrlCandidates, artworkIdentity } from "../../datasource/youtube/artwork";
import { tauriFetch } from "../../datasource/youtube/tauriFetch";
import { isOfflineModeOn } from "../../internal/connectivity";
import { logInternalWarn } from "../../internal/logging";
import { getOfflineArtworkTrackId } from "../../player/offlineStore";
import { pickAccentColor } from "./accentFromImage";
import { readAccent, setDynamicAccentColor } from "./appearance";
import { resolveTheme } from "./theme";

/**
 * The "From cover" accent: every time the song changes, the accent becomes that cover's
 * colour — buttons, the nav pill, progress bars, the Android widget and notification.
 *
 * The cover is fetched as bytes (through Rust, or from disk for downloads) rather than read off
 * an <img>: covers come from other origins, and a canvas that drew one would be tainted and
 * refuse to give its pixels back. Results are cached per cover, so an album plays through on
 * one computation.
 */
const cache = new Map<string, string | null>();
const MAX_CACHE = 200;
let currentArtwork: string | undefined;

async function coverBlob(artworkUrl: string): Promise<Blob | null> {
  const offlineId = getOfflineArtworkTrackId(artworkUrl);
  if (offlineId) {
    const artwork = await invoke<{ mimeType: string; dataBase64: string } | null>("offline_artwork", { trackId: offlineId });
    if (!artwork) return null;
    const bytes = Uint8Array.from(atob(artwork.dataBase64), (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: artwork.mimeType });
  }
  if (isOfflineModeOn() || !artworkUrl.startsWith("http")) return null;
  // 120 px is plenty for a colour and cheap to fetch.
  const url = getArtworkUrlCandidates(artworkUrl, 120)[0] ?? artworkUrl;
  const response = await tauriFetch(url, { headers: { Accept: "image/*" } });
  return response.ok ? response.blob() : null;
}

async function colourOf(artworkUrl: string, light: boolean): Promise<string | null> {
  const key = `${artworkIdentity(artworkUrl)}|${light ? "l" : "d"}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const blob = await coverBlob(artworkUrl);
  if (!blob) return null;
  const bitmap = await createImageBitmap(blob, { resizeWidth: 32, resizeHeight: 32, resizeQuality: "low" });
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, 32, 32);
  bitmap.close();
  const hex = pickAccentColor(context.getImageData(0, 0, 32, 32).data, { light });
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, hex);
  return hex;
}

/** Call on every track change (and when the accent or theme changes). */
export function updateDynamicAccent(artworkUrl: string | undefined): void {
  currentArtwork = artworkUrl;
  if (readAccent() !== "dynamic") return;
  if (!artworkUrl) {
    setDynamicAccentColor(null);
    return;
  }
  const light = resolveTheme() === "light";
  void colourOf(artworkUrl, light)
    .then((hex) => {
      // A newer track may have started while this cover was being read.
      if (currentArtwork === artworkUrl) setDynamicAccentColor(hex);
    })
    .catch((error: unknown) => {
      logInternalWarn("dynamicAccent failed", { error: String(error) });
    });
}

let started = false;

/** Follows the player. Idempotent; called once from App. */
export function startDynamicAccent(
  subscribe: (listener: () => void) => () => void,
  readArtwork: () => string | undefined,
): void {
  if (started) return;
  started = true;
  let last: string | undefined;
  const sync = () => {
    const artwork = readArtwork();
    if (artwork === last) return;
    last = artwork;
    updateDynamicAccent(artwork);
  };
  subscribe(sync);
  sync();
  // Switching to "From cover", or flipping the theme, recomputes for the current song.
  window.addEventListener("appearance-change", () => updateDynamicAccent(currentArtwork));
  window.addEventListener("theme-change", () => updateDynamicAccent(currentArtwork));
}
