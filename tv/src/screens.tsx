import { useEffect, useRef, useState } from "preact/hooks";

import {
  ApiError,
  call,
  getServer,
  ping,
  setServer,
  type TvAlbum,
  type TvArtist,
  type TvPlaylist,
  type TvShelf,
  type TvTrack,
} from "./api";
import { focusFirst } from "./focus";
import { current, playList, usePlayer } from "./player";
import { LANGUAGES, languageChoice, setLanguageChoice, t } from "./strings";
import { Art, Failed, Loading, Page, Shelf, TrackRows, type Open } from "./ui";
import { useCall } from "./useCall";

export const VERSION = "1.0.0";

/** Focus the screen's first control once its content is on screen. */
function useAutofocus(ready: boolean, key: string): void {
  useEffect(() => {
    if (ready) setTimeout(() => focusFirst(), 0);
  }, [ready, key]);
}

// ---------------------------------------------------------------- Connect

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

export function ConnectScreen({ onConnected }: { onConnected: () => void }) {
  const saved = getServer();
  const [host, setHost] = useState(saved ? saved.host : "192.168.");
  const [code, setCode] = useState(saved ? saved.code : "");
  const [field, setField] = useState<"host" | "code">(saved ? "code" : "host");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useAutofocus(true, "connect");

  const press = (key: string) => {
    const value = field === "host" ? host : code;
    const nextValue = key === "⌫" ? value.slice(0, -1) : value + key;
    if (field === "host") setHost(nextValue.slice(0, 15));
    else if (key !== ".") setCode(nextValue.slice(0, 6));
  };

  const connect = () => {
    setBusy(true);
    setStatus(t("connect.trying"));
    ping(host).then(
      (info) => {
        setServer({ host, code, name: info.name });
        // The ping needs no code; a real call proves the code is right.
        call("suggest", "a").then(
          () => {
            setBusy(false);
            onConnected();
          },
          (error) => {
            setBusy(false);
            setStatus(error instanceof ApiError && error.status === 401 ? t("connect.badCode") : t("connect.notFound"));
          },
        );
      },
      () => {
        setBusy(false);
        setStatus(t("connect.notFound"));
      },
    );
  };

  return (
    <div class="connect">
      <div class="logo">zuno</div>
      <h1>{t("connect.title")}</h1>
      <p class="muted connect-help">{t("connect.help")}</p>
      <div class="connect-body">
        <div class="connect-fields">
          <div class={"field" + (field === "host" ? " field-on" : "")} data-focus onClick={() => setField("host")}>
            <span class="field-label">{t("connect.address")}</span>
            <span class="field-value">{host || " "}</span>
          </div>
          <div class={"field" + (field === "code" ? " field-on" : "")} data-focus onClick={() => setField("code")}>
            <span class="field-label">{t("connect.code")}</span>
            <span class="field-value code">{code || " "}</span>
          </div>
          <button class="btn btn-primary connect-go" data-focus onClick={connect} disabled={busy}>
            {t("connect.go")}
          </button>
          {status ? <p class="connect-status">{status}</p> : null}
        </div>
        <div class="keypad" data-group="keypad">
          {KEYS.map((key, index) => (
            <button key={key} class="key" data-focus data-autofocus={index === 0 ? true : undefined} onClick={() => press(key)}>
              {key}
            </button>
          ))}
          <button class="key key-wide" data-focus onClick={() => (field === "host" ? setHost("") : setCode(""))}>
            {t("connect.clear")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Home

export function HomeScreen({ open }: { open: Open }) {
  const home = useCall<{ signedIn: boolean; shelves: TvShelf[] }>("home", [], "home");
  useAutofocus(!home.loading, "home");
  if (home.loading) return <Loading />;
  if (!home.data) return <Failed onRetry={home.reload} />;
  return (
    <Page>
      {home.data.shelves.map((shelf, index) => (
        <Shelf key={shelf.title + index} shelf={shelf} id={"home-" + index} open={open} />
      ))}
    </Page>
  );
}

// ---------------------------------------------------------------- Search

type SearchResults = { tracks: TvTrack[]; albums: TvAlbum[]; artists: TvArtist[]; playlists: TvPlaylist[] };

let lastQuery = "";
let lastResults: SearchResults | null = null;

export function SearchScreen({ open }: { open: Open }) {
  const [query, setQuery] = useState(lastQuery);
  const [results, setResults] = useState<SearchResults | null>(lastResults);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useAutofocus(true, "search");

  const run = (text: string) => {
    const q = text.trim();
    if (!q) return;
    lastQuery = q;
    setLoading(true);
    setSuggestions([]);
    call<SearchResults>("search", q).then(
      (data) => {
        lastResults = data;
        setResults(data);
        setLoading(false);
      },
      () => setLoading(false),
    );
  };

  const onInput = (event: Event) => {
    const value = (event.target as HTMLInputElement).value;
    setQuery(value);
    window.clearTimeout(timer.current);
    if (!value.trim()) return setSuggestions([]);
    timer.current = window.setTimeout(() => {
      call<string[]>("suggest", value).then((list) => setSuggestions(list.slice(0, 6)), () => {});
    }, 450);
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.keyCode === 13) {
      (event.target as HTMLInputElement).blur();
      run(query);
    }
  };

  const shelf: TvShelf | null = results
    ? { title: "", tracks: [], albums: results.albums, playlists: results.playlists, artists: [] }
    : null;

  return (
    <Page>
      <div class="search-box">
        <input
          class="search-input"
          data-focus
          data-autofocus
          value={query}
          placeholder={t("search.placeholder")}
          onInput={onInput}
          onKeyDown={onKey}
        />
        <span class="muted search-hint">{t("search.hint")}</span>
      </div>
      {suggestions.length ? (
        <div class="chips" data-group="suggest">
          {suggestions.map((text) => (
            <button key={text} class="chip" data-focus onClick={() => (setQuery(text), run(text))}>
              {text}
            </button>
          ))}
        </div>
      ) : null}
      {loading ? <Loading /> : null}
      {!loading && results && results.tracks.length + results.albums.length + results.artists.length === 0 ? (
        <p class="muted">{t("search.empty")}</p>
      ) : null}
      {!loading && results ? (
        <div>
          {results.artists.length ? (
            <Shelf shelf={{ title: t("search.artists"), tracks: [], albums: [], playlists: [], artists: results.artists }} id="s-artists" open={open} />
          ) : null}
          {results.tracks.length ? (
            <section class="shelf">
              <h2 class="shelf-title">{t("search.songs")}</h2>
              <TrackRows tracks={results.tracks.slice(0, 12)} group="s-tracks" onPlay={(index) => open.playTracks(results.tracks, index)} />
            </section>
          ) : null}
          {results.albums.length ? <Shelf shelf={{ ...(shelf as TvShelf), title: t("search.albums"), playlists: [] }} id="s-albums" open={open} /> : null}
          {results.playlists.length ? <Shelf shelf={{ ...(shelf as TvShelf), title: t("search.playlists"), albums: [] }} id="s-playlists" open={open} /> : null}
        </div>
      ) : null}
    </Page>
  );
}

// ---------------------------------------------------------------- Album / playlist / track list

export type CollectionRoute =
  | { kind: "album"; album: TvAlbum }
  | { kind: "playlist"; playlist: TvPlaylist }
  | { kind: "tracks"; title: string; subtitle?: string; art?: string; tracks: TvTrack[] };

export function CollectionScreen({ route }: { route: CollectionRoute }) {
  const player = usePlayer();
  const key = route.kind === "album" ? "a" + route.album.id : route.kind === "playlist" ? "p" + route.playlist.id : "t" + route.title;
  const loaded = useCall<TvTrack[]>(
    route.kind === "album" ? "album" : "playlist",
    route.kind === "album" ? [route.album] : route.kind === "playlist" ? [route.playlist] : [],
    route.kind === "tracks" ? "none" : key,
  );
  const tracks = route.kind === "tracks" ? route.tracks : loaded.data;
  const loading = route.kind !== "tracks" && loaded.loading;
  useAutofocus(!loading, key);

  const title = route.kind === "album" ? route.album.title : route.kind === "playlist" ? route.playlist.title : route.title;
  const subtitle = route.kind === "album" ? route.album.artist : route.kind === "playlist" ? route.playlist.owner : route.subtitle;
  const art = route.kind === "album" ? route.album.art : route.kind === "playlist" ? route.playlist.art : route.art || (tracks && tracks[0] && tracks[0].art);
  const playing = current();

  return (
    <Page>
      <header class="hero">
        <Art url={art || undefined} px={360} />
        <div class="hero-text">
          <h1>{title}</h1>
          {subtitle ? <p class="muted">{subtitle}</p> : null}
          {tracks ? <p class="muted">{tracks.length === 1 ? t("col.song") : t("col.songs", { n: tracks.length })}</p> : null}
          <div class="actions">
            <button class="btn btn-primary" data-focus data-autofocus disabled={!tracks || !tracks.length} onClick={() => tracks && playList(tracks, 0)}>
              ▶ {t("col.play")}
            </button>
            <button class="btn" data-focus disabled={!tracks || !tracks.length} onClick={() => tracks && playList(tracks, -1, true)}>
              ⤨ {t("col.shuffle")}
            </button>
          </div>
        </div>
      </header>
      {loading ? <Loading /> : null}
      {!loading && !tracks ? <Failed onRetry={loaded.reload} /> : null}
      {tracks ? (
        <TrackRows
          tracks={tracks}
          numbered={route.kind === "album"}
          group={"col-" + key}
          playingId={player.index >= 0 && playing ? playing.id : undefined}
          onPlay={(index) => playList(tracks, index)}
        />
      ) : null}
    </Page>
  );
}

// ---------------------------------------------------------------- Artist

type ArtistData = { artist: TvArtist; popular: TvTrack[]; releases: TvAlbum[]; playlists: TvPlaylist[] };

export function ArtistScreen({ artist, open }: { artist: TvArtist; open: Open }) {
  const loaded = useCall<ArtistData>("artist", [artist.id], artist.id);
  useAutofocus(!loaded.loading, "artist" + artist.id);
  const data = loaded.data;
  return (
    <Page>
      <header class="hero">
        <Art url={(data && data.artist.art) || artist.art} px={360} round />
        <div class="hero-text">
          <h1>{artist.name}</h1>
          <div class="actions">
            <button class="btn btn-primary" data-focus data-autofocus disabled={!data || !data.popular.length} onClick={() => data && playList(data.popular, 0)}>
              ▶ {t("col.play")}
            </button>
            <button class="btn" data-focus disabled={!data || !data.popular.length} onClick={() => data && playList(data.popular, -1, true)}>
              ⤨ {t("col.shuffle")}
            </button>
          </div>
        </div>
      </header>
      {loaded.loading ? <Loading /> : null}
      {!loaded.loading && !data ? <Failed onRetry={loaded.reload} /> : null}
      {data && data.popular.length ? (
        <section class="shelf">
          <h2 class="shelf-title">{t("artist.popular")}</h2>
          <TrackRows tracks={data.popular.slice(0, 10)} group="artist-popular" onPlay={(index) => playList(data.popular, index)} />
        </section>
      ) : null}
      {data && data.releases.length ? (
        <Shelf shelf={{ title: t("artist.releases"), tracks: [], albums: data.releases, playlists: [], artists: [] }} id="artist-releases" open={open} />
      ) : null}
      {data && data.playlists.length ? (
        <Shelf shelf={{ title: t("lib.playlists"), tracks: [], albums: [], playlists: data.playlists, artists: [] }} id="artist-playlists" open={open} />
      ) : null}
    </Page>
  );
}

// ---------------------------------------------------------------- Library

type LibraryData = { account?: string; liked: TvTrack[]; recent: TvTrack[]; playlists: TvPlaylist[]; albums: TvAlbum[] } | null;

export function LibraryScreen({ open, openTracks }: { open: Open; openTracks: (title: string, tracks: TvTrack[]) => void }) {
  const loaded = useCall<LibraryData>("library", [], "library");
  useAutofocus(!loaded.loading, "library");
  if (loaded.loading) return <Loading />;
  if (loaded.failed) return <Failed onRetry={loaded.reload} />;
  const data = loaded.data;
  if (!data) return <div class="state"><p class="muted">{t("lib.signedOut")}</p></div>;
  return (
    <Page>
      {data.account ? <h1 class="page-title">{data.account}</h1> : null}
      <div class="row" data-group="lib-top">
        <div class="card card-liked" data-focus onClick={() => openTracks(t("lib.liked"), data.liked)}>
          <div class="art liked-art">♥</div>
          <div class="card-title">{t("lib.liked")}</div>
          <div class="card-sub">{t("col.songs", { n: data.liked.length })}</div>
        </div>
      </div>
      {data.recent.length ? <Shelf shelf={{ title: t("lib.recent"), tracks: data.recent, albums: [], playlists: [], artists: [] }} id="lib-recent" open={open} /> : null}
      {data.playlists.length ? <Shelf shelf={{ title: t("lib.playlists"), tracks: [], albums: [], playlists: data.playlists, artists: [] }} id="lib-playlists" open={open} /> : null}
      {data.albums.length ? <Shelf shelf={{ title: t("lib.albums"), tracks: [], albums: data.albums, playlists: [], artists: [] }} id="lib-albums" open={open} /> : null}
    </Page>
  );
}

// ---------------------------------------------------------------- Settings

export function SettingsScreen({ onChangeServer, onLanguage }: { onChangeServer: () => void; onLanguage: () => void }) {
  const server = getServer();
  const [lang, setLang] = useState(languageChoice());
  useAutofocus(true, "settings");
  const choose = (code: string) => {
    setLanguageChoice(code);
    setLang(code);
    onLanguage();
  };
  return (
    <Page>
      <h1 class="page-title">{t("nav.settings")}</h1>
      <section class="settings-block">
        <h2 class="shelf-title">{t("settings.language")}</h2>
        <div class="chips" data-group="lang">
          <button class={"chip" + (lang === "auto" ? " chip-on" : "")} data-focus data-autofocus onClick={() => choose("auto")}>
            {t("settings.auto")}
          </button>
          {LANGUAGES.map((language) => (
            <button key={language.code} class={"chip" + (lang === language.code ? " chip-on" : "")} data-focus onClick={() => choose(language.code)}>
              {language.name}
            </button>
          ))}
        </div>
      </section>
      <section class="settings-block">
        <h2 class="shelf-title">{t("settings.server")}</h2>
        <p class="muted">
          {server ? (server.name ? server.name + " · " : "") + server.host : "—"}
        </p>
        <button
          class="btn"
          data-focus
          onClick={() => {
            setServer(server ? { host: server.host, code: "" } : null);
            onChangeServer();
          }}
        >
          {t("settings.change")}
        </button>
      </section>
      <section class="settings-block">
        <h2 class="shelf-title">{t("settings.about")}</h2>
        <p class="muted">{t("settings.version", { v: VERSION })}</p>
      </section>
    </Page>
  );
}
