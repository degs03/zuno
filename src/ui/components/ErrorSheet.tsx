import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, CloseIcon, LibraryIcon, MusicNoteIcon, OfflineIcon } from "@/ui/icons";
import { useT } from "../../i18n";
import { registerBackHandler } from "../android";
import { isMobile } from "../platform";

export type ErrorSheetKind = "offline" | "playback" | "library";

export interface ErrorSheetAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  primary?: boolean;
}

export interface ErrorSheetState {
  kind: ErrorSheetKind;
  /** The raw message, behind "Technical details". */
  detail?: string;
  actions: ErrorSheetAction[];
}

const ICONS: Record<ErrorSheetKind, ReactNode> = {
  offline: <OfflineIcon size={30} aria-hidden="true" />,
  playback: <MusicNoteIcon size={30} aria-hidden="true" />,
  library: <LibraryIcon size={30} aria-hidden="true" />,
};

/**
 * The app's own error dialog — a bottom sheet on phones, a card on desktop — in place of the
 * system `alert()`, which looked like the app had crashed. Each kind says what happened in
 * plain words and offers the ways out that actually help (play downloads, retry, skip), with the
 * raw message tucked behind "Technical details" for bug reports.
 */
export function ErrorSheet({ state, onClose }: { state: ErrorSheetState | null; onClose: () => void }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    setShowDetail(false);
    if (!state) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const unregister = registerBackHandler(() => {
      onClose();
      return true;
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      unregister();
    };
  }, [state, onClose]);

  const copy: Record<ErrorSheetKind, { title: string; body: string }> = {
    offline: {
      title: t("You're offline"),
      body: t("This song isn't downloaded, so it can't play without internet. Your downloads still work, and everything else comes back when you reconnect."),
    },
    playback: {
      title: t("This song couldn't play"),
      body: t("Something went wrong while loading it. Try again, or skip to the next song."),
    },
    library: {
      title: t("Your library couldn't sync"),
      body: t("Zuno couldn't reach YouTube Music to update your library. What you already have is still here."),
    },
  };

  return createPortal(
    <AnimatePresence>
      {state ? (
        <motion.div
          key="error-sheet"
          className={cn("fixed inset-0 z-[95] flex bg-black/50 backdrop-blur-[2px]", isMobile ? "items-end" : "items-center justify-center p-6")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          onClick={onClose}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="error-sheet-title"
            aria-describedby="error-sheet-body"
            onClick={(event) => event.stopPropagation()}
            initial={reduce ? false : isMobile ? { y: "100%" } : { scale: 0.94, opacity: 0 }}
            animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
            exit={reduce ? undefined : isMobile ? { y: "100%" } : { scale: 0.94, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className={cn(
              "relative flex w-full flex-col gap-4 bg-card p-6 shadow-pop",
              isMobile ? "rounded-t-[1.75rem] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]" : "max-w-md rounded-card",
            )}
          >
            {isMobile ? <span aria-hidden="true" className="mx-auto -mt-2 h-1 w-10 rounded-full bg-foreground/20" /> : null}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close")}
              className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CloseIcon size={18} />
            </button>

            <span className="glow grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">{ICONS[state.kind]}</span>
            <div className="flex flex-col gap-1.5">
              <h2 id="error-sheet-title" className="text-xl font-bold tracking-tight text-foreground">
                {copy[state.kind].title}
              </h2>
              <p id="error-sheet-body" className="text-sm leading-relaxed text-muted-foreground">
                {copy[state.kind].body}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {state.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    action.onClick();
                    onClose();
                  }}
                  className={cn(
                    "pressable flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    action.primary ? "glow bg-primary text-primary-foreground" : "bg-muted/60 text-foreground hover:bg-muted",
                  )}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>

            {state.detail ? (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowDetail((open) => !open)}
                  aria-expanded={showDetail}
                  className="flex items-center gap-1 self-start text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDownIcon size={14} className={cn("transition-transform", showDetail && "rotate-180")} aria-hidden="true" />
                  {t("Technical details")}
                </button>
                {showDetail ? (
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/60 p-3 text-[11px] text-muted-foreground">
                    {state.detail}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
