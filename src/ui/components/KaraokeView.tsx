import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { CloseIcon } from "@/ui/icons";
import type { LyricLine, Track } from "../../datasource/types";
import { playerController } from "../../player/playerStore";
import { useT } from "../../i18n";
import { findActiveLineIndex, getLineProgress } from "../pages/lyricsTiming";
import { useReduceMotion } from "../settings/renderEffects";
import { useKeepScreenOn } from "../hooks/useKeepScreenOn";
import { registerBackHandler } from "../android";
import { BlurredArtwork } from "./BlurredArtwork";
import { splitWords, wordFills } from "./karaokeFill";

/**
 * Sing-along mode: one big line at a time over the blurred cover.
 *
 * The current line fills with the accent colour word by word as it is sung (timing is per line,
 * so the fill is spread over its letters from this line's start to the next one's — a line
 * that wraps onto two or three rows fills row after row and always finishes), the next line waits
 * dimmed below, and the translation (when lyrics translation is on) sits under the current
 * line. Tapping the previous/next line seeks there. The screen stays on while it is open.
 */
export function KaraokeView({
  track,
  lines,
  translations,
  offset,
  onClose,
}: {
  track: Track;
  lines: LyricLine[];
  translations: string[] | null;
  offset: number;
  onClose: () => void;
}) {
  const t = useT();
  const reduce = useReduceMotion();
  const [active, setActive] = useState(-1);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const words = useMemo(() => splitWords(active >= 0 ? lines[active]?.text ?? "" : ""), [active, lines]);
  useKeepScreenOn(true);

  useEffect(() => registerBackHandler(() => {
    onClose();
    return true;
  }), [onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let frame = 0;
    let current = -1;
    const tick = () => {
      const time = playerController.getCurrentTime() + offset;
      const index = findActiveLineIndex(lines, time);
      if (index !== current) {
        current = index;
        setActive(index);
      }
      if (index >= 0) {
        const progress = reduce ? 1 : getLineProgress(lines, index, time, track.durationSec);
        const currentWords = splitWords(lines[index]?.text ?? "");
        const fills = wordFills(currentWords, progress);
        fills.forEach((fill, word) => {
          const node = wordRefs.current[word];
          if (!node) return;
          const value = `${(fill * 100).toFixed(1)}%`;
          // Written straight to the DOM: this runs every frame, a re-render per frame would not.
          if (node.style.getPropertyValue("--fill") !== value) node.style.setProperty("--fill", value);
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [lines, offset, reduce, track.durationSec]);

  const seekTo = (index: number) => {
    const start = lines[index]?.startTimeSec;
    if (typeof start === "number") void playerController.seekTo(Math.max(0, start - offset));
  };

  const previous = active > 0 ? lines[active - 1] : null;
  const line = active >= 0 ? lines[active] : null;
  const next = lines[active + 1] ?? null;
  const translation = active >= 0 ? translations?.[active] : undefined;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-black text-white" role="dialog" aria-label={t("Karaoke")}>
      {track.artworkUrl ? (
        <div className="absolute inset-0 scale-125 opacity-70" aria-hidden="true">
          <BlurredArtwork artworkUrl={track.artworkUrl} className="size-full" saturate={2} />
        </div>
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/80" aria-hidden="true" />

      <header className="relative z-10 flex items-center justify-between gap-3 px-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{track.title}</p>
          <p className="truncate text-sm text-white/65">{track.artist}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Close karaoke")}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <CloseIcon size={20} />
        </button>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
        {previous ? (
          <button
            type="button"
            onClick={() => seekTo(active - 1)}
            className="line-clamp-2 max-w-3xl text-lg font-semibold text-white/35 transition-colors hover:text-white/60 sm:text-2xl"
          >
            {previous.text}
          </button>
        ) : <span className="h-7" />}

        {/* One line at a time: a new line replaces the old one outright (no exit animation that
            kept two on screen together), and slides in with a transform only. */}
        <motion.div
          key={active}
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="flex max-w-4xl flex-col items-center gap-3"
        >
          {line && words.length > 0 ? (
            <p className="line-clamp-3 text-[2rem] font-extrabold leading-[1.15] tracking-tight sm:text-6xl">
              {words.map((word, index) => (
                <span key={`${index}-${word}`}>
                  <span
                    ref={(node) => {
                      wordRefs.current[index] = node;
                    }}
                    className="bg-clip-text text-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, var(--color-primary) 0 var(--fill, 0%), rgba(255,255,255,0.92) var(--fill, 0%) 100%)",
                      WebkitBackgroundClip: "text",
                    }}
                  >
                    {word}
                  </span>
                  {index < words.length - 1 ? " " : null}
                </span>
              ))}
            </p>
          ) : (
            <span className="text-3xl font-bold text-white/50 sm:text-5xl">♪ ♪ ♪</span>
          )}
          {translation ? <span className="text-lg font-medium text-white/70 sm:text-2xl">{translation}</span> : null}
        </motion.div>

        {next ? (
          <button
            type="button"
            onClick={() => seekTo(active + 1)}
            className="line-clamp-2 max-w-3xl text-xl font-semibold text-white/45 transition-colors hover:text-white/70 sm:text-3xl"
          >
            {next.text}
          </button>
        ) : <span className="h-8" />}
      </main>
    </div>,
    document.body,
  );
}
