import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A mixing-desk channel fader: a rail, a cap you push up and down, tick marks and a live readout.
 *
 * - Mouse: press on the rail to jump there, then drag. Touch: always relative to where the
 *   finger landed (with a small dead zone), so a tap meant to scroll never moves the value.
 * - Double-click / double-tap returns to `resetValue`.
 * - Keyboard: arrows step, PageUp/PageDown step ×6, Home/End to the ends, 0 / Delete to reset.
 * - Wheel adjusts only while the fader has focus, so scrolling the page never moves it.
 *
 * Bipolar ranges (like ±12 dB) fill from the reset point; unipolar ones fill from the bottom.
 */
export interface VerticalFaderProps {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** Where double-click and 0/Delete return to. Defaults to 0 clamped into range. */
  resetValue?: number;
  /** Values that get a tick on the rail. */
  ticks?: readonly number[];
  /** Short text above the cap (the readout). */
  format?: (value: number) => string;
  /** Primary label under the fader, e.g. "62". */
  label: string;
  /** Secondary label, e.g. "Bass". */
  sublabel?: string;
  /** Screen-reader name. */
  "aria-label": string;
  /** Spoken value, e.g. "+3 dB". */
  valueText?: (value: number) => string;
  disabled?: boolean;
  /** Draws the fill in the accent colour (the master/preamp channel uses a quieter tone). */
  tone?: "accent" | "neutral";
  /** Highlight this channel (e.g. its band is hovered in the curve). */
  highlighted?: boolean;
  onFocusChange?: (focused: boolean) => void;
  className?: string;
  /** Rail height class. */
  heightClassName?: string;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const TOUCH_DEAD_ZONE_PX = 6;

export function VerticalFader({
  value,
  onValueChange,
  min,
  max,
  step,
  resetValue,
  ticks = [],
  format = (v) => String(v),
  label,
  sublabel,
  "aria-label": ariaLabel,
  valueText,
  disabled = false,
  tone = "accent",
  highlighted = false,
  onFocusChange,
  className,
  heightClassName = "h-44 max-sm:h-40",
}: VerticalFaderProps) {
  const reduceMotion = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startValue: number; touch: boolean; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);

  const reset = clamp(resetValue ?? 0, min, max);
  const current = clamp(value, min, max);
  const ratio = (current - min) / (max - min);
  const resetRatio = (reset - min) / (max - min);
  const fillFrom = Math.min(ratio, resetRatio);
  const fillTo = Math.max(ratio, resetRatio);

  const commit = (next: number) => {
    const snapped = clamp(Math.round((next - min) / step) * step + min, min, max);
    // Float noise from the step arithmetic never reaches a readout.
    const clean = Math.round(snapped * 1000) / 1000;
    if (clean !== current) onValueChange(clean);
  };

