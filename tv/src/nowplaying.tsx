import { useEffect, useRef, useState } from "preact/hooks";

import type { LyricLine } from "../../src/datasource/types";
import { splitWords, wordFills } from "../../src/ui/components/karaokeFill";
import { findActiveLineIndex, getLineProgress } from "../../src/ui/pages/lyricsTiming";
import type { TvLyrics } from "./api";
import { focusFirst } from "./focus";
import {
  current,
  cycleRepeat,
  getAudio,
  next,
  playQueueIndex,
  previous,
  setShuffle,
  toggle,
  usePlaybackTime,
  usePlayer,
} from "./player";
import { t } from "./strings";
import { Art, formatTime } from "./ui";

function toLines(lyrics: TvLyrics | null): LyricLine[] {
  if (!lyrics) return [];
  return lyrics.lines.map((line) => ({ text: line.text, startTimeSec: line.start, endTimeSec: line.end }));
}

function isSynced(lines: LyricLine[]): boolean {
  if (!lines.length) return false;
  for (let i = 0; i < lines.length; i++) if (typeof lines[i].startTimeSec !== "number") return false;
  return true;
}

function Progress({ large }: { large?: boolean }) {
  const { time, duration } = usePlaybackTime();
  const ratio = duration ? Math.min(1, time / duration) : 0;
  return (
    <div class={"progress" + (large ? " progress-large" : "")}>
      <div class="progress-track">
        <div class="progress-fill" style={{ width: ratio * 100 + "%" }} />
      </div>
      {large ? (
        <div class="progress-times">
          <span>{formatTime(time)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const player = usePlayer();
  const track = current();
  if (!track) return null;
  return (
    <div class="mini" data-focus data-group="mini" onClick={onOpen}>
      <Art url={track.art} px={120} />
      <div class="mini-text">
        <div class="track-title">{track.title}</div>
        <div class="track-sub">{track.artist}</div>
      </div>
      <span class="mini-state">{player.loading ? "…" : player.playing ? "❚❚" : "▶"}</span>
      <Progress />
    </div>
  );
}

/** Synced lyrics beside the cover: the active line is lit and kept in view. */
function LyricsPanel({ lines }: { lines: LyricLine[] }) {
  const { time } = usePlaybackTime();
  const box = useRef<HTMLDivElement>(null);
  const active = isSynced(lines) ? findActiveLineIndex(lines, time) : -1;
  useEffect(() => {
    const el = box.current;
    if (!el || active < 0) return;
    const line = el.children[active] as HTMLElement | undefined;
    if (line) el.scrollTop = line.offsetTop - el.clientHeight / 2 + line.offsetHeight / 2;
  }, [active]);
  return (
    <div class="lyrics" ref={box}>
      {lines.map((line, index) => (
        <p key={index} class={"lyric" + (index === active ? " lyric-on" : index < active ? " lyric-past" : "")}>
          {line.text || "♪"}
        </p>
      ))}
    </div>
  );
}

export function NowPlayingScreen({ onKaraoke }: { onKaraoke: () => void }) {
  const player = usePlayer();
  const track = current();
  const [panel, setPanel] = useState<"lyrics" | "queue">("lyrics");
  useEffect(() => {
    setTimeout(() => focusFirst("np-controls"), 0);
  }, []);
  if (!track) return <div class="state"><p class="muted">{t("player.nothing")}</p></div>;
  const lines = toLines(player.lyrics);
  const upcoming = player.queue.slice(player.index + 1, player.index + 30);

  return (
    <div class="np">
      <div class="np-left">
        <Art url={track.art} px={544} />
        <h1 class="np-title">{track.title}</h1>
        <p class="np-artist">{track.artist}</p>
        <Progress large />
        <div class="controls" data-group="np-controls">
          <button class={"ctl" + (player.shuffle ? " ctl-on" : "")} data-focus onClick={() => setShuffle(!player.shuffle)}>⤨</button>
          <button class="ctl" data-focus onClick={previous}>⏮</button>
          <button class="ctl ctl-main" data-focus data-autofocus onClick={toggle}>
            {player.loading ? "…" : player.playing ? "❚❚" : "▶"}
          </button>
          <button class="ctl" data-focus onClick={next}>⏭</button>
          <button class={"ctl" + (player.repeat !== "off" ? " ctl-on" : "")} data-focus onClick={cycleRepeat}>
            {player.repeat === "one" ? "↻1" : "↻"}
          </button>
        </div>
        <p class="muted legend">{t("player.legend")}</p>
      </div>
      <div class="np-right">
        <div class="chips" data-group="np-tabs">
          <button class={"chip" + (panel === "lyrics" ? " chip-on" : "")} data-focus onClick={() => setPanel("lyrics")}>
            {t("player.lyrics")}
          </button>
          <button class={"chip" + (panel === "queue" ? " chip-on" : "")} data-focus onClick={() => setPanel("queue")}>
            {t("player.queue")}
          </button>
          <button class="chip" data-focus onClick={onKaraoke} disabled={!isSynced(lines)}>
            {t("player.karaoke")}
          </button>
        </div>
        {panel === "lyrics" ? (
          player.lyricsLoading ? (
            <p class="muted">{t("common.loading")}</p>
          ) : lines.length ? (
            <LyricsPanel lines={lines} />
          ) : (
            <p class="muted">{t("player.noLyrics")}</p>
          )
        ) : (
          <div class="queue" data-scroll="y" data-group="np-queue">
            {upcoming.map((item, offset) => (
              <div key={item.id + offset} class="track" data-focus onClick={() => playQueueIndex(player.index + 1 + offset)}>
                <Art url={item.art} px={120} />
                <div class="track-text">
                  <div class="track-title">{item.title}</div>
                  <div class="track-sub">{item.artist}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Full-screen karaoke. Each word of the current line fills on its own (wordFills), so a line
 * that wraps onto two rows is painted row after row to the last letter. Driven by
 * requestAnimationFrame writing straight to the DOM — no re-render per frame.
 */
export function KaraokeScreen() {
  const player = usePlayer();
  const track = current();
  const lines = toLines(player.lyrics);
  const { time } = usePlaybackTime();
  const active = Math.max(0, findActiveLineIndex(lines, time));
  const words = lines[active] ? splitWords(lines[active].text) : [];
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    let frame = 0;
    const audio = getAudio();
    const paint = () => {
      const progress = getLineProgress(lines, active, audio.currentTime, track ? track.durationSec : undefined);
      const fills = wordFills(words, progress);
      for (let i = 0; i < fills.length; i++) {
        const el = wordRefs.current[i];
        if (!el) continue;
        const pct = Math.round(fills[i] * 1000) / 10 + "%";
        el.style.backgroundImage =
          "-webkit-linear-gradient(left, #b8f03c 0%, #b8f03c " + pct + ", rgba(255,255,255,0.9) " + pct + ", rgba(255,255,255,0.9) 100%)";
      }
      frame = window.requestAnimationFrame(paint);
    };
    paint();
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, player.lyrics]);

  if (!track) return null;
  const synced = isSynced(lines);
  return (
    <div class="karaoke" data-layer>
      <div class="karaoke-head">
        <Art url={track.art} px={120} />
        <div>
          <div class="track-title">{track.title}</div>
          <div class="track-sub">{track.artist}</div>
        </div>
      </div>
      {!synced ? <p class="k-line k-next">{player.lyricsLoading ? t("common.loading") : t("player.noLyrics")}</p> : null}
      <p class="k-line k-prev">{lines[active - 1] ? lines[active - 1].text : ""}</p>
      <p class="k-line k-now" key={active}>
        {words.map((word, index) => (
          <span key={index} class="k-word" ref={(el) => {
              wordRefs.current[index] = el;
            }}>
            {word}
            {index < words.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
      <p class="k-line k-next">{lines[active + 1] ? lines[active + 1].text : ""}</p>
      <div class="karaoke-progress">
        <Progress />
      </div>
      <button class="sr" data-focus data-autofocus onClick={toggle} />
    </div>
  );
}
