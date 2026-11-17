import { useEffect, useRef, useState, type PointerEvent } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { cn } from "@/lib/utils";
import { SpinnerSteps } from "@/components/motion/loader";
import {
  ChevronDownIcon,
  HeartActiveIcon,
  HeartIcon,
  PauseActiveIcon,
  PlayActiveIcon,
  QueuePanelIcon,
  SkipNextIcon,
} from "@/ui/icons";
import { playerController, shallowEqual, useLibraryState, usePlayerSelector } from "../../../player/playerStore";
import { registerBackHandler } from "../../android";
import { useTrackContextMenu } from "../TrackContextMenu";
import { TrackArtwork } from "../TrackArtwork";
import { BlurredArtwork } from "../BlurredArtwork";
import { SeekBar } from "./SeekBar";
import { PlaybackControls } from "./PlaybackControls";
import { LyricsButton } from "./LyricsButton";
import { DownloadButton } from "./DownloadButton";
import { PlaybackOptions } from "./PlaybackOptions";
import { useT } from "../../../i18n";

/**
 * Phone player: a floating pill above the nav bar that opens into a full-screen Now Playing
 * sheet — the mini-player pattern people know from Spotify and Apple Music. Replaces the old
 * stacked card, which kept a third of a small screen busy all the time.
 */

/** Playback progress 0..1, polled only while playing (a paused bar has nothing to update). */
function useProgress(isPlaying: boolean): number {
  const read = () => {
    const duration = playerController.getDuration();
    return duration > 0 ? Math.min(1, playerController.getCurrentTime() / duration) : 0;
  };
  const [progress, setProgress] = useState(read);
  useEffect(() => {
    setProgress(read());
    if (!isPlaying) return;
    const id = window.setInterval(() => setProgress(read()), 500);
    return () => window.clearInterval(id);
  }, [isPlaying]);
  return progress;
}

function usePlayerBasics() {
  return usePlayerSelector(
    (player) => ({ currentTrack: player.currentTrack, status: player.status }),
    shallowEqual,
  );
}

export function MobilePlayerPill({ onExpand }: { onExpand: () => void }) {
  const t = useT();
  const { currentTrack, status } = usePlayerBasics();
  const isPlaying = status === "playing";
  const isBusy = status === "loading";
  const progress = useProgress(isPlaying);
  const startY = useRef<number | null>(null);

  if (!currentTrack) return null;

  // Swipe up on the pill opens the sheet, like pulling the mini-player up.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startY.current = event.clientY;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (startY.current !== null && startY.current - event.clientY > 24) onExpand();
    startY.current = null;
  };

  return (
    <div className="pointer-events-none flex shrink-0 justify-center px-3 pb-2">
      <div
        data-mobile-player
        role="button"
        tabIndex={0}
        aria-label={t("Now playing: {title}. Open player", { title: currentTrack.title })}
        onClick={onExpand}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onExpand();
          }
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="pressable pointer-events-auto relative flex w-full max-w-xl items-center gap-3 overflow-hidden rounded-full bg-card py-1.5 pl-1.5 pr-2 shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <TrackArtwork
          className="size-11 shrink-0 rounded-full"
          artworkUrl={currentTrack.artworkUrl}
          size={44}
          iconSize={20}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{currentTrack.title}</span>
          <span className="truncate text-xs text-muted-foreground">{currentTrack.artist}</span>
        </span>
        <button
          type="button"
          aria-label={isPlaying ? t("Pause") : t("Play")}
          onClick={(event) => {
            event.stopPropagation();
            void playerController.togglePlayPause();
          }}
          className="glow grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isBusy ? (
            <SpinnerSteps size={18} color="currentColor" />
          ) : isPlaying ? (
            <PauseActiveIcon size={20} />
          ) : (
            <PlayActiveIcon size={20} />
          )}
        </button>
        <button
          type="button"
          aria-label={t("Next")}
          onClick={(event) => {
            event.stopPropagation();
            void playerController.skipToNext();
          }}
          className="grid size-10 shrink-0 place-items-center rounded-full text-foreground active:bg-[var(--color-pressed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SkipNextIcon size={20} />
        </button>
        {/* Progress along the pill's bottom edge, in the accent. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-muted">
          {/* A transform, not a width: repainting a glowing bar twice a second showed up on phones. */}
          <span
            className="block h-full w-full origin-left rounded-full bg-primary transition-transform duration-500 ease-linear"
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }}
          />
        </span>
      </div>
    </div>
  );
}

