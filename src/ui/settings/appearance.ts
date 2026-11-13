import { useSyncExternalStore } from "react";
import { getAppSetting, setAppSetting } from "../../internal/appSettings";

/**
 * Accent colour and visual style. Same shape as `theme.ts`: localStorage for a correct first
 * paint, the durable app setting as the source of truth, an event for React subscribers.
 *
 * Both are plain attributes on <html> (`data-accent`, `data-style`) that global.css turns into
 * token overrides — no component knows either exists. The one exception is a custom accent,
 * which has no stylesheet entry and is written straight onto the root as variables.
 */

export type AccentId = "zuno" | "ocean" | "violet" | "mint" | "sunset" | "rose" | "mono" | "custom";
export type StylePreset = "zuno" | "glass" | "ios" | "solid";

export const ACCENTS: ReadonlyArray<{ id: Exclude<AccentId, "custom">; label: string; swatch: string }> = [
  { id: "zuno", label: "Zuno red", swatch: "#e8002e" },
  { id: "ocean", label: "Ocean", swatch: "#2563eb" },
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
  { id: "mint", label: "Mint", swatch: "#047857" },
  { id: "sunset", label: "Sunset", swatch: "#c2410c" },
  { id: "rose", label: "Rose", swatch: "#be185d" },
  { id: "mono", label: "Graphite", swatch: "#52525b" },
];

export const STYLES: ReadonlyArray<{ id: StylePreset; label: string; hint: string }> = [
  { id: "zuno", label: "Zuno", hint: "Soft cards with a subtle lift." },
  { id: "glass", label: "Glass", hint: "Frosted, see-through panels." },
  { id: "ios", label: "Rounded", hint: "Big corners and grouped lists, iPhone-like." },
  { id: "solid", label: "Solid", hint: "Flat and high-contrast, no shadows." },
];

const ACCENT_KEY = "appearance-accent";
const CUSTOM_KEY = "appearance-accent-custom";
const STYLE_KEY = "appearance-style";
const CHANGE_EVENT = "appearance-change";
const DEFAULT_CUSTOM = "#e8002e";

const isAccent = (value: unknown): value is AccentId =>
  value === "custom" || ACCENTS.some((accent) => accent.id === value);
const isStyle = (value: unknown): value is StylePreset => STYLES.some((style) => style.id === value);
const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

function readLocal<T>(key: string, guard: (value: unknown) => value is T, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return guard(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The durable app setting still gets the write.
  }
}

export const readAccent = () => readLocal(ACCENT_KEY, isAccent, "zuno" as AccentId);
export const readCustomAccent = () => readLocal(CUSTOM_KEY, isHex, DEFAULT_CUSTOM);
export const readStyle = () => readLocal(STYLE_KEY, isStyle, "zuno" as StylePreset);

/** White or near-black, whichever reads better on `hex` (WCAG relative luminance). */
function foregroundFor(hex: string): string {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return (1.05) / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? "#ffffff" : "#111111";
}

export function applyAppearance(): void {
  const root = document.documentElement;
  const accent = readAccent();
  root.setAttribute("data-accent", accent);
  root.setAttribute("data-style", readStyle());
  if (accent === "custom") {
    const hex = readCustomAccent();
    root.style.setProperty("--color-primary", hex);
    root.style.setProperty("--color-ring", hex);
    root.style.setProperty("--color-primary-foreground", foregroundFor(hex));
  } else {
    root.style.removeProperty("--color-primary");
    root.style.removeProperty("--color-ring");
    root.style.removeProperty("--color-primary-foreground");
  }
}

function commit(key: string, value: string): void {
  writeLocal(key, value);
  applyAppearance();
  window.dispatchEvent(new Event(CHANGE_EVENT));
  void setAppSetting(key, value);
}

export const setAccent = (accent: AccentId) => commit(ACCENT_KEY, accent);
export const setStyle = (style: StylePreset) => commit(STYLE_KEY, style);
export function setCustomAccent(hex: string): void {
  if (!isHex(hex)) return;
  writeLocal(CUSTOM_KEY, hex);
  commit(ACCENT_KEY, "custom");
  void setAppSetting(CUSTOM_KEY, hex);
}

export async function hydrateAppearance(): Promise<void> {
  const [accent, custom, style] = await Promise.all([
    getAppSetting<unknown>(ACCENT_KEY),
    getAppSetting<unknown>(CUSTOM_KEY),
    getAppSetting<unknown>(STYLE_KEY),
  ]);
  if (isAccent(accent)) writeLocal(ACCENT_KEY, accent);
  if (isHex(custom)) writeLocal(CUSTOM_KEY, custom);
  if (isStyle(style)) writeLocal(STYLE_KEY, style);
  applyAppearance();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

export const useAccent = () => useSyncExternalStore(subscribe, readAccent, () => "zuno" as AccentId);
export const useCustomAccent = () => useSyncExternalStore(subscribe, readCustomAccent, () => DEFAULT_CUSTOM);
export const useStyle = () => useSyncExternalStore(subscribe, readStyle, () => "zuno" as StylePreset);
