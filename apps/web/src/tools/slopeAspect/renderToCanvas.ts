/**
 * renderSlopeCanvas — paints a slope-or-aspect Float32Array onto an
 * `HTMLCanvasElement`, one pixel per grid cell, with a colormap.
 *
 * The returned canvas has dimensions `cols × rows` (one canvas pixel per
 * grid cell) — Cesium's `SingleTileImageryProvider` will stretch the
 * resulting raster across the bbox at draw time.
 *
 * ## Slope colormap
 *
 * 0–60° linearly mapped through a viridis-like ramp:
 *   0°   → green   (#1f9e89)
 *   20°  → yellow  (#fde725)
 *   40°  → orange  (#fb9b06)
 *   60°+ → dark red (#b30000)  (clamped above 60°)
 *
 * ## Aspect colormap (8-way compass, stepped)
 *
 *   N  (337.5–22.5)   → blue
 *   NE (22.5–67.5)    → cyan
 *   E  (67.5–112.5)   → green
 *   SE (112.5–157.5)  → yellow-green
 *   S  (157.5–202.5)  → yellow
 *   SW (202.5–247.5)  → orange
 *   W  (247.5–292.5)  → red
 *   NW (292.5–337.5)  → magenta
 *
 *   aspect = -1 (flat) → fully transparent
 *
 * ## Alpha
 *
 * Default `alpha = 0.55` — the satellite drape underneath should still be
 * visible.
 */

const DEFAULT_ALPHA = 0.55;

interface Stop {
  pos: number; // input scalar at this stop
  rgb: [number, number, number];
}

const SLOPE_STOPS: Stop[] = [
  { pos: 0, rgb: [31, 158, 137] },    // teal-green
  { pos: 20, rgb: [253, 231, 37] },   // yellow
  { pos: 40, rgb: [251, 155, 6] },    // orange
  { pos: 60, rgb: [179, 0, 0] },      // dark red
];

/** Linear interpolation through `SLOPE_STOPS`. Inputs outside [0, 60] clamp. */
function slopeRgb(slopeDeg: number): [number, number, number] {
  if (slopeDeg <= SLOPE_STOPS[0]!.pos) return SLOPE_STOPS[0]!.rgb;
  if (slopeDeg >= SLOPE_STOPS[SLOPE_STOPS.length - 1]!.pos) {
    return SLOPE_STOPS[SLOPE_STOPS.length - 1]!.rgb;
  }
  for (let i = 1; i < SLOPE_STOPS.length; i++) {
    const a = SLOPE_STOPS[i - 1]!;
    const b = SLOPE_STOPS[i]!;
    if (slopeDeg <= b.pos) {
      const t = (slopeDeg - a.pos) / (b.pos - a.pos);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
      ];
    }
  }
  return SLOPE_STOPS[SLOPE_STOPS.length - 1]!.rgb;
}

/** 8-way compass aspect colormap. */
const ASPECT_COLORS: [number, number, number][] = [
  [59, 130, 246],   // N — blue-500
  [34, 211, 238],   // NE — cyan-400
  [34, 197, 94],    // E — green-500
  [163, 230, 53],   // SE — lime-400
  [250, 204, 21],   // S — yellow-400
  [249, 115, 22],   // SW — orange-500
  [239, 68, 68],    // W — red-500
  [217, 70, 239],   // NW — fuchsia-500
];

/** Bucket a [0, 360) compass aspect into one of 8 colors. */
function aspectRgb(aspectDeg: number): [number, number, number] {
  // Normalise into [0, 360).
  let a = aspectDeg % 360;
  if (a < 0) a += 360;
  // Shift by 22.5 so the N bucket is centred on 0°.
  const shifted = (a + 22.5) % 360;
  const bucket = Math.floor(shifted / 45) % 8;
  return ASPECT_COLORS[bucket]!;
}

export interface RenderOptions {
  mode: 'slope' | 'aspect';
  /** Layer alpha [0, 1]. Default 0.55. */
  alpha?: number;
}

/**
 * Builds the raw RGBA byte buffer for the slope/aspect raster.
 *
 * Exported for tests so we can verify pixel output without needing a real
 * 2D canvas context (jsdom's `<canvas>` has no working `getContext('2d')`).
 *
 * Output is row-major in canvas-pixel order: y=0 is the TOP (north), so the
 * source row index is flipped on the way in (gridCoords row=0 is south).
 */
export function buildSlopeAspectRgba(
  data: Float32Array,
  cols: number,
  rows: number,
  opts: RenderOptions,
): Uint8ClampedArray {
  if (data.length !== cols * rows) {
    throw new Error(
      `buildSlopeAspectRgba: data.length (${data.length}) !== cols*rows (${cols * rows})`,
    );
  }
  const alpha = opts.alpha ?? DEFAULT_ALPHA;
  const alphaByte = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  const buf = new Uint8ClampedArray(cols * rows * 4);

  for (let r = 0; r < rows; r++) {
    const yPixel = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const srcIdx = r * cols + c;
      const dstIdx = (yPixel * cols + c) * 4;
      const v = data[srcIdx]!;

      let rgba: [number, number, number, number];
      if (opts.mode === 'aspect') {
        if (v < 0) {
          rgba = [0, 0, 0, 0];
        } else {
          const [rr, gg, bb] = aspectRgb(v);
          rgba = [rr, gg, bb, alphaByte];
        }
      } else {
        if (v <= 0) {
          rgba = [0, 0, 0, 0];
        } else {
          const [rr, gg, bb] = slopeRgb(v);
          rgba = [rr, gg, bb, alphaByte];
        }
      }
      buf[dstIdx + 0] = rgba[0];
      buf[dstIdx + 1] = rgba[1];
      buf[dstIdx + 2] = rgba[2];
      buf[dstIdx + 3] = rgba[3];
    }
  }
  return buf;
}

export function renderSlopeCanvas(
  data: Float32Array,
  cols: number,
  rows: number,
  opts: RenderOptions,
): HTMLCanvasElement {
  const buf = buildSlopeAspectRgba(data, cols, rows, opts);

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  // jsdom throws "Not implemented" when calling `getContext('2d')` because
  // node has no native canvas. In tests we don't need the painted bytes;
  // see `buildSlopeAspectRgba` for the unit-tested pixel logic.
  let ctx: ReturnType<HTMLCanvasElement['getContext']> = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    return canvas;
  }
  if (!ctx) return canvas;
  const imgData = ctx.createImageData(cols, rows);
  imgData.data.set(buf);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
