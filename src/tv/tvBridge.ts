/**
 * Answers Zuno TV's requests with this app's data source.
 *
 * The webOS app (tv/) is a thin client: Rust's tv_server receives its HTTP calls and emits a
 * `tv-request` event; this runs the method and replies through `tv_respond`. Results are
 * trimmed to what the TV draws — a 2017 TV parses JSON slowly and has little memory.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { Album, Artist, Lyrics, Playlist, Track } from "../datasource/types";
import { getArtworkUrlCandidates } from "../datasource/youtube/artwork";
import { logInternalWarn } from "../internal/logging";
import { dataSource } from "../player/playerStore";

type TvRequest = { id: number; method: string; args: unknown[] };

const art = (url?: string, size = 544) => (url ? getArtworkUrlCandidates(url, size)[0] : undefined);

function artistName(track: Track): string {
  const names = (track.artists ?? []).map((artist) => artist.name).filter(Boolean);
  if (names.length) return names.join(", ");
  return track.artist && track.artist !== "Unknown artist" ? track.artist : "";
}

const tvTrack = (track: Track) => ({
  id: track.id,
  title: track.title,
  artist: artistName(track),
  album: track.album,
  albumId: track.albumId,
  artistId: track.artists?.find((artist) => artist.id)?.id,
  durationSec: track.durationSec,
  art: art(track.artworkUrl),
  explicit: track.isExplicit || undefined,
});
const tvAlbum = (album: Album) => ({
  id: album.id,
  playlistId: album.playlistId,
  title: album.title,
  artist: album.artist,
  art: art(album.artworkUrl),
  type: album.releaseType,
});
const tvPlaylist = (playlist: Playlist) => ({
  id: playlist.id,
  title: playlist.title,
  owner: playlist.owner,
  art: art(playlist.artworkUrl),
  kind: playlist.kind,
});
const tvArtist = (artist: Artist) => ({ id: artist.id, name: artist.name, art: art(artist.artworkUrl) });

const tracks = (list?: Track[], limit = 100) => (list ?? []).filter((t) => t.source !== "local").slice(0, limit).map(tvTrack);

/** A track the TV sent back: only the fields the data source keys off. */
function asTrack(raw: unknown): Track {
  const value = raw as Partial<Track> & { art?: string };
  return {
    id: String(value.id),
    source: "youtube",
    title: value.title ?? "",
    artist: value.artist ?? "",
    album: value.album,
    albumId: value.albumId,
    durationSec: value.durationSec,
    artworkUrl: value.art,
  } as Track;
}

const require = <T>(fn: T | undefined, name: string): T => {
  if (!fn) throw new Error(`${name} is not available`);
  return fn;
};

async function shelvesFor(target: "explore" | "charts") {
  const page = await require(dataSource.getBrowsePage, "browse").call(dataSource, target);
  return page.shelves
    .map((shelf) => ({
      title: shelf.title,
      tracks: tracks(shelf.tracks, 30),
      albums: shelf.albums.slice(0, 30).map(tvAlbum),
      playlists: shelf.playlists.slice(0, 30).map(tvPlaylist),
      artists: shelf.artists.slice(0, 30).map(tvArtist),
    }))
    .filter((shelf) => shelf.tracks.length + shelf.albums.length + shelf.playlists.length + shelf.artists.length > 0);
}

async function library() {
  try {
    const snapshot = (await dataSource.getCachedLibrary?.()) ?? (await dataSource.getLibrary?.());
    if (!snapshot) return null;
    return {
      account: snapshot.account?.name,
      liked: tracks(snapshot.likedSongs, 200),
      recent: tracks(snapshot.recentlyPlayed, 40),
      playlists: snapshot.playlists.map(tvPlaylist),
      albums: snapshot.albums.map(tvAlbum),
    };
  } catch {
    // Signed out: the TV simply has no Library tab.
    return null;
  }
}

