import { useSyncExternalStore } from "react";
import {
  hydrateLocalJsonSetting,
  readLocalJsonSetting,
  writeLocalJsonSetting,
} from "../../internal/durableLocalSetting";

/**
 * Output devices the user marked as their car (by `deviceKey`). When one connects, car mode
 * opens on its own (currentOutputDevice.ts).
 */
const STORAGE_KEY = "car-devices-v1";
const CHANGE_EVENT = "car-devices-change";
const isList = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === "string");

let cached: string[] | null = null;
const read = () => (cached ??= readLocalJsonSetting(STORAGE_KEY, isList) ?? []);

export function isCarDevice(key: string): boolean {
  return read().includes(key);
}

export function setCarDevice(key: string, isCar: boolean): void {
  const next = read().filter((entry) => entry !== key);
  if (isCar) next.push(key);
  cached = next;
  writeLocalJsonSetting(STORAGE_KEY, next);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export async function hydrateCarDevices(): Promise<void> {
  await hydrateLocalJsonSetting(STORAGE_KEY, isList);
  cached = null;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

export function useCarDevices(): string[] {
  return useSyncExternalStore(subscribe, read, () => []);
}
