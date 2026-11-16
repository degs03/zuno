import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A rotary knob, like the tone controls on an amplifier.
 *
 * Turned by dragging up/down (or left/right) — never by circling, which is fiddly on a phone.
 * A full sweep is ~180 px; Shift is fine control. Double-click/double-tap resets. Arrows, Page
 * keys, Home/End and 0 work as on a slider; the wheel only while focused.
 *
 * The arc runs 270°, from 7:30 to 4:30. The value arc starts at `resetValue`, so a bipolar knob
 * (balance) lights from the top centre and a unipolar one (bass boost) from the left end.
 */
export interface KnobProps {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  resetValue?: number;
  label: string;
  format?: (value: number) => string;
  "aria-label"?: string;
  valueText?: (value: number) => string;
  disabled?: boolean;
  size?: number;
  className?: string;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const SWEEP_DEG = 270;
const START_DEG = -135;
const DRAG_PX = 180;

function polar(cx: number, cy: number, radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function arc(cx: number, cy: number, radius: number, from: number, to: number) {
  if (Math.abs(to - from) < 0.01) return "";
  const [a, b] = from < to ? [from, to] : [to, from];
  const start = polar(cx, cy, radius, a);
  const end = polar(cx, cy, radius, b);
  const large = b - a > 180 ? 1 : 0;
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)}A${radius},${radius} 0 ${large} 1 ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
}

export function Knob({
  value,
  onValueChange,
  min,
  max,
  step,
  resetValue,
  label,
  format = (v) => String(v),
  "aria-label": ariaLabel,
  valueText,
  disabled = false,
  size = 64,
  className,
}: KnobProps) {
  const reduceMotion = useReducedMotion();
  const drag = useRef<{ x: number; y: number; start: number } | null>(null);
  const lastTap = useRef(0);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);

  const reset = clamp(resetValue ?? 0, min, max);
  const current = clamp(value, min, max);
  const angleOf = (v: number) => START_DEG + ((v - min) / (max - min)) * SWEEP_DEG;
  const angle = angleOf(current);

  const commit = (next: number) => {
    const snapped = clamp(Math.round((next - min) / step) * step + min, min, max);
    const clean = Math.round(snapped * 1000) / 1000;
    if (clean !== current) onValueChange(clean);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    const now = performance.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      commit(reset);
      return;
    }
    lastTap.current = now;
    drag.current = { x: event.clientX, y: event.clientY, start: current };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    // Up and right both turn clockwise.
    const travel = (state.y - event.clientY) + (event.clientX - state.x);
    const scale = event.shiftKey ? 0.25 : 1;
    commit(state.start + (travel / DRAG_PX) * (max - min) * scale);
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
      PageUp: current + step * 5,
      PageDown: current - step * 5,
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

  const wheelRef = useRef<(event: WheelEvent) => void>(() => {});
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
    const listener = (event: WheelEvent) => wheelRef.current(event);
    surface.addEventListener("wheel", listener, { passive: false });
    return () => surface.removeEventListener("wheel", listener);
  }, []);

  const c = 50;
  const ring = 42;
  const changed = current !== reset;

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        ref={surfaceRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel ?? label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={current}
        aria-valuetext={valueText?.(current) ?? format(current)}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => !disabled && commit(reset)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(
          "relative touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
          disabled ? "pointer-events-none opacity-50" : dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 100 100" className="size-full overflow-visible" aria-hidden="true">
          {/* Track */}
          <path
            d={arc(c, c, ring, START_DEG, START_DEG + SWEEP_DEG)}
            className="fill-none stroke-foreground/10"
            strokeWidth={7}
            strokeLinecap="round"
          />
          {/* Value, from the reset point */}
          {changed ? (
            <path
              d={arc(c, c, ring, angleOf(reset), angle)}
              className="fill-none stroke-primary"
              strokeWidth={7}
              strokeLinecap="round"
            />
          ) : null}
          {/* Cap */}
          <circle cx={c} cy={c} r={30} className="fill-card stroke-foreground/10" strokeWidth={1.5} />
          <circle cx={c} cy={c} r={26} className="fill-foreground/[0.04]" />
        </svg>
        {/* Pointer line, rotated as one piece so it can spring. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={{ rotate: angle }}
          transition={dragging || reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 30 }}
        >
          <span
            className={cn(
              "absolute left-1/2 top-[24%] h-[16%] w-[5%] -translate-x-1/2 rounded-full",
              changed ? "bg-primary" : "bg-foreground/60",
            )}
          />
        </motion.div>
      </div>
      <span className="text-[11px] font-medium text-foreground">{label}</span>
      <span className={cn("text-[10px] tabular-nums", changed ? "text-primary" : "text-muted-foreground")}>
        {format(current)}
      </span>
    </div>
  );
}
