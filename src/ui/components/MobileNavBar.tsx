import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import {
  CompassActiveIcon,
  CompassIcon,
  HomeActiveIcon,
  HomeIcon,
  LibraryActiveIcon,
  LibraryIcon,
  SearchActiveIcon,
  SearchIcon,
  SettingsActiveIcon,
  SettingsIcon,
} from "@/ui/icons";

export type MobileNavTarget = "home" | "search" | "browse" | "library" | "settings";

type Item = {
  target: MobileNavTarget;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  ActiveIcon: ComponentType<{ size?: number }>;
};

const ITEMS: Item[] = [
  { target: "home", label: "Home", Icon: HomeIcon, ActiveIcon: HomeActiveIcon },
  { target: "search", label: "Search", Icon: SearchIcon, ActiveIcon: SearchActiveIcon },
  { target: "browse", label: "Browse", Icon: CompassIcon, ActiveIcon: CompassActiveIcon },
  { target: "library", label: "Library", Icon: LibraryIcon, ActiveIcon: LibraryActiveIcon },
  { target: "settings", label: "Settings", Icon: SettingsIcon, ActiveIcon: SettingsActiveIcon },
];

/**
 * Mobile stand-in for the sidebar and title bar: the five places the desktop chrome reaches,
 * as a bottom tab bar under the player. Pads itself for the gesture/navigation bar.
 */
export function MobileNavBar({
  active,
  onNavigate,
}: {
  active: MobileNavTarget | null;
  onNavigate: (target: MobileNavTarget) => void;
}) {
  return (
    <nav
      className="flex shrink-0 items-stretch justify-around border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      aria-label="Main"
    >
      {ITEMS.map(({ target, label, Icon, ActiveIcon }) => {
        const isActive = active === target;
        const Glyph = isActive ? ActiveIcon : Icon;
        return (
          <button
            key={target}
            type="button"
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate(target)}
          >
            <Glyph size={22} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
