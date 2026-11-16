// Finds the English source strings passed to t()/tn() in a source file. Pure; used by the
// catalog check and by scripts/i18n-missing.mjs.

/** A JS string literal body (double or single quoted) with its escapes decoded. */
function decode(body: string): string {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, escape: string) => {
    if (escape.startsWith("u{")) return String.fromCodePoint(parseInt(escape.slice(2, -1), 16));
    if (escape.startsWith("u") || escape.startsWith("x")) return String.fromCharCode(parseInt(escape.slice(1), 16));
    return ({ n: "\n", t: "\t", r: "\r" } as Record<string, string>)[escape] ?? escape;
  });
}

const LITERAL = String.raw`"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'`;
// `t(` / `msg(` not preceded by an identifier character or a dot (so `.t(`, `set(` and `alert(` never match).
const T_CALL = new RegExp(String.raw`(?<![\w$.])(?:t|msg)\(\s*(?:${LITERAL})`, "g");
const TN_CALL = new RegExp(String.raw`(?<![\w$.])tn\(\s*(?:${LITERAL})\s*,\s*(?:${LITERAL})`, "g");

export function extractKeys(source: string): string[] {
  const keys: string[] = [];
  for (const match of source.matchAll(T_CALL)) keys.push(decode(match[1] ?? match[2]));
  for (const match of source.matchAll(TN_CALL)) {
    keys.push(decode(match[1] ?? match[2]));
    keys.push(decode(match[3] ?? match[4]));
  }
  return keys;
}

export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}
