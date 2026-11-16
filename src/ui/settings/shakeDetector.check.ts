// Self-check for the shake detector (`npm run check`).
import { createShakeDetector } from "./shakeDetector";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

const still = createShakeDetector();
let fired = false;
for (let t = 0; t < 3000; t += 16) fired ||= still(0, 0, 9.81, t);
check(!fired, "a phone lying still never fires");

const bump = createShakeDetector();
fired = false;
for (let t = 0; t < 100; t += 16) fired ||= bump(0, 30, 9.81, t); // one jolt, several samples
for (let t = 100; t < 3000; t += 16) fired ||= bump(0, 0, 9.81, t);
check(!fired, "a single bump is not a shake");

const shake = createShakeDetector();
const results: boolean[] = [];
for (let t = 0; t < 1200; t += 16) {
  const swing = Math.floor(t / 300) % 2 === 0 && t % 300 < 48; // jolts at 0, 600 ms
  results.push(shake(swing ? 28 : 0, 0, 9.81, t));
}
check(results.filter(Boolean).length === 1, "two jolts close together fire exactly once");

const slow = createShakeDetector();
fired = false;
fired ||= slow(30, 0, 9.81, 0);
fired ||= slow(30, 0, 9.81, 2000);
check(!fired, "two jolts far apart are not a shake");

console.log("shakeDetector: ok");
