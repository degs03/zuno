// Self-check for the karaoke word fill (`npm run check`).
import { splitWords, wordFills } from "./karaokeFill";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

const words = splitWords("  Music into money,   imma never stop working ");
check(words.join("|") === "Music|into|money,|imma|never|stop|working", "words split on any whitespace");

check(wordFills(words, 0).every((fill) => fill === 0), "nothing sung at 0");
check(wordFills(words, 1).every((fill) => fill === 1), "every word complete at 100%, even on a wrapped line");

// Halfway through the characters: the first words are full, the rest empty, one in between.
const half = wordFills(words, 0.5);
const totalChars = words.join("").length;
const sung = half.reduce((sum, fill, index) => sum + fill * words[index].length, 0);
check(Math.abs(sung - totalChars / 2) < 1e-9, "50% progress paints exactly half the letters");
check(half[0] === 1 && half[half.length - 1] === 0, "fills run in reading order");
check(half.filter((fill) => fill > 0 && fill < 1).length <= 1, "at most one word is part-way");

check(wordFills([], 0.5).length === 0, "an empty line has nothing to fill");
check(wordFills(words, 2).every((fill) => fill === 1) && wordFills(words, -1).every((fill) => fill === 0), "progress is clamped");

console.log("karaokeFill: ok");
