/**
 * Shared types for terrain-visualization.
 * More types will be added in subsequent phases.
 */

/** A geographic bounding box (WGS-84 degrees). */
export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** A geographic coordinate. */
export interface LngLat {
  lng: number;
  lat: number;
}
