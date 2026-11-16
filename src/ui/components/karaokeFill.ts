// How much of each word in a lyric line is "sung" at a given progress. Pure, so it can be checked.

/** Splits a line into words, keeping the text exactly as written (spaces are not words). */
export function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Fill fraction (0..1) for each word when `progress` (0..1) of the line has been sung.
 *
 * Progress is spread over the line's characters, not its on-screen width: a line that wraps
 * onto two or three rows then fills word by word, row after row, and reaches every last letter
 * at 100 % — a single gradient across the box filled each row only as far as the same fraction
 * of its width, so a wrapped line never finished.
 */
export function wordFills(words: readonly string[], progress: number): number[] {
  const total = words.reduce((sum, word) => sum + word.length, 0);
  if (total === 0) return words.map(() => 0);
  let sung = Math.max(0, Math.min(1, progress)) * total;
  return words.map((word) => {
    if (word.length === 0) return 1;
    const fill = Math.max(0, Math.min(1, sung / word.length));
    sung -= word.length;
    return fill;
  });
}
