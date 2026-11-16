import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  CloseIcon,
  HeartActiveIcon,
  HeartIcon,
  PauseActiveIcon,
  PlayActiveIcon,
  SkipNextActiveIcon,
  SkipPreviousActiveIcon,
} from "@/ui/icons";
import {
  libraryController,
  playerController,
  shallowEqual,
  useLibrarySelector,
  usePlayerSelector,
} from "../../player/playerStore";
import { useT } from "../../i18n";
import { useKeepScreenOn } from "../hooks/useKeepScreenOn";
import { registerBackHandler } from "../android";
import { TrackArtwork } from "./TrackArtwork";

/** Fired on `window` to open car mode from anywhere (Home, the player menu, a car's Bluetooth). */
export const OPEN_CAR_MODE_EVENT = "zuno-open-car-mode";

export function openCarMode(): void {
  window.dispatchEvent(new Event(OPEN_CAR_MODE_EVENT));
}

const SWIPE_PX = 70;

/**
 * Driving screen: one glance, one big target. A large cover, big title, three huge transport
 * buttons and Like — nothing else to read. Swiping the cover left/right skips. High contrast on
 * black whatever the theme, and the display stays on while it is open.
 */
export function CarModeView({ onClose }: { onClose: () => void }) {
  const t = useT();
  const reduce = useReducedMotion();
  const { track, status } = usePlayerSelector(
    (player) => ({ track: player.currentTrack, status: player.status }),
    shallowEqual,
  );
  const liked = useLibrarySelector((library) =>
    Boolean(track && library.library?.likedSongs.some((song) => song.id === track.id)));
  const [dragX, setDragX] = useState(0);
  const start = useRef<number | null>(null);
  useKeepScreenOn(true);

  useEffect(() => registerBackHandler(() => {
    onClose();
    return true;
  }), [onClose]);

  const playing = status === "playing" || status === "loading";

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    start.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current !== null) setDragX(event.clientX - start.current);
  };
  const onPointerUp = () => {
    if (dragX <= -SWIPE_PX) void playerController.skipToNext();
    else if (dragX >= SWIPE_PX) void playerController.skipToPrevious();
    start.current = null;
    setDragX(0);
  };

  const big =
    "grid place-items-center rounded-full transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70";

  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col bg-black text-white" role="dialog" aria-label={t("Car mode")}>
      <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">{t("Car mode")}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Exit car mode")}
          className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-5 text-base font-semibold hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
        >
          <CloseIcon size={22} />
          {t("Exit")}
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 landscape:flex-row landscape:gap-10">
        <motion.div
          className="aspect-square w-full max-w-[min(70vw,46vh)] touch-pan-y select-none landscape:max-w-[min(40vw,62vh)]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          animate={{ x: dragX, rotate: reduce ? 0 : dragX / 40 }}
          transition={start.current === null ? { type: "spring", stiffness: 400, damping: 30 } : { duration: 0 }}
        >
          <TrackArtwork
            artworkUrl={track?.artworkUrl}
            size={520}
            iconSize={80}
            loading="eager"
            className="size-full rounded-[1.5rem] shadow-2xl"
          />
        </motion.div>

        <div className="flex w-full max-w-xl flex-col items-center gap-6">
          <div className="w-full text-center">
            <p className="truncate text-3xl font-extrabold leading-tight sm:text-4xl">{track?.title ?? t("Nothing playing")}</p>
            <p className="mt-1 truncate text-xl font-medium text-white/65">{track?.artist ?? ""}</p>
          </div>

          <div className="flex w-full items-center justify-between gap-3">
            <button
              type="button"
              aria-label={t("Previous")}
              onClick={() => void playerController.skipToPrevious()}
              className={cn(big, "size-20 bg-white/10")}
            >
              <SkipPreviousActiveIcon size={40} />
            </button>
            <button
              type="button"
              aria-label={playing ? t("Pause") : t("Play")}
              onClick={() => void playerController.togglePlayPause()}
              className={cn(big, "glow size-28 bg-primary text-primary-foreground")}
            >
              {playing ? <PauseActiveIcon size={56} /> : <PlayActiveIcon size={56} />}
            </button>
            <button
              type="button"
              aria-label={t("Next")}
              onClick={() => void playerController.skipToNext()}
              className={cn(big, "size-20 bg-white/10")}
            >
              <SkipNextActiveIcon size={40} />
            </button>
          </div>

          <button
            type="button"
            disabled={!track}
            aria-pressed={liked}
            onClick={() => track && void libraryController.setTrackLiked(track, !liked)}
            className={cn(
              "flex h-14 items-center gap-2 rounded-full px-7 text-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:opacity-40",
              liked ? "bg-primary/20 text-primary" : "bg-white/10 text-white",
            )}
          >
            {liked ? <HeartActiveIcon size={26} /> : <HeartIcon size={26} />}
            {liked ? t("Liked") : t("Like")}
          </button>
          <p className="text-sm text-white/40">{t("Swipe the cover to change song")}</p>
        </div>
      </main>
    </div>,
    document.body,
  );
}
