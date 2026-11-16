// Self-check for the cover → accent picker (`npm run check`).
import { pickAccentColor } from "./accentFromImage";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

/** An RGBA buffer: `parts` of [r, g, b, pixelCount]. */
function image(parts: [number, number, number, number][]): number[] {
  return parts.flatMap(([r, g, b, count]) => Array.from({ length: count }, () => [r, g, b, 255]).flat());
}

function hue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

const grey = pickAccentColor(image([[40, 40, 40, 500], [200, 200, 200, 500]]));
check(grey === null, "a greyscale cover gives no accent");

// A mostly grey cover with a vivid blue detail: blue wins over the grey majority.
const blue = pickAccentColor(image([[60, 60, 60, 900], [20, 80, 230, 100]]));
check(blue !== null && Math.abs(hue(blue) - 225) < 15, `the vivid blue detail wins (got ${blue})`);

// Red vs a larger but dull brown: the saturated red wins.
const red = pickAccentColor(image([[110, 90, 70, 600], [230, 20, 40, 300]]));
check(red !== null && (hue(red) > 340 || hue(red) < 10), `vivid red beats dull brown (got ${red})`);

// Output is always a valid hex and brighter on dark theme than on light.
const dark = pickAccentColor(image([[0, 200, 120, 400]]))!;
const light = pickAccentColor(image([[0, 200, 120, 400]]), { light: true })!;
check(/^#[0-9a-f]{6}$/.test(dark) && /^#[0-9a-f]{6}$/.test(light), "hex output");
check(parseInt(dark.slice(3, 5), 16) > parseInt(light.slice(3, 5), 16), "the light-theme accent is deeper");

// Transparent pixels are ignored.
check(pickAccentColor([255, 0, 0, 0, 255, 0, 0, 0]) === null, "fully transparent images give no accent");

console.log("accentFromImage: ok");
