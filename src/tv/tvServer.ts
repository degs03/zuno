/**
 * The "Zuno on the TV" setting: turns the LAN server (src-tauri/src/tv_server.rs) on and off,
 * remembers the pairing code so a paired TV survives restarts, and exposes the live status to
 * the Settings card.
 */

import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";

import { getAppSetting, getInvokeErrorMessage, setAppSetting } from "../internal/appSettings";
import { isMobile } from "../ui/platform";
import { startTvBridge } from "./tvBridge";

export type TvServerInfo = {
  enabled: boolean;
  port: number;
  ip: string | null;
  code: string;
  lastClient: string | null;
  lastSeenMs: number | null;
};

type TvServerState = { info: TvServerInfo | null; busy: boolean; error: string | null };

const ENABLED_KEY = "tvServer.enabled";
const CODE_KEY = "tvServer.code";

let state: TvServerState = { info: null, busy: false, error: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<TvServerState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

async function start(): Promise<void> {
  startTvBridge();
  const code = await getAppSetting<string>(CODE_KEY);
  const info = await invoke<TvServerInfo>("tv_server_start", { code });
  await setAppSetting(CODE_KEY, info.code);
  setState({ info, error: null });
}

/** At launch: bring the server back up if the user left it on. */
export async function initTvServer(): Promise<void> {
  if (isMobile) return;
  try {
    if (await getAppSetting<boolean>(ENABLED_KEY)) await start();
  } catch (error) {
    setState({ error: getInvokeErrorMessage(error) });
  }
}

export async function setTvServerEnabled(enabled: boolean): Promise<void> {
  setState({ busy: true, error: null });
  try {
    await setAppSetting(ENABLED_KEY, enabled);
    if (enabled) await start();
    else setState({ info: await invoke<TvServerInfo>("tv_server_stop") });
  } catch (error) {
    setState({ error: getInvokeErrorMessage(error) });
  } finally {
    setState({ busy: false });
  }
}

export async function newTvServerCode(): Promise<void> {
  try {
    const info = await invoke<TvServerInfo>("tv_server_new_code");
    await setAppSetting(CODE_KEY, info.code);
    setState({ info });
  } catch (error) {
    setState({ error: getInvokeErrorMessage(error) });
  }
}

export async function refreshTvServerInfo(): Promise<void> {
  if (isMobile) return;
  try {
    setState({ info: await invoke<TvServerInfo>("tv_server_info") });
  } catch {
    // Older backend or not ready yet: the card just shows the switch.
  }
}

export function useTvServer(): TvServerState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