  const valueAt = (clientY: number) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return current;
    return min + clamp((rect.bottom - clientY) / rect.height, 0, 1) * (max - min);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    (event.currentTarget.querySelector("[role=slider]") as HTMLElement | null)?.focus({ preventScroll: true });
    const touch = event.pointerType !== "mouse";
    // Double tap resets (dblclick is unreliable on touch).
    const now = performance.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      commit(reset);
      return;
    }
    lastTap.current = now;
    drag.current = { startY: event.clientY, startValue: current, touch, moved: false };
    setDragging(true);
    if (!touch) {
      // The mouse grabs the cap where it is, or jumps the cap to the click if it missed.
      const rect = railRef.current?.getBoundingClientRect();
      if (rect) {
        const capY = rect.bottom - ratio * rect.height;
        if (Math.abs(event.clientY - capY) > 12) {
          const jumped = valueAt(event.clientY);
          commit(jumped);
          drag.current.startValue = jumped;
        }
      }
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || disabled) return;
    const deltaY = state.startY - event.clientY;
    if (state.touch && !state.moved && Math.abs(deltaY) < TOUCH_DEAD_ZONE_PX) return;
    state.moved = true;
    const height = railRef.current?.getBoundingClientRect().height ?? 1;
    // Shift gives fine control on a mouse.
    const scale = event.shiftKey ? 0.25 : 1;
    commit(state.startValue + (deltaY / height) * (max - min) * scale);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const moves: Record<string, number> = {
      ArrowUp: current + step,
      ArrowRight: current + step,
      ArrowDown: current - step,
      ArrowLeft: current - step,
      PageUp: current + step * 6,
      PageDown: current - step * 6,
      Home: min,
      End: max,
      "0": reset,
      Delete: reset,
      Backspace: reset,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    commit(moves[event.key]);
  };

  // Native, non-passive: React's onWheel cannot preventDefault, and the page would scroll too.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<(event: globalThis.WheelEvent) => void>(() => {});
  useEffect(() => {
    wheelRef.current = (event) => {
      if (disabled || !focused) return;
      event.preventDefault();
      commit(current + (event.deltaY < 0 ? step : -step));
    };
  });
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const listener = (event: globalThis.WheelEvent) => wheelRef.current(event);
    surface.addEventListener("wheel", listener, { passive: false });
    return () => surface.removeEventListener("wheel", listener);
  }, []);

  const glide = dragging || reduceMotion ? "duration-0" : "duration-150";
  const active = dragging || focused || highlighted;

  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-1.5", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "h-4 text-[10px] font-semibold tabular-nums transition-colors max-sm:text-[9px]",
          active ? "text-foreground" : current === reset ? "text-muted-foreground/70" : "text-muted-foreground",
        )}
      >
        {format(current)}
      </span>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        ref={surfaceRef}
        onDoubleClick={() => !disabled && commit(reset)}
        className={cn(
          "relative flex w-full touch-none select-none justify-center",
          heightClassName,
          disabled ? "pointer-events-none opacity-50" : dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        {/* Ticks, on both sides of the rail like a printed fader panel. */}
        {ticks.map((tick) => {
          const top = (1 - (clamp(tick, min, max) - min) / (max - min)) * 100;
          const major = tick === reset;
          return (
            <span key={tick} aria-hidden="true" className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: `${top}%` }}>
              <span className={cn("h-px", major ? "w-[70%] bg-foreground/25" : "w-[45%] bg-foreground/10")} />
            </span>
          );
        })}

        <div ref={railRef} className="relative h-full w-1.5 rounded-full bg-foreground/10">
          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-x-0 rounded-full transition-[top,bottom] ease-out",
              glide,
              tone === "accent" ? "bg-primary" : "bg-foreground/40",
            )}
            style={{ bottom: `${fillFrom * 100}%`, top: `${(1 - fillTo) * 100}%` }}
          />
        </div>

        <motion.div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={ariaLabel}
          aria-orientation="vertical"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={current}
          aria-valuetext={valueText?.(current)}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true);
            onFocusChange?.(true);
          }}
          onBlur={() => {
            setFocused(false);
            onFocusChange?.(false);
          }}
          animate={reduceMotion ? undefined : { scale: dragging ? 1.12 : 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
          className={cn(
            "absolute left-1/2 flex h-5 w-[min(100%,2.25rem)] -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-md shadow-md outline-none transition-[bottom] ease-out",
            glide,
            "bg-gradient-to-b from-foreground/95 to-foreground/75 ring-ring focus-visible:ring-2",
            highlighted && !dragging && "ring-2 ring-primary/60",
          )}
          style={{ bottom: `${ratio * 100}%` }}
        >
          <span aria-hidden="true" className={cn("h-0.5 w-[60%] rounded-full", tone === "accent" ? "bg-primary" : "bg-background/70")} />
        </motion.div>
      </div>

      <span aria-hidden="true" className="flex flex-col items-center leading-tight">
        <span className={cn("text-[11px] font-medium tabular-nums max-sm:text-[10px]", active ? "text-foreground" : "text-muted-foreground")}>
          {label}
        </span>
        {sublabel ? <span className="text-[9px] text-muted-foreground/80 max-sm:hidden">{sublabel}</span> : null}
      </span>
    </div>
  );
}
