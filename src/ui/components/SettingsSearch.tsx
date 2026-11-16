import { useMemo } from "react";
import { useT } from "../../i18n";
import { SearchIcon } from "../icons";
import { searchSettings, type SettingsTab } from "./settingsSearchIndex";

export type { SettingsTab } from "./settingsSearchIndex";

export function SettingsSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const t = useT();
  const resultCount = useMemo(() => searchSettings(query).length, [query]);
  const active = query.trim().length > 0;

  return (
    <label className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-border bg-card/70 px-3 text-muted-foreground transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
      <SearchIcon size={18} aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onQueryChange("");
        }}
        placeholder={t("Search settings")}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        aria-label={t("Search settings")}
      />
      {active ? <span className="text-xs tabular-nums">{resultCount}</span> : null}
    </label>
  );
}

export function SettingsSearchResults({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (tab: SettingsTab) => void;
}) {
  const t = useT();
  const results = useMemo(() => searchSettings(query), [query]);

  return (
    <section className="flex flex-col gap-1 rounded-xl border border-border bg-card/50 p-1.5" aria-label={t("Setting search results")}>
      {results.length > 0 ? results.map((result) => (
        <button
          key={`${result.tab}-${result.title}`}
          type="button"
          onClick={() => onSelect(result.tab)}
          className="flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="flex items-baseline justify-between gap-3">
            <strong className="text-sm font-medium text-foreground">{t(result.title)}</strong>
            <span className="shrink-0 text-xs text-muted-foreground">{t(result.category)}</span>
          </span>
          <span className="text-sm text-muted-foreground">{t(result.description)}</span>
        </button>
      )) : (
        <p className="px-3 py-2 text-sm text-muted-foreground">{t("No settings match “{query}”.", { query: query.trim() })}</p>
      )}
    </section>
  );
}
