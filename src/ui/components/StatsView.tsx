import { getLocale, msg, tn, useT } from "../../i18n";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { StatsIcon } from "@/ui/icons";
import { LISTEN_LOG_EVENT, readListenLog } from "../../player/listenLog";
import {
  computeListenStats,
  formatListeningTime,
  type Listen,
  type StatsRange,
  type TopEntry,
} from "../../player/listenStats";
import { TrackArtwork } from "./TrackArtwork";

const RANGES: { value: StatsRange; label: string }[] = [
  { value: "week", label: msg("7 days") },
  { value: "month", label: msg("30 days") },
  { value: "year", label: msg("Year") },
  { value: "all", label: msg("All time") },
];

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-card/60 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function shortDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(getLocale(), { weekday: "short" });
}

/** Minutes per day as bars. Bars are the clearest read for "how much, when" across days. */
function DailyBars({ daily }: { daily: { day: string; seconds: number }[] }) {
  const max = Math.max(1, ...daily.map((entry) => entry.seconds));
  const t = useT();
  const labelEvery = daily.length > 14 ? Math.ceil(daily.length / 7) : 1;
  return (
    <figure className="flex flex-col gap-2 rounded-xl bg-card/60 p-4">
      <figcaption className="text-sm font-medium text-foreground">{t("Listening per day")}</figcaption>
      <div className="flex h-32 items-end gap-[2px]" role="img" aria-label={t("Minutes listened per day")}>
        {daily.map((entry) => (
          <div key={entry.day} className="group relative flex h-full min-w-0 flex-1 items-end">
            <div
              className={cn("w-full rounded-t-sm", entry.seconds > 0 ? "bg-primary" : "bg-foreground/10")}
              style={{ height: `${Math.max(entry.seconds > 0 ? 4 : 2, (entry.seconds / max) * 100)}%` }}
            />
            <span className="pointer-events-none absolute -top-6 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-[10px] tabular-nums text-foreground shadow group-hover:block">
              {formatListeningTime(entry.seconds)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-[2px]" aria-hidden="true">
        {daily.map((entry, index) => (
          <span key={entry.day} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground">
            {index % labelEvery === 0 ? (daily.length > 7 ? entry.day.slice(8) : shortDay(entry.day)) : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

function HourStrip({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  const t = useT();
  const peak = hours.indexOf(Math.max(...hours));
  return (
    <figure className="flex flex-col gap-2 rounded-xl bg-card/60 p-4">
      <figcaption className="flex items-baseline justify-between text-sm font-medium text-foreground">
        <span>{t("Time of day")}</span>
        {hours[peak] > 0 ? (
          <span className="text-xs font-normal text-muted-foreground">{t("Mostly around {hour}:00", { hour: String(peak).padStart(2, "0") })}</span>
        ) : null}
      </figcaption>
      <div className="flex h-12 items-end gap-[2px]" role="img" aria-label={t("Listening by hour of day")}>
        {hours.map((seconds, hour) => (
          <div key={hour} className="flex h-full flex-1 items-end">
            <div
              className={cn("w-full rounded-t-sm", hour === peak && seconds > 0 ? "bg-primary" : "bg-primary/40")}
              style={{ height: `${Math.max(2, (seconds / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground" aria-hidden="true">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </figure>
  );
}

function TopList({ title, entries, artwork }: { title: string; entries: TopEntry[]; artwork?: boolean }) {
  const t = useT();
  const max = Math.max(1, ...entries.map((entry) => entry.plays));
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-xl bg-card/60 p-4">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Nothing yet.")}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {entries.map((entry, index) => (
            <li key={entry.key} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              {artwork ? (
                <TrackArtwork artworkUrl={entry.artworkUrl} size={36} iconSize={16} className="size-9 shrink-0 rounded-md" />
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-foreground">{entry.label}</span>
                <span className="relative mt-1 h-1 overflow-hidden rounded-full bg-foreground/10">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(entry.plays / max) * 100}%` }} />
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {tn("{n} play", "{n} plays", entry.plays)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** What you listened to and when, from the listening log. Everything stays on this device. */
export function StatsView() {
  const t = useT();
  const [listens, setListens] = useState<Listen[] | null>(null);
  const [range, setRange] = useState<StatsRange>("month");

  useEffect(() => {
    let cancelled = false;
    const load = () => void readListenLog().then((loaded) => {
      if (!cancelled) setListens(loaded);
    });
    load();
    window.addEventListener(LISTEN_LOG_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(LISTEN_LOG_EVENT, load);
    };
  }, []);

  const stats = useMemo(() => (listens ? computeListenStats(listens, range) : null), [listens, range]);

  if (!stats) return <p className="text-sm text-muted-foreground">{t("Loading…")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("Period")}>
        {RANGES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={range === option.value}
            onClick={() => setRange(option.value)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              range === option.value ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t(option.label)}
          </button>
        ))}
      </div>

      {stats.plays === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-card text-muted-foreground">
            <StatsIcon size={24} aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-foreground">{t("No listening in this period")}</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("A song counts once you have heard 30 seconds of it. Your stats never leave this device.")}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label={t("Listening time")} value={formatListeningTime(stats.totalSeconds)} />
            <Tile label={t("Songs played")} value={String(stats.plays)} hint={t("{count} different", { count: stats.uniqueTracks })} />
            <Tile label={t("Artists")} value={String(stats.uniqueArtists)} />
            <Tile
              label={t("Streak")}
              value={tn("{n} day", "{n} days", stats.streakDays)}
              hint={t("Best in period: {days}", { days: stats.bestStreakDays })}
            />
          </div>
          <DailyBars daily={stats.daily} />
          <HourStrip hours={stats.hours} />
          <div className="grid gap-3 lg:grid-cols-2">
            <TopList title={t("Top songs")} entries={stats.topTracks} artwork />
            <TopList title={t("Top artists")} entries={stats.topArtists} />
          </div>
        </>
      )}
    </div>
  );
}
