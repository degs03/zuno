import { playerController } from "../../player/playerStore";
import { t } from "../../i18n";
import { showNotice } from "../notice";
import { createShakeDetector } from "./shakeDetector";

/** How close to the end the sleep timer listens for a shake (the motion sensor costs battery). */
const LISTEN_WINDOW_MS = 90_000;
const EXTEND_MINUTES = 10;

let started = false;

/**
 * Shake the phone near the end of a sleep timer to add ten minutes — the half-asleep "not yet"
 * that does not need finding a button in the dark. Listens to the motion sensor only during the
 * last 90 seconds of a running timer.
 */
export function startSleepShake(): void {
  if (started || typeof window === "undefined" || !("DeviceMotionEvent" in window)) return;
  started = true;
  let listening = false;
  const detect = createShakeDetector();

  const onMotion = (event: DeviceMotionEvent) => {
    const a = event.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    if (!detect(a.x, a.y, a.z, event.timeStamp)) return;
    playerController.extendSleepTimer(EXTEND_MINUTES);
    try {
      navigator.vibrate?.([40, 60, 40]);
    } catch {
      // Optional.
    }
    showNotice(t("Sleep timer: +{n} min", { n: EXTEND_MINUTES }));
  };

  window.setInterval(() => {
    const remaining = playerController.getSleepTimerRemainingMs();
    const want = remaining !== null && remaining > 0 && remaining <= LISTEN_WINDOW_MS;
    if (want && !listening) {
      window.addEventListener("devicemotion", onMotion);
      listening = true;
    } else if (!want && listening) {
      window.removeEventListener("devicemotion", onMotion);
      listening = false;
    }
  }, 3_000);
}
