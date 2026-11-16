import { invoke } from "@tauri-apps/api/core";

/**
 * Save/open dialogs for Zuno's own JSON exports (playlists, sound profiles, backups).
 *
 * Rust shows the dialog and does the I/O (`export_text_file` / `import_text_file`), so no path
 * ever travels from the webview. On Android the dialog returns a `content://` URI, which Rust
 * opens through tauri-plugin-fs; the returned `path` is then that URI, not a filesystem path.
 */

export function sanitizeFileName(name: string, fallback = "zuno"): string {
  /*
   * Replaces only what a filesystem actually rejects.
   *
   * The class is written out member by member on purpose. The obvious `[<>:"/\\|?* -]` reads
   * as "...asterisk, space, dash", but a regex parses `* -` as the *range* 0x2A-0x2D: it
   * quietly matched `+` and `,` and never matched a space at all. Accidental ranges inside a
   * character class are easy to write and invisible once written.
   *
   * Spaces are legal in filenames and kept, since mangling them only makes the suggested name
   * harder to recognise. Trailing dots and spaces go because Windows drops them silently,
   * which would mean the file saved under a different name than the one shown.
   */
  return name
    .replace(/[<>:"?*|\\/\\\\]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    || fallback;
}

/** Last path segment of a dialog result, decoding Android's `content://…%2Fname.ext` form. */
export function pickedFileName(path: string): string {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Keep the raw string: a stray `%` in a desktop filename is legal.
  }
  return decoded.split(/[\\/:]/).pop() ?? decoded;
}

export interface TextFileFormat {
  name: string;
  extensions: string[];
  contents: string;
}

/** Shows a save dialog and writes one of `formats`. Null when the user cancels. */
export async function saveTextFile(
  title: string,
  fileName: string,
  formats: TextFileFormat[],
): Promise<{ path: string; format: number } | null> {
  return invoke<{ path: string; format: number } | null>("export_text_file", { title, fileName, formats });
}

/** Shows an open dialog and reads the chosen text file (16 MB cap). Null when cancelled. */
export async function openTextFile(
  title: string,
  filterName: string,
  extensions: string[],
): Promise<{ path: string; contents: string } | null> {
  return invoke<{ path: string; contents: string } | null>("import_text_file", { title, filterName, extensions });
}

/** Writes `payload` as pretty JSON. Returns the saved path/URI, or null when cancelled. */
export async function exportJsonFile(
  title: string,
  fileName: string,
  filterName: string,
  payload: unknown,
): Promise<string | null> {
  const saved = await saveTextFile(title, fileName, [
    { name: filterName, extensions: ["json"], contents: JSON.stringify(payload, null, 2) },
  ]);
  return saved?.path ?? null;
}

/**
 * Opens a JSON file and hands the parsed value to `parse`, which returns null for a file it does
 * not recognise. Throws `notRecognised` for unreadable or unrecognised files; null on cancel.
 */
export async function importJsonFile<T>(
  title: string,
  filterName: string,
  parse: (value: unknown) => T | null,
  notRecognised: string,
): Promise<T | null> {
  const opened = await openTextFile(title, filterName, ["json"]);
  if (!opened) return null;
  let value: unknown;
  try {
    value = JSON.parse(opened.contents);
  } catch {
    throw new Error(notRecognised);
  }
  const parsed = parse(value);
  if (parsed === null) throw new Error(notRecognised);
  return parsed;
}
