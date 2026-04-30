/**
 * Pure building-height calculation.
 *
 * Resolves an extrudedHeight (top of the prism) and a baseHeight (bottom of
 * the prism, normally 0 unless `min_height` says otherwise) for a single OSM
 * building feature.
 *
 * Resolution order for `height`:
 *   1. `properties.height` — parsed leniently (strings like "12 m" or
 *      "approx. 8" are accepted; we extract the leading number).
 *   2. `properties['building:levels']` — if present, returns `levels * 3 m`.
 *   3. Default: `DEFAULT_HEIGHT_M` (6 m, ≈ a two-storey residential building).
 *
 * Output is clamped to `[MIN_HEIGHT_M, MAX_HEIGHT_M]` to defend against
 * malformed tags (e.g. `height=10000`). MAX_HEIGHT_M is taller than One World
 * Trade Center.
 *
 * @returns `{ height, baseHeight }` — both are non-negative finite numbers in
 *          metres. `height > baseHeight` is guaranteed.
 */
import type { Feature } from 'geojson';

/** Default height for buildings with no `height` or `building:levels` tag. */
export const DEFAULT_HEIGHT_M = 6;
/** Floor for the resolved height — guards against `height=0` or negative tags. */
export const MIN_HEIGHT_M = 1;
/** Ceiling for the resolved height — taller than 1 WTC (541 m). */
export const MAX_HEIGHT_M = 600;
/** Average storey height assumed when only `building:levels` is known. */
export const METRES_PER_LEVEL = 3;

export interface BuildingHeights {
  /** Top of the extruded prism, in metres. */
  height: number;
  /** Bottom of the extruded prism, in metres (≥ 0). */
  baseHeight: number;
}

/**
 * Parse an OSM tag value that should be a number of metres.
 *
 * Accepts:
 *   "12"         → 12
 *   "12.5"       → 12.5
 *   "12 m"       → 12
 *   "  35.5  "   → 35.5
 *   "approx. 8"  → 8     (extracts the first number-like substring)
 *   12           → 12    (number passes through)
 *
 * Rejects (returns null):
 *   "tall", "", null, undefined, NaN, Infinity, negative numbers
 */
export function parseMetres(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (typeof value !== 'string') return null;

  // Match a leading or first-occurring positive decimal number.
  const match = value.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return null;

  const n = Number(match[0]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function clampHeight(h: number): number {
  if (h < MIN_HEIGHT_M) return MIN_HEIGHT_M;
  if (h > MAX_HEIGHT_M) return MAX_HEIGHT_M;
  return h;
}

export function buildingHeight(feature: Feature): BuildingHeights {
  const props = feature.properties ?? {};

  // Resolve top-of-prism.
  let raw: number | null = parseMetres((props as Record<string, unknown>)['height']);
  if (raw === null || raw === 0) {
    const levels = parseMetres((props as Record<string, unknown>)['building:levels']);
    if (levels !== null && levels > 0) {
      raw = levels * METRES_PER_LEVEL;
    }
  }
  if (raw === null || raw === 0) {
    raw = DEFAULT_HEIGHT_M;
  }

  const height = clampHeight(raw);

  // Resolve bottom-of-prism.
  const minH = parseMetres((props as Record<string, unknown>)['min_height']);
  // baseHeight must be < height; if min_height ≥ height (malformed), ignore it.
  const baseHeight =
    minH !== null && minH > 0 && minH < height ? minH : 0;

  return { height, baseHeight };
}
