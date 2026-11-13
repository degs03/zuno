/*
 * Events from the native Android side (ZunoPlugin.kt), which dispatches them on `window` as
 * `zuno-android` CustomEvents rather than through Tauri's event system — that needs no plugin
 * ACL and works the same before and after Tauri's IPC is ready.
 */
import { isAndroid } from "./platform";

export type AndroidMediaEvent = {
  type: "media";
  action: "play" | "pause" | "playPause" | "next" | "previous" | "seekTo";
  positionSec?: number;
};

type AndroidEvent = AndroidMediaEvent;

export function onAndroidEvent<T extends AndroidEvent["type"]>(
  type: T,
  callback: (event: Extract<AndroidEvent, { type: T }>) => void,
): () => void {
  if (!isAndroid) return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AndroidEvent>).detail;
    if (detail?.type === type) callback(detail as Extract<AndroidEvent, { type: T }>);
  };
  window.addEventListener("zuno-android", listener);
  return () => window.removeEventListener("zuno-android", listener);
}

/*
 * The system back button. MainActivity asks `window.__zunoHandleBack()` first; the most recently
 * registered handler that returns true consumes the press (closing now playing, the queue, a
 * search…). When none does, the app moves to the background — it does not quit, so music keeps
 * playing.
 */
type BackHandler = () => boolean;
const backHandlers: BackHandler[] = [];

declare global {
  interface Window {
    __zunoHandleBack?: () => boolean;
  }
}

if (isAndroid && typeof window !== "undefined") {
  window.__zunoHandleBack = () => {
    for (let index = backHandlers.length - 1; index >= 0; index -= 1) {
      if (backHandlers[index]()) return true;
    }
    return false;
  };
}

export function registerBackHandler(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const index = backHandlers.lastIndexOf(handler);
    if (index >= 0) backHandlers.splice(index, 1);
  };
}
