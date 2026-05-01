/**
 * viewshedMath — pure helpers for the sampled-ray line-of-sight (LOS)
 * viewshed computation (Phase D4).
 *
 * Technique: **sampled-ray LOS**, NOT GPU-shadow-map. The plan's primary
 * shadow-map approach was timeboxed; the documented fallback is what ships
 * here. It's robust, deterministic, easy to test, and runs in plain JS using
 * the same Float32Array of terrain heights the slope/aspect tool already
 * needs. See `apps/web/src/tools/viewshed/README` (or the plan doc) for the
 * trade-off.
 *
 * Coordinate convention (matches gridCoords / sampleHeightGrid):
 *   - row 0 is the SOUTHERNMOST row.
 *   - heights are row-major: heights[r * cols + c].
 *
 * Algorithm
 * ---------
 *
 * For each cell (col, row) in the bbox grid:
 *
 *   1. Compute the great-circle distance from the observer to the cell
 *      centre. If the distance > maxRangeM, the cell is `out-of-range`.
 *   2. Otherwise, cast a ray from
 *        (observer.lng, observer.lat, observer.height + eyeHeightM)
 *      to
 *        (cell.lng, cell.lat, cell.height).
 *      Sample the ray at `samples` (default 16) intermediate points; at each
 *      sample compare the linear-interpolation height ALONG the ray to the
 *      terrain height at that lng/lat. If the terrain rises above the ray
 *      (plus a small noise epsilon) at any sample, the cell is `not visible`.
 *      Otherwise it's `visible`.
 *
 * The result is a Uint8Array with values:
 *   0 = out-of-range, 1 = not visible, 2 = visible.
 *
 * Planimetric assumption
 * ----------------------
 * For maxRangeM ≤ 10 km we treat the lng/lat plane as planimetric: linear
 * interpolation in lng/lat-space gives effectively the same path as great-
 * circle interpolation (sub-metre error at 10 km, which is well below DEM
 * noise). For larger ranges this would need spherical interpolation; we
 * cap maxRangeM at 10 000 m in the UI for that reason.
 *
 * Sampling-density / epsilon trade-offs
 * -------------------------------------
 *
 *   - `RAY_SAMPLES = 16`: balances cost (~1M evaluations at 256x256) against
 *     thin-ridge robustness. Pure-flat terrain doesn't care; thin ridges
 *     (< (rangeM / 16) wide) can leak. Acceptable for v1.
 *
 *   - `LOS_EPSILON_M = 0.5`: terrain height must rise at least 0.5 m above
 *     the line-of-sight to be considered an obstruction. Absorbs DEM
 *     quantisation noise (Cesium World Terrain ~0.5–2 m vertical resolution
 *     at L15) without losing real obstacles.
 *
 *   - First/last sample skipped: the observer and target points themselves
 *     are not occlusion candidates (the terrain there equals the line by
 *     construction).
 */
import { gridCoords, METRES_PER_DEG_LAT, type BoundingBox } from '@terrain/shared';

/** Number of intermediate samples per ray. */
export const RAY_SAMPLES = 16;

/** Vertical noise tolerance for "terrain is above the ray", in metres. */
export const LOS_EPSILON_M = 0.5;

export interface LngLatHeight {
  lng: number;
  lat: number;
  height: number;
}

/**
 * Great-circle distance in metres, using the equirectangular approximation
 * (acceptable up to ~10 km — the maxRange cap).
 *
 * Exported for tests and for the layer's grid-distance check.
 */
