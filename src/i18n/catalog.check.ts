// Every t("…") in the app must exist in every catalog, with the same {placeholders}
// (`npm run check`). A missing entry would silently show English in that language.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractKeys, placeholders } from "./extract";
import { resolveLanguage, tn } from ".";
import es from "./locales/es";
import ptBR from "./locales/pt-BR";
import fr from "./locales/fr";
import de from "./locales/de";
import it from "./locales/it";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "i18n" ? [] : walk(path);
    return /\.(tsx?|mts)$/.test(name) && !name.endsWith(".check.ts") ? [path] : [];
  });
}

const keys = new Set<string>();
for (const file of walk(join(process.cwd(), "src"))) {
  for (const key of extractKeys(readFileSync(file, "utf8"))) keys.add(key);
}

const catalogs = { es, "pt-BR": ptBR, fr, de, it };
const problems: string[] = [];
for (const [code, catalog] of Object.entries(catalogs)) {
  const missing = [...keys].filter((key) => !(key in catalog));
  if (missing.length) problems.push(`${code}: ${missing.length} missing, e.g. ${JSON.stringify(missing.slice(0, 5))}`);
  for (const [source, translated] of Object.entries(catalog)) {
    if (placeholders(source).join() !== placeholders(translated).join()) {
      problems.push(`${code}: placeholders differ for ${JSON.stringify(source)} → ${JSON.stringify(translated)}`);
    }
    if (!translated.trim()) problems.push(`${code}: empty translation for ${JSON.stringify(source)}`);
  }
}

// Extraction and language matching sanity.
const sample = extractKeys(`t("Hi {name}"); tn('{n} song', "{n} songs", x); item.t("no"); alert("no"); t("Say \\"hi\\""); msg("Marked")`);
if (sample.join("|") !== 'Hi {name}|Say "hi"|Marked|{n} song|{n} songs') problems.push(`extractKeys broken: ${sample.join("|")}`);
if (resolveLanguage(["es-AR"]) !== "es") problems.push("es-AR should resolve to es");
if (resolveLanguage(["pt-PT", "en"]) !== "pt-BR") problems.push("pt-PT should fall back to pt-BR");
if (resolveLanguage(["ja"]) !== "en") problems.push("unsupported languages fall back to English");
if (tn("{n} song", "{n} songs", 1) !== "1 song" || tn("{n} song", "{n} songs", 3) !== "3 songs") problems.push("tn plural selection broken");

if (problems.length) throw new Error(`FAILED:\n${problems.join("\n")}`);
console.log(`i18n catalogs: ok (${keys.size} strings × ${Object.keys(catalogs).length} languages)`);
