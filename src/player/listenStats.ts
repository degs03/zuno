import { t } from "../i18n";
// Listening statistics from the listen log. Pure, so it can be checked.

/** One finished listen, as stored in `listen-log-v1.jsonl`. */
export interface Listen {
  /** Unix seconds when the listen ended. */
  t: number;
  /** Track id. */
  id: string;
  title: string;
  artist: string;
  /** Seconds actually heard (pauses excluded). */
  sec: number;
  artworkUrl?: string;
}

/** A listen only counts once this much of a song was heard — the same bar scrobbling uses. */
export const MIN_LISTEN_SEC = 30;

export function parseListenLog(text: string): Listen[] {
  const listens: Listen[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as Partial<Listen>;
      if (
        typeof value.t === "number" && typeof value.id === "string" && typeof value.sec === "number"
        && Number.isFinite(value.t) && Number.isFinite(value.sec) && value.sec > 0
      ) {
        listens.push({
          t: value.t,
          id: value.id,
          title: typeof value.title === "string" ? value.title : value.id,
          artist: typeof value.artist === "string" ? value.artist : "",
          sec: value.sec,
          artworkUrl: typeof value.artworkUrl === "string" ? value.artworkUrl : undefined,
        });
      }
    } catch {
      // A torn last line (app killed mid-write) costs one listen, not the log.
    }
  }
  return listens;
}

export type StatsRange = "week" | "month" | "year" | "all";

export const RANGE_DAYS: Record<StatsRange, number | null> = { week: 7, month: 30, year: 365, all: null };

export interface TopEntry {
  key: string;
  label: string;
  sublabel?: string;
  plays: number;
  seconds: number;
  artworkUrl?: string;
}

export interface ListenStats {
  totalSeconds: number;
  plays: number;
  uniqueTracks: number;
  uniqueArtists: number;
  topTracks: TopEntry[];
  topArtists: TopEntry[];
  /** Seconds per local calendar day, oldest first, covering the range (or the last 30 days for "all"). */
  daily: { day: string; seconds: number }[];
  /** Seconds per hour of day, 0-23. */
  hours: number[];
  /** Consecutive days with any listening, ending today or yesterday. */
  streakDays: number;
  /** Longest such run in the range. */
  bestStreakDays: number;
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function top(map: Map<string, TopEntry>, limit: number): TopEntry[] {
  return [...map.values()]
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Splits "A, B & C" style artist credits so each artist gets the listen. */
export function splitArtists(artist: string): string[] {
  return artist
    .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function computeListenStats(listens: Listen[], range: StatsRange, now = new Date(), limit = 10): ListenStats {
  const days = RANGE_DAYS[range];
  const since = days === null ? -Infinity : now.getTime() / 1000 - days * 86_400;
  const inRange = listens.filter((listen) => listen.t >= since && listen.sec >= MIN_LISTEN_SEC);

  const tracks = new Map<string, TopEntry>();
  const artists = new Map<string, TopEntry>();
  const perDay = new Map<string, number>();
  const hours = new Array<number>(24).fill(0);
  let totalSeconds = 0;

  for (const listen of inRange) {
    totalSeconds += listen.sec;
    const track = tracks.get(listen.id) ?? {
      key: listen.id, label: listen.title, sublabel: listen.artist, plays: 0, seconds: 0, artworkUrl: listen.artworkUrl,
    };
    track.plays += 1;
    track.seconds += listen.sec;
    track.artworkUrl ??= listen.artworkUrl;
    tracks.set(listen.id, track);

    for (const name of splitArtists(listen.artist)) {
      const key = name.toLowerCase();
      const artist = artists.get(key) ?? { key, label: name, plays: 0, seconds: 0 };
      artist.plays += 1;
      artist.seconds += listen.sec;
      artists.set(key, artist);
    }

    const date = new Date(listen.t * 1000);
    perDay.set(dayKey(date), (perDay.get(dayKey(date)) ?? 0) + listen.sec);
    hours[date.getHours()] += listen.sec;
  }

  const span = days ?? 30;
  const daily: { day: string; seconds: number }[] = [];
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    daily.push({ day: dayKey(date), seconds: perDay.get(dayKey(date)) ?? 0 });
  }

  // Streaks over every listening day, not just the range, so "current streak" is honest.
  const allDays = new Set(listens.filter((l) => l.sec >= MIN_LISTEN_SEC).map((l) => dayKey(new Date(l.t * 1000))));
  let streakDays = 0;
  const cursor = new Date(now);
  if (!allDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (allDays.has(dayKey(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  let bestStreakDays = 0;
  let run = 0;
  const sorted = [...new Set(inRange.map((l) => dayKey(new Date(l.t * 1000))))].sort();
  let previous: Date | null = null;
  for (const key of sorted) {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    run = previous && Math.round((date.getTime() - previous.getTime()) / 86_400_000) === 1 ? run + 1 : 1;
    bestStreakDays = Math.max(bestStreakDays, run);
    previous = date;
  }

  return {
    totalSeconds,
    plays: inRange.length,
    uniqueTracks: tracks.size,
    uniqueArtists: artists.size,
    topTracks: top(tracks, limit),
    topArtists: top(artists, limit),
    daily,
    hours,
    streakDays,
    bestStreakDays,
  };
}

/** "3 h 20 min", "45 min", "1 min". */
export function formatListeningTime(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("{n} min", { n: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? t("{h} h {m} min", { h: hours, m: rest }) : t("{h} h", { h: hours });
}
