// Recognises a deliberate shake in accelerometer samples. Pure, so it can be checked.

/**
 * Returns a feeder for (x, y, z, timeMs) samples including gravity; it returns true once per
 * shake. A shake is two strong jolts (beyond `threshold` m/s² of extra force) within
 * `windowMs`, so a bump of the phone on a nightstand does not count. After firing it ignores
 * input for `cooldownMs`.
 */
export function createShakeDetector({ threshold = 13, windowMs = 900, cooldownMs = 2_500 } = {}) {
  let firstJolt = -Infinity;
  let lastJolt = -Infinity;
  let firedAt = -Infinity;
  return (x: number, y: number, z: number, timeMs: number): boolean => {
    if (timeMs - firedAt < cooldownMs) return false;
    const force = Math.abs(Math.sqrt(x * x + y * y + z * z) - 9.81);
    if (force < threshold) return false;
    // Samples of the same jolt arrive ~16 ms apart; only a new swing counts as a second jolt.
    if (timeMs - lastJolt < 120) {
      lastJolt = timeMs;
      return false;
    }
    lastJolt = timeMs;
    if (timeMs - firstJolt <= windowMs) {
      firstJolt = -Infinity;
      firedAt = timeMs;
      return true;
    }
    firstJolt = timeMs;
    return false;
  };
}
