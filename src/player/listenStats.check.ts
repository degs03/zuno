// Self-check for listening statistics (`npm run check`).
import { computeListenStats, formatListeningTime, parseListenLog, splitArtists, type Listen } from "./listenStats";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  check(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const now = new Date(2026, 10, 16, 20, 0, 0);
const at = (daysAgo: number, hour = 12) => {
  const date = new Date(now);
  date.setDate(now.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
};

const listens: Listen[] = [
  { t: at(0, 9), id: "a", title: "Song A", artist: "Ana", sec: 200 },
  { t: at(0, 21), id: "a", title: "Song A", artist: "Ana", sec: 180 },
  { t: at(1), id: "b", title: "Song B", artist: "Ana, Beto", sec: 240 },
  { t: at(2), id: "c", title: "Song C", artist: "Caro", sec: 20 }, // too short: not counted
  { t: at(2), id: "c", title: "Song C", artist: "Caro", sec: 100 },
  { t: at(40), id: "d", title: "Old", artist: "Dani", sec: 300 },
];

const week = computeListenStats(listens, "week", now);
equal(week.plays, 4, "short listens and old listens are excluded from the week");
equal(week.totalSeconds, 720, "seconds add up");
equal(week.topTracks[0].key, "a", "most played track first");
equal(week.topTracks[0].plays, 2, "two plays of A");
equal(week.topArtists[0].label, "Ana", "Ana leads (A twice, B once)");
equal(week.topArtists[0].plays, 3, "a shared credit counts for each artist");
equal(week.uniqueArtists, 3, "Ana, Beto, Caro");
equal(week.daily.length, 7, "one bar per day of the week");
equal(week.daily[6].seconds, 380, "today's bar is today's listening");
equal(week.streakDays, 3, "today, yesterday and the day before");
equal(week.hours[9], 200, "listening lands in its hour");

const all = computeListenStats(listens, "all", now);
equal(all.plays, 5, "everything that counts, at any age");

// Log parsing survives junk and torn lines.
const text = `${JSON.stringify(listens[0])}\n{"broken":\n\n${JSON.stringify({ t: 1, id: "x", sec: -5 })}\n${JSON.stringify(listens[1])}`;
equal(parseListenLog(text).length, 2, "only well-formed positive listens are read");

equal(splitArtists("Ana feat. Beto & Caro").join("|"), "Ana|Beto|Caro", "feat. and & split credits");
equal(formatListeningTime(45 * 60), "45 min", "minutes");
equal(formatListeningTime(200 * 60), "3 h 20 min", "hours and minutes");

console.log("listenStats: ok");
