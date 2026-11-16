import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { useT } from "../../i18n";

/**
 * Zuno's own colour picker: a saturation/brightness square and a hue rail, both draggable with
 * a finger or a mouse, plus a hex field and a live preview. Replaces the native colour input,
 * which looks different on every platform and opens a system dialog on Android.
 *
 * Works in HSV because that is what the two surfaces are: hue picks the rail position, the
 * square is saturation (x) against value (y).
 */

type Hsv = { h: number; s: number; v: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function hexToHsv(hex: string): Hsv {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? delta / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    const channel = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(channel * 255).toString(16).padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Best label colour on `hex` and the contrast it reaches. */
function labelOn(hex: string): { color: string; ratio: number } {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onBlack = (l + 0.05) / 0.05;
  return onWhite >= onBlack ? { color: "#ffffff", ratio: onWhite } : { color: "#0a0a0a", ratio: onBlack };
}

/** Pointer drag over an element, reporting the 0..1 position under the finger or cursor. */
function useDrag(onMove: (x: number, y: number) => void) {
  const dragging = useRef(false);
  const report = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      onMove(clamp01((event.clientX - box.left) / box.width), clamp01((event.clientY - box.top) / box.height));
    },
    [onMove],
  );
  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      dragging.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      report(event);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (dragging.current) report(event);
    },
    onPointerUp: () => {
      dragging.current = false;
    },
    onPointerCancel: () => {
      dragging.current = false;
    },
  };
}

export function ColorPicker({
  value,
  onApply,
  onCancel,
}: {
  value: string;
  onApply: (hex: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const hex = hsvToHex(hsv);
  const [draft, setDraft] = useState(hex);
  useEffect(() => setDraft(hex), [hex]);

  const square = useDrag(useCallback((x: number, y: number) => setHsv((c) => ({ ...c, s: x, v: 1 - y })), []));
  const rail = useDrag(useCallback((x: number) => setHsv((c) => ({ ...c, h: x * 360 })), []));

  const nudge = (event: KeyboardEvent, apply: (step: number) => void) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") apply(-step);
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") apply(step);
    else return;
    event.preventDefault();
  };

  const label = labelOn(hex);
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div className="flex w-full flex-col gap-3 p-1">
      <div
        {...square}
        role="slider"
        tabIndex={0}
        aria-label={t("Saturation and brightness")}
        aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            const step = (event.shiftKey ? 0.1 : 0.02) * (event.key === "ArrowUp" ? 1 : -1);
            setHsv((c) => ({ ...c, v: clamp01(c.v + step) }));
            event.preventDefault();
            return;
          }
          nudge(event, (step) => setHsv((c) => ({ ...c, s: clamp01(c.s + step) })));
        }}
        className="relative h-44 w-full cursor-crosshair touch-none rounded-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          backgroundColor: hueColor,
          backgroundImage: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.4)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hex }}
        />
      </div>

      <div
        {...rail}
        role="slider"
        tabIndex={0}
        aria-label={t("Hue")}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onKeyDown={(event) => nudge(event, (step) => setHsv((c) => ({ ...c, h: (c.h + step * 360 + 360) % 360 })))}
        className="relative h-7 w-full cursor-pointer touch-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.4)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueColor }}
        />
      </div>

      <div className="flex items-center gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-full text-xs font-bold"
          style={{ backgroundColor: hex, color: label.color, boxShadow: `0 0 22px -4px ${hex}` }}
          aria-hidden="true"
        >
          Aa
        </span>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-row bg-muted/60 px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
          <span className="text-sm text-muted-foreground">#</span>
          <input
            aria-label={t("Hex colour")}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase text-foreground outline-none"
            value={draft.replace("#", "")}
            maxLength={6}
            onChange={(event) => {
              const next = `#${event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6)}`;
              setDraft(next);
              if (/^#[0-9a-f]{6}$/i.test(next)) setHsv(hexToHsv(next.toLowerCase()));
            }}
          />
        </label>
      </div>

      {label.ratio < 4.5 ? (
        <p className="text-xs text-muted-foreground">
          {t("Labels on this colour will be hard to read. A slightly darker or lighter shade will work better.")}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="pressable min-h-10 flex-1 rounded-full bg-muted px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("Cancel")}
        </button>
        <button
          type="button"
          onClick={() => onApply(hex)}
          className={cn(
            "pressable min-h-10 flex-1 rounded-full px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          style={{ backgroundColor: hex, color: label.color }}
        >
          {t("Use this colour")}
        </button>
      </div>
    </div>
  );
}
