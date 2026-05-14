/**
 * Cache-key builder for bbox-keyed Overpass responses.
 * Snaps coordinates to 5 decimal places (~1 m precision) for stable keys.
 *
 * Key format: `{prefix}:{south},{west},{north},{east}`
 * Example:    `buildings:38.706,-9.155,38.726,-9.131`
 */
import type { BoundingBox } from '@terrain/shared';

/** Round a number to `places` decimal places. */
function snap(v: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(v * factor) / factor;
}

/**
 * Returns a stable cache key for the given feature class and bounding box.
 * Coordinates are snapped to 5 decimal places to absorb floating-point noise
 * while keeping precision within ~1 m at the equator.
 */
export function bboxCacheKey(prefix: string, bbox: BoundingBox): string {
  const s = snap(bbox.south, 5);
  const w = snap(bbox.west, 5);
  const n = snap(bbox.north, 5);
  const e = snap(bbox.east, 5);
  return `${prefix}:${s},${w},${n},${e}`;
}