export function approxGroundDistanceM(
  aLng: number,
  aLat: number,
  bLng: number,
  bLat: number,
): number {
  const midLat = (aLat + bLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const dx = (bLng - aLng) * METRES_PER_DEG_LAT * cosLat;
  const dy = (bLat - aLat) * METRES_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/**
 * Ray-march line-of-sight test from `observer` (with eye height applied) to
 * `target`. Samples the ray at `samples` interior points (default 16) — the
 * observer and target endpoints themselves are skipped.
 *
 * `sampleHeightAt(lng, lat)` returns the terrain height (metres) at any
 * lng/lat. The caller controls how this is sampled (nearest-neighbor over
 * a precomputed grid is the v1 strategy).
 *
 * Returns true if the target is visible (no sampled terrain rises above the
 * ray by more than LOS_EPSILON_M); false if any interior sample occludes.
 */
export function lineOfSightVisible(
  observer: LngLatHeight,
  eyeHeightM: number,
  target: LngLatHeight,
  sampleHeightAt: (lng: number, lat: number) => number,
  samples = RAY_SAMPLES,
): boolean {
  const obsHeight = observer.height + eyeHeightM;
  const dLng = target.lng - observer.lng;
  const dLat = target.lat - observer.lat;
  const dH = target.height - obsHeight;

  // Skip i = 0 (observer) and i = samples (target). Sample at i = 1 .. samples-1.
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const lng = observer.lng + dLng * t;
    const lat = observer.lat + dLat * t;
    const lineH = obsHeight + dH * t;
    const terrainH = sampleHeightAt(lng, lat);
    if (terrainH > lineH + LOS_EPSILON_M) {
      return false;
    }
  }
  return true;
}

export interface ViewshedGrid {
  /** Row-major heights; length cols*rows. */
  heights: Float32Array;
  cols: number;
  rows: number;
  bbox: BoundingBox;
}

/**
 * Computes the visibility mask for every cell in `grid`.
 *
 * The observer must already have an accurate terrain height in
 * `observer.height`. `eyeHeightM` is added to that height to form the eye
 * position. `maxRangeM` clips far cells to `0` (out-of-range).
 *
 * Returns a Uint8Array of length cols*rows in row-major order:
 *   0 = out-of-range
 *   1 = not visible
 *   2 = visible
 */
export function computeViewshedGrid(
  grid: ViewshedGrid,
  observer: LngLatHeight,
  eyeHeightM: number,
  maxRangeM: number,
): Uint8Array {
  const { heights, cols, rows, bbox } = grid;
  if (heights.length !== cols * rows) {
    throw new Error(
      `computeViewshedGrid: heights.length (${heights.length}) !== cols*rows (${cols * rows})`,
    );
  }
  const coords = gridCoords(bbox, cols, rows);
  const out = new Uint8Array(cols * rows);

  // Nearest-neighbor lookup over the precomputed grid. v1 design choice:
  // nearest-neighbor is faster and the resulting under-sampling has the
  // same magnitude as DEM noise (which the LOS_EPSILON already absorbs).
  // Bilinear interpolation could be substituted later without rippling
  // through the rest of the code.
  const stepLng = (bbox.east - bbox.west) / cols;
  const stepLat = (bbox.north - bbox.south) / rows;
  const sampleHeightAt = (lng: number, lat: number): number => {
    const c = Math.floor((lng - bbox.west) / stepLng);
    const r = Math.floor((lat - bbox.south) / stepLat);
    const cc = Math.max(0, Math.min(cols - 1, c));
    const rr = Math.max(0, Math.min(rows - 1, r));
    return heights[rr * cols + cc]!;
  };

  for (let i = 0; i < coords.length; i++) {
    const cell = coords[i]!;
    const cellHeight = heights[i]!;

    const dist = approxGroundDistanceM(observer.lng, observer.lat, cell.lng, cell.lat);
    if (dist > maxRangeM) {
      out[i] = 0;
      continue;
    }

    // Tiny optimisation: when the cell is the observer's own grid cell the
    // line-of-sight loop has zero interior samples anyway; mark it visible
    // explicitly so synthetic-grid tests are easy to reason about.
    if (dist < 1e-6) {
      out[i] = 2;
      continue;
    }

    const target: LngLatHeight = {
      lng: cell.lng,
      lat: cell.lat,
      height: cellHeight,
    };
    out[i] = lineOfSightVisible(observer, eyeHeightM, target, sampleHeightAt) ? 2 : 1;
  }
  return out;
}