export function NowPlayingSheet({
  open,
  onClose,
  onToggleLyrics,
  onToggleQueue,
}: {
  open: boolean;
  onClose: () => void;
  onToggleLyrics: () => void;
  onToggleQueue: () => void;
}) {
  const t = useT();
  const { currentTrack } = usePlayerBasics();
  const libraryState = useLibraryState();
  const { toggleTrackLike } = useTrackContextMenu();
  const dragControls = useDragControls();

  useEffect(() => {
    if (!open) return;
    return registerBackHandler(() => {
      onClose();
      return true;
    });
  }, [open, onClose]);

  const canLike = Boolean(currentTrack && currentTrack.source !== "local");
  const isLiked =
    canLike && (libraryState.library?.likedSongs.some((track) => track.id === currentTrack?.id) ?? false);
  const likePending = canLike && currentTrack ? libraryState.pendingLikeTrackIds.has(currentTrack.id) : false;

  return (
    <AnimatePresence>
      {open && currentTrack ? (
        <motion.section
          key="now-playing"
          role="dialog"
          aria-modal="true"
          aria-label={t("Now playing")}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 380, damping: 38 }}
          drag="y"
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 120 || info.velocity.y > 600) onClose();
          }}
          className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-background"
        >
          {/* Backdrop: the cover, blurred, when ambient art is on; an accent wash otherwise. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0" data-fx="ambient">
            {currentTrack.artworkUrl ? <BlurredArtwork artworkUrl={currentTrack.artworkUrl} saturate={1.8} className="size-full opacity-45" /> : null}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_22%,transparent),transparent_70%)]"
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-background/40 to-background" />

          {/* Grab strip: drag down anywhere along the top to close. */}
          <div
            className="relative flex shrink-0 touch-none items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2"
            onPointerDown={(event) => dragControls.start(event)}
          >
            <button
              type="button"
              aria-label={t("Close player")}
              onClick={onClose}
              className="grid size-11 place-items-center rounded-full text-foreground active:bg-[var(--color-pressed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDownIcon size={26} />
            </button>
            <span className="h-1.5 w-10 rounded-full bg-muted-foreground/40" aria-hidden="true" />
            <span className="size-11" aria-hidden="true" />
          </div>

          {/* Bottom padding clears the floating navbar, which stays on top of this sheet. */}
          <div className="relative flex min-h-0 flex-1 flex-col justify-center gap-6 px-6 pb-[calc(var(--mobile-nav-height,env(safe-area-inset-bottom))+1.75rem)]">
            <TrackArtwork
              className="mx-auto aspect-square w-full max-w-[min(22rem,54vh)] rounded-card shadow-pop"
              artworkUrl={currentTrack.artworkUrl}
              size={352}
              iconSize={72}
              loading="eager"
            />

            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 className="truncate text-2xl font-bold tracking-[-0.02em] text-foreground">
                  {currentTrack.title}
                </h2>
                <p className="truncate text-base text-muted-foreground">{currentTrack.artist}</p>
              </div>
              {canLike ? (
                <button
                  type="button"
                  aria-label={isLiked ? t("Remove like") : t("Like song")}
                  disabled={likePending}
                  onClick={() => void toggleTrackLike(currentTrack)}
                  className={cn(
                    "pressable grid size-12 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isLiked ? "text-primary" : "text-foreground",
                  )}
                >
                  {likePending ? <SpinnerSteps size={22} color="currentColor" /> : isLiked ? <HeartActiveIcon size={26} /> : <HeartIcon size={26} />}
                </button>
              ) : null}
            </div>

            <div data-mobile-player className="flex flex-col gap-3">
              <SeekBar />
              <div className="flex justify-center">
                <PlaybackControls extraControlsAlwaysVisible />
              </div>
              <div className="flex items-center justify-between px-2">
                <LyricsButton
                  onToggle={() => {
                    onClose();
                    onToggleLyrics();
                  }}
                />
                <DownloadButton />
                <PlaybackOptions />
                <button
                  type="button"
                  aria-label={t("Open queue")}
                  onClick={() => {
                    onClose();
                    onToggleQueue();
                  }}
                  className="grid size-10 place-items-center rounded-full text-muted-foreground active:bg-[var(--color-pressed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <QueuePanelIcon size={20} />
                </button>
              </div>
            </div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
