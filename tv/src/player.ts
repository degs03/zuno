/**
 * Zuno TV's player: one <audio> element fed from the desktop's media server.
 *
 * Two channels so a 2017 TV does not re-render the whole app four times a second: `state`
 * changes when the track, queue or play state does; `time` ticks with playback position and
 * only the progress bar and lyrics listen to it.
 */

import { useEffect, useState } from "preact/hooks";

import { ApiError, audioUrl, call, type TvLyrics, type TvTrack } from "./api";

export type Repeat = "off" | "all" | "one";

export type PlayerState = {
  queue: TvTrack[];
  index: number;
  playing: boolean;
  loading: boolean;
  shuffle: boolean;
  repeat: Repeat;
  lyrics: TvLyrics | null;
  lyricsLoading: boolean;
  /** A short notice for the toast (track failed, etc.). */
  notice: string | null;
  connectionLost: boolean;
};

const audio = new Audio();
audio.preload = "auto";

let state: PlayerState = {
  queue: [],
  index: -1,
  playing: false,
  loading: false,
  shuffle: false,
  repeat: "off",
  lyrics: null,
  lyricsLoading: false,
  notice: null,
  connectionLost: false,
};

const stateListeners: Array<() => void> = [];
const timeListeners: Array<() => void> = [];
/** Stream paths resolved ahead of time, by track id. */
const prefetched: Record<string, string> = {};
let prefetchingFor: string | null = null;
let loadToken = 0;
let retried = false;
let radioRequested = false;
/** The notice text in the user's language, supplied by the UI (keeps strings out of here). */
let failedNotice = "";

function emit(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch };
  for (let i = 0; i < stateListeners.length; i++) stateListeners[i]();
}

export function getState(): PlayerState {
  return state;
}

export function current(): TvTrack | null {
  return state.queue[state.index] || null;
}

export function getAudio(): HTMLAudioElement {
  return audio;
}

export function setFailedNotice(text: string): void {
  failedNotice = text;
}

function isLost(error: unknown): boolean {
  return error instanceof ApiError ? error.status === 0 : false;
}

function streamPath(track: TvTrack): Promise<string> {
  const ready = prefetched[track.id];
  if (ready) {
    delete prefetched[track.id];
    return Promise.resolve(ready);
  }
  return call<{ path: string }>("stream", track).then((result) => result.path);
}

function loadLyrics(track: TvTrack): void {
  emit({ lyrics: null, lyricsLoading: true });
  call<TvLyrics | null>("lyrics", track).then(
    (lyrics) => {
      if (current() === track) emit({ lyrics, lyricsLoading: false });
    },
    () => {
      if (current() === track) emit({ lyricsLoading: false });
    },
  );
}

function playIndex(index: number): void {
  const track = state.queue[index];
  if (!track) return;
  const token = ++loadToken;
  retried = false;
  prefetchingFor = null;
  audio.pause();
  emit({ index, loading: true, playing: false, notice: null });
  loadLyrics(track);
  start(track, token);
}

function start(track: TvTrack, token: number): void {
  streamPath(track).then(
    (path) => {
      if (token !== loadToken) return;
      audio.src = audioUrl(path);
      const played = audio.play() as Promise<void> | undefined;
      // Chromium 38's play() returns nothing; newer engines return a promise.
      if (played && played.catch) played.catch(() => {});
    },
    (error) => {
      if (token !== loadToken) return;
      if (isLost(error)) {
        emit({ loading: false, connectionLost: true });
        return;
      }
      failTrack(track, token);
    },
  );
}

function failTrack(track: TvTrack, token: number): void {
  if (!retried) {
    retried = true;
    delete prefetched[track.id];
    start(track, token);
    return;
  }
  emit({ notice: failedNotice, loading: false });
  if (state.index < state.queue.length - 1) playIndex(state.index + 1);
}

function shuffled<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

export function playList(tracks: TvTrack[], startIndex = 0, shuffle = false): void {
  if (!tracks.length) return;
  radioRequested = false;
  if (shuffle) {
    // "Shuffle" from a header starts anywhere; from a row, that row plays first.
    const pick = startIndex >= 0 ? startIndex : Math.floor(Math.random() * tracks.length);
    const rest = shuffled(tracks.filter((_, i) => i !== pick));
    emit({ queue: [tracks[pick]].concat(rest), shuffle: true });
    playIndex(0);
    return;
  }
  emit({ queue: tracks.slice(), shuffle: false });
  playIndex(startIndex);
}

