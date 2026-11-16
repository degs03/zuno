/**
 * Talking to the desktop Zuno (src-tauri/src/tv_server.rs).
 *
 * XMLHttpRequest, not fetch: Chromium 38 has no fetch, and a polyfill would just wrap XHR.
 */

export type Server = { host: string; code: string; name?: string };

export type TvTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumId?: string;
  artistId?: string;
  durationSec?: number;
  art?: string;
  explicit?: boolean;
};
export type TvAlbum = { id: string; playlistId?: string; title: string; artist: string; art?: string; type?: string };
export type TvPlaylist = { id: string; title: string; owner: string; art?: string; kind?: string };
export type TvArtist = { id: string; name: string; art?: string };
export type TvShelf = { title: string; tracks: TvTrack[]; albums: TvAlbum[]; playlists: TvPlaylist[]; artists: TvArtist[] };
export type TvLyricLine = { text: string; start?: number; end?: number };
export type TvLyrics = { timing: string; source?: string; lines: TvLyricLine[] };

export const PORT = 47800;
const STORAGE_KEY = "zuno.tv.server";

let server: Server | null = load();

function load(): Server | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Server) : null;
  } catch {
    return null;
  }
}

export function getServer(): Server | null {
  return server;
}

export function setServer(next: Server | null): void {
  server = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable; the connection still works for this session.
  }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function get<T>(url: string, code: string | null, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.timeout = timeoutMs;
    if (code) xhr.setRequestHeader("X-Zuno-Code", code);
    xhr.onload = () => {
      let body: { ok: boolean; data?: T; error?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Not JSON: treated as an error below.
      }
      if (xhr.status === 200 && body && body.ok) resolve(body.data as T);
      else reject(new ApiError((body && body.error) || "http-" + xhr.status, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("network", 0));
    xhr.ontimeout = () => reject(new ApiError("timeout", 0));
    xhr.send();
  });
}

export function baseUrl(host: string): string {
  return "http://" + host + ":" + PORT;
}

/** Is a Zuno answering at `host`? Needs no code. */
export function ping(host: string): Promise<{ name: string; version: string }> {
  return get(baseUrl(host) + "/tv/ping", null, 5000);
}

export function call<T>(method: string, ...args: unknown[]): Promise<T> {
  if (!server) return Promise.reject(new ApiError("no-server", 0));
  const url =
    baseUrl(server.host) + "/tv/api?m=" + encodeURIComponent(method) + "&a=" + encodeURIComponent(JSON.stringify(args));
  return get<T>(url, server.code, 50000);
}

/** The audio URL for a `stream` result. The code rides in the query: <audio> sends no headers. */
export function audioUrl(path: string): string {
  if (!server) return "";
  return baseUrl(server.host) + path + "?k=" + encodeURIComponent(server.code);
}
