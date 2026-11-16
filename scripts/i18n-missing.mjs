/**
 * Lists the t("…") strings a catalog is still missing, as JSON, so they can be translated.
 *
 *   node scripts/i18n-missing.mjs            # counts per language
 *   node scripts/i18n-missing.mjs es         # the missing English keys for one language
 *   node scripts/i18n-missing.mjs --all      # every key in use (to prune unused ones)
 *
 * Needs Node 22.6+ (imports the TypeScript extractor directly).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const { extractKeys } = await import(pathToFileURL(join(ROOT, "src/i18n/extract.ts")).href);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "i18n" ? [] : walk(path);
    return /\.(tsx?|mts)$/.test(name) && !name.endsWith(".check.ts") ? [path] : [];
  });
}

const keys = new Set();
for (const file of walk(join(ROOT, "src"))) for (const key of extractKeys(readFileSync(file, "utf8"))) keys.add(key);

function catalogKeys(code) {
  // Catalog files are `"source": "translation",` lines; read the keys without executing TS.
  const text = readFileSync(join(ROOT, `src/i18n/locales/${code}.ts`), "utf8");
  return new Set([...text.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:/gm)].map((match) => JSON.parse(match[1])));
}

const languages = ["es", "pt-BR", "fr", "de", "it"];
const only = process.argv[2];
if (only === "--all") {
  // Every key the code uses, for pruning catalogs.
  console.log(JSON.stringify([...keys], null, 2));
} else if (only) {
  const have = catalogKeys(only);
  console.log(JSON.stringify([...keys].filter((key) => !have.has(key)), null, 2));
} else {
  for (const code of languages) {
    const have = catalogKeys(code);
    console.log(`${code}: ${[...keys].filter((key) => !have.has(key)).length} missing of ${keys.size}`);
  }
}
