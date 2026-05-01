/**
 * Regular-grid sampling helpers for a geographic bounding box.
 *
 * These are pure-math utilities used by the slope/aspect tool (Phase D2) to
 * decide grid dimensions for `Cesium.sampleTerrainMostDetailed` and to
 * generate the cell-centre coordinates the tool will sample.
 *
 * No Cesium dependency is allowed here — this module lives in `@terrain/shared`
 * because it's plain math reusable from any client (including future
 * D3 area/volume work).
 *
 * ## Resolution / cap trade-off
 *
 * `sampleTerrainMostDetailed` issues one tile request per unique sampled
 * tile (and Cesium World Terrain tops out around level-15-ish). For a 65,536
 * sample budget (≈ 256×256 cells) the typical small-bbox case completes in a
 * second or two on a warm cache.
 *
 * `GRID_MAX_DIM = 256` is the per-side cap, so the absolute maximum samples
 * per call is 65,536. Increasing this would mostly help users who select
 * very large bboxes — but at that point the slope visualisation is already
 * pixel-limited by the screen, so we accept the cap.
 */

import type { BoundingBox } from '../types/index.js';

/** Maximum cells per side; total samples are capped at GRID_MAX_DIM². */
export const GRID_MAX_DIM = 256;

/** Approximate metres per degree of latitude on a sphere with WGS-84 mean radius. */
export const METRES_PER_DEG_LAT = 111_320;

interface GridCoord {
  lng: number;
  lat: number;
  col: number;
  row: number;
}

// ---------------------------------------------------------------------------
// gridSize
// ---------------------------------------------------------------------------

/**
 * Returns grid dimensions giving approximately `resolutionM` metre spacing
 * across the bbox.
 *
 * Both dimensions are capped at `GRID_MAX_DIM` and floored at 2 (a 1-cell
 * grid would break the 3×3 finite-difference slope filter, so we clamp up).
 *
 * High-latitude longitudes are foreshortened by `cos(midLat)` since one
 * degree of longitude is shorter the further you are from the equator.
 */
export function gridSize(
  bbox: BoundingBox,
  resolutionM: number,
): { cols: number; rows: number } {
  if (bbox.north <= bbox.south) {
    throw new Error('gridSize: bbox.north must be greater than bbox.south');
  }
  if (bbox.east < bbox.west) {
    // We don't try to handle antimeridian-crossing bboxes here; the slope
    // tool consumes a non-crossing user selection.
    throw new Error(
      'gridSize: bbox.east must be >= bbox.west (antimeridian-crossing bboxes not supported)',
    );
  }
  if (!Number.isFinite(resolutionM) || resolutionM <= 0) {
    throw new Error('gridSize: resolutionM must be a positive finite number');
  }

  const midLat = (bbox.north + bbox.south) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  // Geographic span in metres.
  const latSpanM = (bbox.north - bbox.south) * METRES_PER_DEG_LAT;
  const lngSpanM = (bbox.east - bbox.west) * METRES_PER_DEG_LAT * Math.max(cosLat, 0);

  // Naive cell counts.
  const naiveCols = Math.ceil(lngSpanM / resolutionM);
  const naiveRows = Math.ceil(latSpanM / resolutionM);

  // Clamp to [2, GRID_MAX_DIM].
  const cols = Math.max(2, Math.min(GRID_MAX_DIM, naiveCols));
  const rows = Math.max(2, Math.min(GRID_MAX_DIM, naiveRows));

  return { cols, rows };
}

// ---------------------------------------------------------------------------
// gridCoords
// ---------------------------------------------------------------------------

/**
 * Yields every cell-centre coordinate of the grid, in row-major order
 * (`row=0` first, scanning columns west→east; then `row=1`, etc.).
 *
 * Cell centres sit `step/2` inside the bbox edges, never on them, so a
 * `cols × rows` grid divides the bbox into `cols × rows` equal cells.
 */
export function gridCoords(
  bbox: BoundingBox,
  cols: number,
  rows: number,
): GridCoord[] {
  if (cols < 1 || rows < 1) {
    throw new Error('gridCoords: cols and rows must be >= 1');
  }
  const { west, south, east, north } = bbox;
  const stepLng = (east - west) / cols;
  const stepLat = (north - south) / rows;

  const out: GridCoord[] = new Array(cols * rows);
  let i = 0;
  for (let row = 0; row < rows; row++) {
    const lat = south + (row + 0.5) * stepLat;
    for (let col = 0; col < cols; col++) {
      const lng = west + (col + 0.5) * stepLng;
      out[i++] = { lng, lat, col, row };
    }
  }
  return out;
}
