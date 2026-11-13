import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

/** Long enough not to fire on a deliberate tap, short enough not to feel like waiting. */
const HOLD_MS = 450;
/** A finger that moves further than this is scrolling, not holding. */
const SLOP_PX = 8;

/**
 * Touch long-press, delivered as the same event shape a right-click produces.
 *
 * Context menus in this app open from `onContextMenu`, and whether a WebView turns a long-press
 * into `contextmenu` differs by device and version. This makes it explicit: hold a row or a
 * card and its existing menu opens at the finger, the same as right-clicking it on desktop.
 *
 * Mouse and pen are ignored — they have a real right button. The click that ends a long-press
 * is swallowed (`onClickCapture`), so holding a track to open its menu does not also play it.
 */
export function useLongPress(onLongPress: ((event: MouseEvent<HTMLElement>) => void) | undefined) {
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      fired.current = false;
      if (event.pointerType !== "touch" || !callback.current) return;
      cancel();
      const { clientX, clientY } = event;
      const target = event.currentTarget;
      start.current = { x: clientX, y: clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        navigator.vibrate?.(12);
        callback.current?.({
          clientX,
          clientY,
          currentTarget: target,
          target,
          button: 2,
          preventDefault() {},
          stopPropagation() {},
        } as unknown as MouseEvent<HTMLElement>);
      }, HOLD_MS);
    },
    [cancel],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (timer.current === null) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (dx * dx + dy * dy > SLOP_PX * SLOP_PX) cancel();
    },
    [cancel],
  );

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!fired.current) return;
    fired.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture,
  };
}