/** Play one track now and let radio fill the rest. */
export function playTrack(track: TvTrack): void {
  playList([track], 0);
}

export function playQueueIndex(index: number): void {
  playIndex(index);
}

export function toggle(): void {
  if (state.index < 0) return;
  if (audio.paused) {
    const played = audio.play() as Promise<void> | undefined;
    if (played && played.catch) played.catch(() => {});
  } else audio.pause();
}

export function next(): void {
  if (state.index < state.queue.length - 1) playIndex(state.index + 1);
  else if (state.repeat === "all" && state.queue.length) playIndex(0);
  else extendWithRadio(true);
}

export function previous(): void {
  if (audio.currentTime > 4 || state.index <= 0) {
    audio.currentTime = 0;
    return;
  }
  playIndex(state.index - 1);
}

export function seekBy(seconds: number): void {
  if (!audio.duration) return;
  audio.currentTime = Math.max(0, Math.min(audio.duration - 1, audio.currentTime + seconds));
  tick();
}

export function setShuffle(on: boolean): void {
  if (on === state.shuffle || state.index < 0) return emit({ shuffle: on });
  const head = state.queue.slice(0, state.index + 1);
  const tail = state.queue.slice(state.index + 1);
  emit({ shuffle: on, queue: on ? head.concat(shuffled(tail)) : state.queue });
}

export function cycleRepeat(): void {
  emit({ repeat: state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off" });
}

export function dismissNotice(): void {
  emit({ notice: null });
}

export function clearConnectionLost(): void {
  emit({ connectionLost: false });
  const track = current();
  if (track && audio.paused) playIndex(state.index);
}

/** Endless listening: when the queue runs out, ask for radio based on the last track. */
function extendWithRadio(advance: boolean): void {
  const seed = state.queue[state.queue.length - 1];
  if (!seed || radioRequested) return;
  radioRequested = true;
  call<TvTrack[]>("radio", seed).then(
    (tracks) => {
      const known: Record<string, boolean> = {};
      for (let i = 0; i < state.queue.length; i++) known[state.queue[i].id] = true;
      const fresh = tracks.filter((track) => !known[track.id]);
      radioRequested = false;
      if (!fresh.length) return;
      const wasAtEnd = state.index >= state.queue.length - 1;
      emit({ queue: state.queue.concat(fresh) });
      if (advance && wasAtEnd) playIndex(state.index + 1);
    },
    () => {
      radioRequested = false;
    },
  );
}

function tick(): void {
  for (let i = 0; i < timeListeners.length; i++) timeListeners[i]();
}

audio.addEventListener("playing", () => emit({ playing: true, loading: false, connectionLost: false }));
audio.addEventListener("pause", () => emit({ playing: false }));
audio.addEventListener("waiting", () => emit({ loading: true }));
audio.addEventListener("canplay", () => emit({ loading: false }));
audio.addEventListener("ended", () => {
  if (state.repeat === "one") {
    audio.currentTime = 0;
    toggle();
    return;
  }
  next();
});
audio.addEventListener("error", () => {
  const track = current();
  if (track && audio.src) failTrack(track, loadToken);
});
audio.addEventListener("timeupdate", () => {
  tick();
  const remaining = (audio.duration || 0) - audio.currentTime;
  // Twenty seconds out: resolve the next track so the switch is instant.
  if (remaining > 0 && remaining < 20) {
    const upcoming = state.queue[state.index + 1];
    if (upcoming && prefetchingFor !== upcoming.id && !prefetched[upcoming.id]) {
      prefetchingFor = upcoming.id;
      call<{ path: string }>("stream", upcoming).then(
        (result) => {
          prefetched[upcoming.id] = result.path;
        },
        () => {},
      );
    }
    // And make sure there *is* a next track.
    if (!upcoming && state.repeat === "off") extendWithRadio(false);
  }
});

export function usePlayer(): PlayerState {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    stateListeners.push(listener);
    return () => {
      const at = stateListeners.indexOf(listener);
      if (at >= 0) stateListeners.splice(at, 1);
    };
  }, []);
  return state;
}

/** Re-renders on each position tick. Use only in small components. */
export function usePlaybackTime(): { time: number; duration: number } {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    timeListeners.push(listener);
    return () => {
      const at = timeListeners.indexOf(listener);
      if (at >= 0) timeListeners.splice(at, 1);
    };
  }, []);
  const track = current();
  return { time: audio.currentTime || 0, duration: audio.duration || (track && track.durationSec) || 0 };
}
