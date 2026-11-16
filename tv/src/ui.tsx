/** Shared pieces: artwork, cards, shelves, track rows, states. */

import type { ComponentChildren } from "preact";

import type { TvAlbum, TvArtist, TvPlaylist, TvShelf, TvTrack } from "./api";
import { shelfTitle, t } from "./strings";

/** googleusercontent artwork can be asked for any size; a card does not need 544 px. */
export function sized(url: string | undefined, px: number): string | undefined {
  if (!url) return undefined;
  if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+/, "=w" + px + "-h" + px);
  return url;
}

export function Art({ url, px, round }: { url?: string; px: number; round?: boolean }) {
  const src = sized(url, px);
  return (
    <div class={"art" + (round ? " art-round" : "")}>
      {src ? <img src={src} alt="" /> : <div class="art-empty">♪</div>}
    </div>
  );
}

export function formatTime(sec?: number): string {
  if (!sec || !isFinite(sec) || sec < 0) return "0:00";
  const whole = Math.floor(sec);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

export type Open = {
  album: (album: TvAlbum) => void;
  playlist: (playlist: TvPlaylist) => void;
  artist: (artist: TvArtist) => void;
  playTracks: (tracks: TvTrack[], index: number) => void;
};

function Card({
  art,
  title,
  subtitle,
  round,
  onPress,
}: {
  art?: string;
  title: string;
  subtitle?: string;
  round?: boolean;
  onPress: () => void;
}) {
  return (
    <div class="card" data-focus onClick={onPress}>
      <Art url={art} px={240} round={round} />
      <div class="card-title">{title}</div>
      {subtitle ? <div class="card-sub">{subtitle}</div> : null}
    </div>
  );
}

const MAX_CARDS = 20;

export function Shelf({ shelf, id, open }: { shelf: TvShelf; id: string; open: Open }) {
  const tracks = shelf.tracks.slice(0, MAX_CARDS);
  return (
    <section class="shelf">
      <h2 class="shelf-title">{shelfTitle(shelf.title)}</h2>
      <div class="row" data-scroll="x" data-group={id}>
        {tracks.map((track, index) => (
          <Card key={"t" + track.id} art={track.art} title={track.title} subtitle={track.artist} onPress={() => open.playTracks(tracks, index)} />
        ))}
        {shelf.albums.slice(0, MAX_CARDS).map((album) => (
          <Card key={"a" + album.id} art={album.art} title={album.title} subtitle={album.artist} onPress={() => open.album(album)} />
        ))}
        {shelf.playlists.slice(0, MAX_CARDS).map((playlist) => (
          <Card key={"p" + playlist.id} art={playlist.art} title={playlist.title} subtitle={playlist.owner} onPress={() => open.playlist(playlist)} />
        ))}
        {shelf.artists.slice(0, MAX_CARDS).map((artist) => (
          <Card key={"r" + artist.id} art={artist.art} title={artist.name} round onPress={() => open.artist(artist)} />
        ))}
      </div>
    </section>
  );
}

export function TrackRows({
  tracks,
  onPlay,
  playingId,
  group,
  numbered,
}: {
  tracks: TvTrack[];
  onPlay: (index: number) => void;
  playingId?: string;
  group: string;
  numbered?: boolean;
}) {
  return (
    <div class="tracks" data-group={group}>
      {tracks.map((track, index) => (
        <div
          key={track.id + ":" + index}
          class={"track" + (track.id === playingId ? " track-playing" : "")}
          data-focus
          onClick={() => onPlay(index)}
        >
          {numbered ? <span class="track-num">{index + 1}</span> : <Art url={track.art} px={120} />}
          <div class="track-text">
            <div class="track-title">
              {track.title}
              {track.explicit ? <span class="explicit">E</span> : null}
            </div>
            <div class="track-sub">{track.artist}</div>
          </div>
          {track.durationSec ? <span class="track-time">{formatTime(track.durationSec)}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function Loading() {
  return (
    <div class="state">
      <div class="spinner" />
      <span>{t("common.loading")}</span>
    </div>
  );
}

export function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <div class="state">
      <span>{t("common.error")}</span>
      <button class="btn" data-focus data-autofocus onClick={onRetry}>
        {t("common.retry")}
      </button>
    </div>
  );
}

export function Page({ children }: { children: ComponentChildren }) {
  return (
    <div class="page" data-scroll="y">
      {children}
    </div>
  );
}
