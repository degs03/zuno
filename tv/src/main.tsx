import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import "./styles.css";
import { getServer, type TvAlbum, type TvArtist, type TvPlaylist, type TvTrack } from "./api";
import { ensureFocus, focusFirst, getFocused, installPointerFocus, move } from "./focus";
import { KaraokeScreen, MiniPlayer, NowPlayingScreen } from "./nowplaying";
import {
  clearConnectionLost,
  current,
  dismissNotice,
  next,
  playList,
  previous,
  seekBy,
  setFailedNotice,
  toggle,
  usePlayer,
} from "./player";
import {
  ArtistScreen,
  CollectionScreen,
  ConnectScreen,
  HomeScreen,
  LibraryScreen,
  SearchScreen,
  SettingsScreen,
  type CollectionRoute,
} from "./screens";
import { t } from "./strings";
import type { Open } from "./ui";

type Tab = "home" | "search" | "library" | "settings";
type Route =
  | { name: Tab }
  | { name: "collection"; route: CollectionRoute }
  | { name: "artist"; artist: TvArtist }
  | { name: "playing" }
  | { name: "karaoke" };

/** Remote key codes (webOS) plus their desktop-keyboard equivalents for testing in a browser. */
const KEY = {
  left: 37,
  up: 38,
  right: 39,
  down: 40,
  ok: 13,
  back: 461,
  backspace: 8,
  escape: 27,
  play: 415,
  pause: 19,
  playPause: 179,
  stop: 413,
  forward: 417,
  rewind: 412,
  nextTrack: 176,
  prevTrack: 177,
  red: 403,
  green: 404,
};

const TABS: Array<{ tab: Tab; label: () => string; icon: string }> = [
  { tab: "home", label: () => t("nav.home"), icon: "⌂" },
  { tab: "search", label: () => t("nav.search"), icon: "⌕" },
  { tab: "library", label: () => t("nav.library"), icon: "♫" },
  { tab: "settings", label: () => t("nav.settings"), icon: "⚙" },
];

function App() {
  const [connected, setConnected] = useState(Boolean(getServer() && getServer()!.code));
  const [stack, setStack] = useState<Route[]>([{ name: "home" }]);
  const [, setLangVersion] = useState(0);
  const player = usePlayer();
  const route = stack[stack.length - 1];
  setFailedNotice(t("player.error"));

  const push = (next: Route) => setStack((s) => s.concat([next]));
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const goTab = (tab: Tab) => setStack([{ name: tab }]);

  const open: Open = {
    album: (album: TvAlbum) => push({ name: "collection", route: { kind: "album", album } }),
    playlist: (playlist: TvPlaylist) => push({ name: "collection", route: { kind: "playlist", playlist } }),
    artist: (artist: TvArtist) => push({ name: "artist", artist }),
    playTracks: (tracks: TvTrack[], index: number) => {
      playList(tracks, index);
      push({ name: "playing" });
    },
  };

  // The notice toast clears itself.
  useEffect(() => {
    if (!player.notice) return;
    const id = setTimeout(dismissNotice, 5000);
    return () => clearTimeout(id);
  }, [player.notice]);

  // After every screen change, make sure something on it holds focus.
  useEffect(() => {
    setTimeout(ensureFocus, 50);
  }, [stack, connected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const code = event.keyCode;
      const focused = getFocused();
      const typing = document.activeElement && document.activeElement.tagName === "INPUT";

      if (typing) {
        // While the on-screen keyboard is up, only Up/Down/Back leave the field.
        if (code === KEY.up || code === KEY.down || code === KEY.back || code === KEY.escape) {
          (document.activeElement as HTMLElement).blur();
          if (code === KEY.up || code === KEY.down) move(code === KEY.up ? "up" : "down");
          event.preventDefault();
        }
        return;
      }

      switch (code) {
        case KEY.left:
          move("left");
          break;
        case KEY.right:
          move("right");
          break;
        case KEY.up:
          move("up");
          break;
        case KEY.down:
          move("down");
          break;
        case KEY.ok:
          if (focused && focused.tagName === "INPUT") focused.focus();
          else if (focused) focused.click();
          break;
        case KEY.back:
        case KEY.backspace:
        case KEY.escape:
          back();
          break;
        case KEY.play:
        case KEY.pause:
        case KEY.playPause:
          toggle();
          break;
        case KEY.forward:
          seekBy(15);
          break;
        case KEY.rewind:
          seekBy(-15);
          break;
        case KEY.nextTrack:
          next();
          break;
        case KEY.prevTrack:
          previous();
          break;
        case KEY.red:
          if (current()) push({ name: "karaoke" });
          break;
        case KEY.green:
          if (current()) push({ name: "playing" });
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!connected) {
    return (
      <ConnectScreen
        onConnected={() => {
          setConnected(true);
          setStack([{ name: "home" }]);
        }}
      />
    );
  }

  const tab: Tab | null =
    route.name === "home" || route.name === "search" || route.name === "library" || route.name === "settings" ? route.name : null;
  const rootTab = (stack[0].name as Tab) || "home";

  let screen;
  switch (route.name) {
    case "home":
      screen = <HomeScreen open={open} />;
      break;
    case "search":
      screen = <SearchScreen open={open} />;
      break;
    case "library":
      screen = (
        <LibraryScreen
          open={open}
          openTracks={(title, tracks) => push({ name: "collection", route: { kind: "tracks", title, tracks } })}
        />
      );
      break;
    case "settings":
      screen = (
        <SettingsScreen
          onChangeServer={() => setConnected(false)}
          onLanguage={() => setLangVersion((v) => v + 1)}
        />
      );
      break;
    case "collection":
      screen = <CollectionScreen key={JSON.stringify(route.route).slice(0, 80)} route={route.route} />;
      break;
    case "artist":
      screen = <ArtistScreen key={route.artist.id} artist={route.artist} open={open} />;
      break;
    case "playing":
      screen = <NowPlayingScreen onKaraoke={() => push({ name: "karaoke" })} />;
      break;
    case "karaoke":
      screen = <KaraokeScreen />;
      break;
  }

  return (
    <div class="shell">
      <nav class="sidebar" data-group="nav">
        <div class="logo">zuno</div>
        {TABS.map((item) => (
          <div
            key={item.tab}
            class={"nav-item" + ((tab || rootTab) === item.tab ? " nav-on" : "")}
            data-focus
            onClick={() => goTab(item.tab)}
          >
            <span class="nav-icon">{item.icon}</span>
            <span>{item.label()}</span>
          </div>
        ))}
        {current() ? (
          <div class={"nav-item" + (route.name === "playing" ? " nav-on" : "")} data-focus onClick={() => push({ name: "playing" })}>
            <span class="nav-icon">♪</span>
            <span>{t("nav.playing")}</span>
          </div>
        ) : null}
      </nav>
      <main class="main">
        <div class="screen">{screen}</div>
        {route.name !== "playing" && route.name !== "karaoke" ? <MiniPlayer onOpen={() => push({ name: "playing" })} /> : null}
      </main>
      {player.notice ? <div class="toast">{player.notice}</div> : null}
      {player.connectionLost ? (
        <div class="dialog" data-layer>
          <div class="dialog-box">
            <p>{t("connect.lost")}</p>
            <button
              class="btn btn-primary"
              data-focus
              data-autofocus
              onClick={() => {
                clearConnectionLost();
                setTimeout(() => focusFirst(), 0);
              }}
            >
              {t("connect.retry")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

installPointerFocus();
render(<App />, document.getElementById("app") as HTMLElement);
