import type { ColormapName } from './types';

type RGB = [number, number, number];

const STOPS: Record<ColormapName, RGB[]> = {
  // ParaView default diverging Cool-to-Warm (Moreland)
  coolwarm: [
    [59, 76, 192],
    [98, 130, 234],
    [141, 176, 254],
    [184, 208, 249],
    [221, 221, 221],
    [245, 196, 173],
    [244, 154, 123],
    [222, 96, 77],
    [180, 4, 38],
  ],
  // Perceptually uniform Viridis
  viridis: [
    [68, 1, 84],
    [72, 40, 120],
    [62, 74, 137],
    [49, 104, 142],
    [38, 130, 142],
    [31, 158, 137],
    [53, 183, 121],
    [109, 205, 89],
    [180, 222, 44],
    [253, 231, 37],
  ],
  // Thermal Plasma
  plasma: [
    [13, 8, 135],
    [75, 3, 161],
    [125, 3, 168],
    [168, 34, 150],
    [203, 70, 121],
    [229, 107, 93],
    [248, 148, 65],
    [253, 195, 40],
    [240, 249, 33],
  ],
  // Google Turbo (high-contrast spectral)
  turbo: [
    [48, 18, 59],
    [65, 69, 171],
    [40, 130, 232],
    [27, 208, 213],
    [82, 246, 122],
    [180, 240, 56],
    [245, 182, 39],
    [234, 96, 26],
    [164, 20, 12],
  ],
};

// Precomputed 256-entry LUT per colormap for zero-allocation fast lookups
const LUTS: Record<ColormapName, Uint8Array> = {
  coolwarm: buildLut(STOPS.coolwarm),
  viridis: buildLut(STOPS.viridis),
  plasma: buildLut(STOPS.plasma),
  turbo: buildLut(STOPS.turbo),
};

function buildLut(stops: RGB[]): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  const n = stops.length - 1;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const scaled = t * n;
    const idx = Math.min(n - 1, Math.floor(scaled));
    const frac = scaled - idx;
    const a = stops[idx];
    const b = stops[idx + 1];
    lut[i * 3] = Math.round(a[0] + (b[0] - a[0]) * frac);
    lut[i * 3 + 1] = Math.round(a[1] + (b[1] - a[1]) * frac);
    lut[i * 3 + 2] = Math.round(a[2] + (b[2] - a[2]) * frac);
  }
  return lut;
}

export function sampleColormapRgb255(
  name: ColormapName,
  t: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const idx = Math.round(clamped * 255) * 3;
  const lut = LUTS[name];
  out[0] = lut[idx];
  out[1] = lut[idx + 1];
  out[2] = lut[idx + 2];
  return out;
}

export function sampleColormapNormalized(
  name: ColormapName,
  t: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  sampleColormapRgb255(name, t, out);
  out[0] /= 255;
  out[1] /= 255;
  out[2] /= 255;
  return out;
}

export function getColormapCssGradient(name: ColormapName, vertical = true): string {
  const stops = STOPS[name];
  const dir = vertical ? 'to top' : 'to right';
  const parts = stops.map((rgb, i) => {
    const pct = Math.round((i / (stops.length - 1)) * 100);
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]}) ${pct}%`;
  });
  return `linear-gradient(${dir}, ${parts.join(', ')})`;
}