function tvLyrics(lyrics: Lyrics | null) {
  if (!lyrics || lyrics.lines.length === 0) return null;
  return {
    timing: lyrics.timing,
    source: lyrics.sourceLabel,
    lines: lyrics.lines.map((line) => ({ text: line.text, start: line.startTimeSec, end: line.endTimeSec })),
  };
}

/**
 * The TV plays the bytes from our media server. Resolved at "normal" quality on purpose: that
 * tier prefers AAC in MP4, which a 2017 TV decodes reliably; Opus-in-WebM it may not.
 */
async function stream(raw: unknown) {
  const track = asTrack(raw);
  const { url, mimeType, cookie } = await dataSource.resolveStreamUrl(track, "normal");
  const payload = await invoke<{ url: string; mimeType: string; byteLength: number }>("fetch_audio_source", {
    url,
    trackId: track.id,
    mimeType,
    cookie: cookie ?? null,
  });
  // http://127.0.0.1:<port>/audio/<key> → /audio/<key>, served by the TV server's port.
  const path = new URL(payload.url).pathname;
  return { path, mimeType: payload.mimeType };
}

const METHODS: Record<string, (...args: any[]) => Promise<unknown>> = {
  async home() {
    const [explore, charts, lib] = await Promise.all([
      shelvesFor("explore").catch(() => []),
      shelvesFor("charts").catch(() => []),
      library(),
    ]);
    const mine = lib?.recent.length ? [{ title: "Recently played", tracks: lib.recent, albums: [], playlists: [], artists: [] }] : [];
    return { signedIn: Boolean(lib), shelves: [...mine, ...explore, ...charts] };
  },
  async search(query: string) {
    const results = await require(dataSource.search, "search").call(dataSource, String(query));
    return {
      tracks: tracks(results.tracks, 40),
      albums: results.albums.slice(0, 20).map(tvAlbum),
      artists: results.artists.slice(0, 20).map(tvArtist),
      playlists: results.playlists.slice(0, 20).map(tvPlaylist),
    };
  },
  async suggest(query: string) {
    return (await dataSource.getSearchSuggestions?.(String(query))) ?? [];
  },
  async album(raw: { id: string; title?: string; artist?: string; playlistId?: string }) {
    const album = { id: raw.id, title: raw.title ?? "", artist: raw.artist ?? "", playlistId: raw.playlistId } as Album;
    return tracks(await require(dataSource.getAlbumTracks, "album").call(dataSource, album), 200);
  },
  async playlist(raw: { id: string; title?: string; owner?: string }) {
    const playlist = { id: raw.id, title: raw.title ?? "", owner: raw.owner ?? "" } as Playlist;
    return tracks(await require(dataSource.getPlaylistTracks, "playlist").call(dataSource, playlist), 300);
  },
  async artist(id: string) {
    const page = await require(dataSource.getArtist, "artist").call(dataSource, String(id));
    return {
      artist: tvArtist(page.artist),
      popular: tracks(page.popularSongs, 20),
      releases: page.releases.slice(0, 40).map(tvAlbum),
      playlists: page.playlists.slice(0, 20).map(tvPlaylist),
    };
  },
  async radio(raw: unknown) {
    return tracks(await require(dataSource.getRecommendations, "radio").call(dataSource, asTrack(raw)), 50);
  },
  async lyrics(raw: unknown) {
    return tvLyrics((await dataSource.getLyrics?.(asTrack(raw))) ?? null);
  },
  library,
  stream,
};

let started = false;

/** Desktop only, once. Cheap when the TV server is off: nothing ever emits `tv-request`. */
export function startTvBridge(): void {
  if (started) return;
  started = true;
  void listen<TvRequest>("tv-request", async ({ payload }) => {
    const { id, method, args } = payload;
    let body: string;
    try {
      const handler = METHODS[method];
      if (!handler) throw new Error(`unknown method ${method}`);
      const data = await handler(...(Array.isArray(args) ? args : []));
      body = JSON.stringify({ ok: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logInternalWarn("tvBridge request failed", { method, message });
      body = JSON.stringify({ ok: false, error: message });
    }
    await invoke("tv_respond", { id, body }).catch(() => {});
  });
}
