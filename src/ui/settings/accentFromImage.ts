// Picks an accent colour from a cover's pixels. Pure, so it can be checked.

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [hue * 60, saturation, lightness];
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const k = (n: number) => (n + hue / 30) % 12;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const value = lightness - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const HUE_BUCKETS = 24;

/**
 * The cover's most *characteristic* colour, tuned to work as an accent.
 *
 * Pixels are grouped by hue; each counts by how colourful it is (saturation, and not near
 * black or white), so a big grey background loses to a small vivid detail — which is what a
 * person would call "the colour of that cover". The winning hue's average is then pushed to
 * accent strength: saturated, and at a lightness that reads on the dark theme (`light` pulls it
 * darker for the light theme). Null when the cover is essentially greyscale.
 *
 * `pixels` is RGBA, as from `ImageData.data`.
 */
export function pickAccentColor(pixels: ArrayLike<number>, options: { light?: boolean } = {}): string | null {
  const weight = new Array<number>(HUE_BUCKETS).fill(0);
  const hueSin = new Array<number>(HUE_BUCKETS).fill(0);
  const hueCos = new Array<number>(HUE_BUCKETS).fill(0);
  const sat = new Array<number>(HUE_BUCKETS).fill(0);
  let colourful = 0;
  let total = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    total += 1;
    const [hue, saturation, lightness] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (saturation < 0.22 || lightness < 0.12 || lightness > 0.92) continue;
    colourful += 1;
    // Mid-lightness, saturated pixels are the "colour"; washed or murky ones count less.
    const w = saturation * (1 - Math.abs(lightness - 0.5) * 1.4);
    if (w <= 0) continue;
    const bucket = Math.floor((hue / 360) * HUE_BUCKETS) % HUE_BUCKETS;
    weight[bucket] += w;
    hueSin[bucket] += Math.sin((hue * Math.PI) / 180) * w;
    hueCos[bucket] += Math.cos((hue * Math.PI) / 180) * w;
    sat[bucket] += saturation * w;
  }

  // Under ~4% colourful pixels: a black-and-white cover. Inventing a hue would be noise.
  if (total === 0 || colourful / total < 0.04) return null;

  // Neighbouring buckets reinforce each other, so a hue split across a boundary still wins.
  let best = -1;
  let bestScore = 0;
  for (let b = 0; b < HUE_BUCKETS; b += 1) {
    const score = weight[b] + 0.5 * (weight[(b + 1) % HUE_BUCKETS] + weight[(b + HUE_BUCKETS - 1) % HUE_BUCKETS]);
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  if (best < 0 || weight[best] === 0) return null;

  const hue = ((Math.atan2(hueSin[best], hueCos[best]) * 180) / Math.PI + 360) % 360;
  const saturation = Math.min(1, Math.max(0.68, sat[best] / weight[best]));
  const lightness = options.light ? 0.42 : 0.6;
  return hslToHex(hue, saturation, lightness);
}
