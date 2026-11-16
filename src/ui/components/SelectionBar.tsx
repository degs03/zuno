import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Loader } from "@/components/motion/loader";
import { CloseIcon, DownloadIcon, ListIcon, PlaylistAddIcon, TrashIcon } from "@/ui/icons";
import type { Track } from "../../datasource/types";
import type { TrackSelection } from "../hooks/useTrackSelection";
import { useT } from "../../i18n";

const ACTION =
  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/**
 * Actions for a multi-selection, docked above the player bar.
 *
 * Floating rather than inline so it does not push the list around as it appears, and so the
 * rows it acts on stay where they were while you aim at it.
 */
export function SelectionBar({
  selection,
  onAddToQueue,
  onAddToPlaylist,
  onDownload,
  onRemove,
  removeLabel,
}: {
  selection: TrackSelection;
  onAddToQueue: (tracks: Track[]) => void;
  onAddToPlaylist: (tracks: Track[]) => void | Promise<void>;
  onDownload: (tracks: Track[]) => void;
  /** Omit where removal makes no sense, e.g. a library view. */
  onRemove?: (tracks: Track[]) => void | Promise<void>;
  /** Defaults to "Remove", translated. */
  removeLabel?: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const run = async (action: (tracks: Track[]) => void | Promise<void>) => {
    if (busy) return;
    const tracks = selection.getSelectedTracks();
    if (tracks.length === 0) return;

    setBusy(true);
    try {
      await action(tracks);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {selection.isActive && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12, transition: { duration: 0.12 } }}
          transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.6 }}
          className={cn(
            "pointer-events-auto fixed bottom-[var(--bottom-chrome)] left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5",
            "rounded-full bg-popover/95 px-2 py-1.5 shadow-2xl ring-1 ring-border backdrop-blur",
          )}
          role="toolbar"
          aria-label={t("Selected songs")}
        >
          <span className="px-2 text-xs font-semibold tabular-nums text-foreground">
            {t("{count} selected", { count: selection.selectedCount })}
          </span>

          <button
            type="button"
            className={cn(ACTION, "text-foreground hover:bg-card")}
            disabled={busy}
            onClick={() => void run(onAddToQueue)}
          >
            <ListIcon size={15} aria-hidden="true" />
            {t("Queue")}
          </button>

          <button
            type="button"
            className={cn(ACTION, "text-foreground hover:bg-card")}
            disabled={busy}
            onClick={() => void run(onAddToPlaylist)}
          >
            {busy ? <Loader variant="spinner" size={14} /> : <PlaylistAddIcon size={15} aria-hidden="true" />}
            {t("Playlist")}
          </button>

          <button
            type="button"
            className={cn(ACTION, "text-foreground hover:bg-card")}
            disabled={busy}
            onClick={() => void run(onDownload)}
          >
            <DownloadIcon size={15} aria-hidden="true" />
            {t("Download")}
          </button>

          {onRemove && (
            <button
              type="button"
              className={cn(ACTION, "text-destructive hover:bg-destructive/10")}
              disabled={busy}
              onClick={() => void run(onRemove)}
            >
              <TrashIcon size={15} aria-hidden="true" />
              {removeLabel ?? t("Remove")}
            </button>
          )}

          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

          <button
            type="button"
            className={cn(ACTION, "text-muted-foreground hover:text-foreground")}
            onClick={selection.selectAll}
          >
            {t("All")}
          </button>
          <button
            type="button"
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={selection.clear}
            aria-label={t("Clear selection")}
          >
            <CloseIcon size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
