import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../datasource/types";
import { logInternalWarn } from "../internal/logging";
import { MIN_LISTEN_SEC, parseListenLog, type Listen } from "./listenStats";

/**
 * Records what was actually listened to, for the Stats page: one line per song heard for at
 * least `MIN_LISTEN_SEC`, with the seconds really heard (pauses excluded).
 *
 * Time is measured from state transitions (play, pause, track change), not from a ticking
 * timer, so it stays right while the page is hidden and its timers are throttled.
 *
 * Lives in its own file in app data (`listen_log_*`), because play history is capped at 500
 * and a year of listening is many thousands of entries.
 */

type Snapshot = { track: Track | null; status: string };

let current: Track | null = null;
let heardSec = 0;
let playingSince: number | null = null;
let buffer: Listen[] = [];
let flushTimer: number | undefined;

function pauseClock(): void {
  if (playingSince !== null) {
    heardSec += (performance.now() - playingSince) / 1000;
    playingSince = null;
  }
}

function finishCurrent(): void {
  pauseClock();
  const track = current;
  const duration = track?.durationSec;
  // A loop or a seek-back can exceed the length; one listen never counts for more than a play.
  const sec = Math.round(duration ? Math.min(heardSec, duration + 5) : heardSec);
  if (track && sec >= MIN_LISTEN_SEC) {
    for (const listener of listenListeners) listener(track, sec);
    buffer.push({
      t: Math.floor(Date.now() / 1000),
      id: track.id,
      title: track.title,
      artist: track.artist,
      sec,
      artworkUrl: track.artworkUrl?.startsWith("http") ? track.artworkUrl : undefined,
    });
    scheduleFlush();
  }
  heardSec = 0;
}

function scheduleFlush(): void {
  window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => void flush(), 2_000);
}

async function flush(): Promise<void> {
  window.clearTimeout(flushTimer);
  if (buffer.length === 0) return;
  const lines = buffer.map((listen) => JSON.stringify(listen));
  buffer = [];
  try {
    await invoke("listen_log_append", { lines });
    window.dispatchEvent(new Event(LISTEN_LOG_EVENT));
  } catch (error) {
    logInternalWarn("listenLog.flush failed", { error: String(error) });
  }
}

export const LISTEN_LOG_EVENT = "listen-log-change";

type ListenListener = (track: Track, seconds: number) => void;
const listenListeners = new Set<ListenListener>();

/** Called once per finished listen (30 s or more heard), with the track and seconds heard. */
export function onListen(listener: ListenListener): () => void {
  listenListeners.add(listener);
  return () => listenListeners.delete(listener);
}

/** Feeds the recorder every player state change. */
export function recordPlayerState(snapshot: Snapshot): void {
  if (snapshot.track?.id !== current?.id) {
    finishCurrent();
    current = snapshot.track;
  }
  const playing = snapshot.status === "playing";
  if (playing && playingSince === null) playingSince = performance.now();
  if (!playing) pauseClock();
  if (snapshot.status === "idle" || snapshot.status === "error") {
    finishCurrent();
    current = null;
  }
}

let started = false;

/** Starts recording from a player store. Idempotent. */
export function startListenLog(subscribe: (listener: () => void) => () => void, read: () => Snapshot): void {
  if (started || typeof window === "undefined") return;
  started = true;
  recordPlayerState(read());
  subscribe(() => recordPlayerState(read()));
  // Closing mid-song still counts what was heard.
  window.addEventListener("pagehide", () => {
    finishCurrent();
    void flush();
  });
}

export async function readListenLog(): Promise<Listen[]> {
  await flush();
  try {
    return parseListenLog(await invoke<string>("listen_log_read"));
  } catch (error) {
    logInternalWarn("listenLog.read failed", { error: String(error) });
    return [];
  }
}

export async function readListenLogText(): Promise<string> {
  await flush();
  return invoke<string>("listen_log_read");
}

export async function replaceListenLog(text: string): Promise<void> {
  await invoke("listen_log_replace", { text });
  window.dispatchEvent(new Event(LISTEN_LOG_EVENT));
}
