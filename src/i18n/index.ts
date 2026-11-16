import { useSyncExternalStore } from "react";

/**
 * Interface translation.
 *
 * The English text itself is the key (gettext style): `t("Sign in")`. That keeps every call
 * site readable, lets files be migrated one at a time, and means a missing translation simply
 * shows English rather than a raw key. Catalogs map English → target text and are loaded on
 * demand, so only the active language is ever downloaded.
 *
 *   t("Saved \"{name}\"", { name })      interpolation
 *   tn("{n} song", "{n} songs", count)   singular/plural, by the active language's rules
 *
 * `src/i18n/catalog.check.ts` fails the build when a `t("…")` has no entry in a catalog, or
 * when a translation drops or invents a `{placeholder}`.
 */

export type Catalog = Record<string, string>;
export type LanguageCode = "en" | "es" | "pt-BR" | "fr" | "de" | "it";
export type LanguageSetting = "auto" | LanguageCode;

export const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
];

const LOADERS: Record<Exclude<LanguageCode, "en">, () => Promise<{ default: Catalog }>> = {
  es: () => import("./locales/es"),
  "pt-BR": () => import("./locales/pt-BR"),
  fr: () => import("./locales/fr"),
  de: () => import("./locales/de"),
  it: () => import("./locales/it"),
};

const STORAGE_KEY = "app-language-v1";
const CHANGE_EVENT = "app-language-change";

let setting: LanguageSetting = readSetting();
let locale: LanguageCode = "en";
let catalog: Catalog = {};
let version = 0;

function readSetting(): LanguageSetting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as unknown) : "auto";
    return value === "auto" || LANGUAGES.some((language) => language.code === value) ? (value as LanguageSetting) : "auto";
  } catch {
    return "auto";
  }
}

/** The closest supported language to the system's: es-AR → es, pt-PT → pt-BR, anything else → en. */
export function resolveLanguage(preferred: readonly string[]): LanguageCode {
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    const exact = LANGUAGES.find((language) => language.code.toLowerCase() === lower);
    if (exact) return exact.code;
    const base = lower.split("-")[0];
    const byBase = LANGUAGES.find((language) => language.code.toLowerCase().split("-")[0] === base);
    if (byBase) return byBase.code;
  }
  return "en";
}

function systemLanguages(): string[] {
  if (typeof navigator === "undefined") return ["en"];
  return navigator.languages?.length ? [...navigator.languages] : [navigator.language || "en"];
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(typeof vars[name] === "number" ? formatNumber(vars[name] as number) : vars[name]) : match);
}

/** Translates `text` (the English source) into the active language. */
export function t(text: string, vars?: Record<string, string | number>): string {
  return interpolate(catalog[text] ?? text, vars);
}

/**
 * Marks a string for translation without translating it yet: for tables built at module load
 * (settings search entries, menu definitions) that must stay English as data and are passed
 * through `t()` when shown. The catalog check collects `msg("…")` like `t("…")`.
 */
export function msg(text: string): string {
  return text;
}

/** Singular or plural English source, chosen by the active language's plural rules. `{n}` is the count. */
export function tn(one: string, other: string, count: number, vars?: Record<string, string | number>): string {
  let form: Intl.LDMLPluralRule = "other";
  try {
    form = new Intl.PluralRules(locale).select(count);
  } catch {
    form = count === 1 ? "one" : "other";
  }
  return t(form === "one" ? one : other, { n: count, ...vars });
}

export function getLocale(): LanguageCode {
  return locale;
}

export function getLanguageSetting(): LanguageSetting {
  return setting;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}

export function formatDate(date: Date | number, options?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString(locale, options);
}

export function formatTime(date: Date | number, options?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleTimeString(locale, options);
}

export function relativeTimeFormat(options?: Intl.RelativeTimeFormatOptions): Intl.RelativeTimeFormat {
  return new Intl.RelativeTimeFormat(locale, options);
}

async function load(next: LanguageCode): Promise<void> {
  const nextCatalog = next === "en" ? {} : (await LOADERS[next]()).default;
  locale = next;
  catalog = nextCatalog;
  version += 1;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Loads the language the user chose (or the system's). Awaited before the first render. */
export async function initI18n(): Promise<void> {
  setting = readSetting();
  try {
    await load(setting === "auto" ? resolveLanguage(systemLanguages()) : setting);
  } catch {
    await load("en");
  }
}

export async function setLanguage(next: LanguageSetting): Promise<void> {
  setting = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The choice still applies for this session.
  }
  // Durable copy, like every other setting (imported lazily to keep this module dependency-free).
  void import("../internal/appSettings").then(({ setAppSetting }) => setAppSetting(STORAGE_KEY, next));
  await load(next === "auto" ? resolveLanguage(systemLanguages()) : next);
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

/**
 * Re-renders the component when the language changes and returns `t`. Components call
 * `const t = useT()` so a language switch repaints them without a reload.
 */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return t;
}

/** The active language, reactive. */
export function useLocale(): LanguageCode {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return locale;
}

export function useLanguageSetting(): LanguageSetting {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return setting;
}
