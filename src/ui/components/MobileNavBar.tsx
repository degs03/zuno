import { useEffect, useRef, type ComponentType, type SVGProps } from "react";
import { cn } from "@/lib/utils";
import { CompassIcon, HomeIcon, LibraryIcon, SearchIcon, SettingsIcon } from "@/ui/icons";
import { msg, useT } from "../../i18n";
import { useOfflineState } from "../../player/offlineStore";
import { useReduceMotion } from "../settings/renderEffects";

export type MobileNavTarget = "home" | "search" | "browse" | "library" | "settings";

type Glyph = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const ITEMS: { target: MobileNavTarget; label: string; Icon: Glyph }[] = [
  { target: "home", label: msg("Home"), Icon: HomeIcon as Glyph },
  { target: "search", label: msg("Search"), Icon: SearchIcon as Glyph },
  { target: "browse", label: msg("Browse"), Icon: CompassIcon as Glyph },
  { target: "library", label: msg("Library"), Icon: LibraryIcon as Glyph },
  { target: "settings", label: msg("Settings"), Icon: SettingsIcon as Glyph },
];

/**
 * Zuno's floating island: one rounded bar holding the five destinations. The current one widens
 * into an accent pill with its name; the rest are icons.
 *
 * Deliberately cheap: the pill is plain CSS (flex-grow, colour and opacity transitions) on five
 * elements — no layout animation, no animated shadow, no backdrop blur — because this runs on
 * every tab change on phones, and those effects were what made switching tabs stutter.
 * Icons stay in their outlined form when active (a thicker stroke marks them), so the search
 * glass keeps its hole instead of turning into a filled blob.
 *
 * Reports its height as `--mobile-nav-height` on <html> for sheets that stop above it (search).
 */
export function MobileNavBar({
  active,
  onNavigate,
}: {
  active: MobileNavTarget | null;
  onNavigate: (target: MobileNavTarget) => void;
}) {
  const t = useT();
  const reduce = useReduceMotion();
  const offline = useOfflineState();
  const downloading = (offline.downloadingId ? 1 : 0) + offline.queued.length;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const report = () => document.documentElement.style.setProperty("--mobile-nav-height", `${root.offsetHeight}px`);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(root);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--mobile-nav-height");
    };
  }, []);

  const press = (target: MobileNavTarget) => {
    if (!reduce) {
      try {
        navigator.vibrate?.(8);
      } catch {
        // Not every WebView exposes vibration; the tap still works.
      }
    }
    onNavigate(target);
  };

  return (
    <div
      ref={rootRef}
      className="relative z-[75] flex shrink-0 justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.625rem)] pt-1.5"
    >
      <nav
        data-mobile-nav
        aria-label={t("Main")}
        className="flex h-[3.75rem] w-full max-w-md items-stretch gap-1 rounded-[2rem] bg-card p-1.5 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.6)] ring-1 ring-inset ring-foreground/[0.07]"
      >
        {ITEMS.map(({ target, label, Icon }) => {
          const isActive = active === target;
          const badge = target === "library" && downloading > 0 ? downloading : 0;
          return (
            <button
              key={target}
              type="button"
              aria-label={t(label)}
              aria-current={isActive ? "page" : undefined}
              onClick={() => press(target)}
              style={{ flexGrow: isActive ? 2.6 : 1 }}
              className={cn(
                "relative flex min-w-0 basis-0 items-center justify-center gap-1.5 overflow-hidden rounded-[1.6rem] px-2",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                !reduce && "transition-[flex-grow,background-color,color] duration-200 ease-out active:scale-95",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground active:bg-[var(--color-pressed)]",
              )}
            >
              <span className="relative grid shrink-0 place-items-center">
                <Icon size={22} strokeWidth={isActive ? 2.1 : 1.6} />
                {badge > 0 && (
                  <span
                    aria-label={t("{n} downloading", { n: badge })}
                    className={cn(
                      "absolute -right-2.5 -top-1.5 min-w-4 rounded-full px-1 text-center text-[9px] font-bold leading-4 tabular-nums",
                      isActive ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
                    )}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "min-w-0 truncate text-[13px] font-semibold",
                  !reduce && "transition-opacity duration-200",
                  isActive ? "opacity-100" : "w-0 opacity-0",
                )}
              >
                {t(label)}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
