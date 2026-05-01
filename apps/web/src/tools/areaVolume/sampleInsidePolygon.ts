/**
 * sampleHeightsInsidePolygon — async terrain sampling over the cells of a
 * polygon's bounding-box grid, masked to the polygon interior.
 *
 * Strategy:
 *   1. Build the polygon's bbox via `bboxFromPolygon` (and close the ring
 *      to a valid GeoJSON Polygon).
 *   2. Choose a grid `cols × rows` via `gridSize(bbox, resolutionM)` —
 *      capped at 256×256 (GRID_MAX_DIM) so the terrain provider isn't
 *      asked for tens of thousands of points.
 *   3. Enumerate cell centres via `gridCoords` and decide for each whether
 *      it falls inside the polygon (`@turf/boolean-point-in-polygon`).
 *   4. Sample terrain heights for the *whole* grid via `sampleHeightGrid`.
 *      We could pre-filter to in-polygon cells only, but that doubles the
 *      bookkeeping for a marginal saving (the slope/aspect grid already
 *      reuses the same bbox path), and `sampleTerrainMostDetailed` batches
 *      per tile so the wasted samples cost a tile-fetch only when the
 *      polygon barely touches a tile.
 *   5. Return a Float32Array of length cols*rows where in-polygon cells
 *      hold the sampled metres and out-of-polygon cells hold NaN. The
 *      caller (areaVolumeMath) treats NaN as "skip this cell".
 *
 * `cellAreaM2` is the planimetric metres² per cell, computed from the cell
 * spacing at the polygon centroid latitude. This is approximate (cell area
 * varies slightly across the bbox at high latitudes) but more than good
 * enough for the volume-cut/fill reporting at the resolutions we use.
 *
 * Abort handling: forwards the AbortSignal to `sampleHeightGrid` and
 * re-checks at every await boundary so a tool change cancels the work.
 */
import type * as Cesium from 'cesium';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint, polygon as turfPolygon } from '@turf/helpers';
import {
  bboxFromPolygon,
  gridCoords,
  gridSize,
  METRES_PER_DEG_LAT,
  type BoundingBox,
} from '@terrain/shared';
import { sampleHeightGrid } from '../slopeAspect/sampleGrid.js';
import type { PickedPoint } from '../../store/useAppStore.js';

export interface InsidePolygonSamples {
  /** Row-major array of length cols*rows; NaN for out-of-polygon cells. */
  heights: Float32Array;
  cols: number;
  rows: number;
  /** Planimetric metres² per cell. */
  cellAreaM2: number;
  cellSizeMx: number;
  cellSizeMy: number;
  /** Count of in-polygon cells (non-NaN entries). */
  cellsInside: number;
  /** The bbox we sampled over. */
  bbox: BoundingBox;
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

/**
 * Build a closed [lng, lat] ring from the picked-points polygon.
 *
 * `bboxFromPolygon` and the @turf helpers all expect a closed ring
 * (first === last); the picker stores the open vertex list so we close it
 * here.
 */
function ringFromPolygon(polygon: PickedPoint[]): [number, number][] {
  const ring: [number, number][] = polygon.map((p) => [p.lng, p.lat]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

export async function sampleHeightsInsidePolygon(
  viewer: Cesium.Viewer,
  polygon: PickedPoint[],
  resolutionM = 30,
  signal?: AbortSignal,
): Promise<InsidePolygonSamples> {
  if (polygon.length < 3) {
    throw new Error('sampleHeightsInsidePolygon: polygon needs >= 3 vertices');
  }
  if (signal?.aborted) throw abortError();

  const ring = ringFromPolygon(polygon);
  const geoPoly = { type: 'Polygon' as const, coordinates: [ring] };
  const bbox = bboxFromPolygon(geoPoly);

  const { cols, rows } = gridSize(bbox, resolutionM);
  const coords = gridCoords(bbox, cols, rows);

  // Mask: in-polygon test using @turf/boolean-point-in-polygon.
  const turfPoly = turfPolygon([ring]);
  const inside = new Uint8Array(cols * rows);
  let cellsInside = 0;
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i]!;
    const isIn = booleanPointInPolygon(turfPoint([c.lng, c.lat]), turfPoly);
    if (isIn) {
      inside[i] = 1;
      cellsInside++;
    }
  }

  if (signal?.aborted) throw abortError();

  // Sample the full bbox grid. Wasted terrain queries for outside cells are
  // acceptable v1 (sampleTerrainMostDetailed batches per tile).
  const sampled = await sampleHeightGrid(
    viewer.terrainProvider,
    bbox,
    cols,
    rows,
    signal,
  );

  if (signal?.aborted) throw abortError();

  // Mask outside cells to NaN.
  const heights = new Float32Array(cols * rows);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = inside[i] ? sampled[i]! : NaN;
  }

  // Cell metres at the polygon-centroid latitude (~constant across the bbox
  // for the resolutions we use).
  const midLat = (bbox.north + bbox.south) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const cellSizeMx =
    ((bbox.east - bbox.west) * METRES_PER_DEG_LAT * Math.max(cosLat, 0)) / cols;
  const cellSizeMy = ((bbox.north - bbox.south) * METRES_PER_DEG_LAT) / rows;
  const cellAreaM2 = cellSizeMx * cellSizeMy;

  return {
    heights,
    cols,
    rows,
    cellAreaM2,
    cellSizeMx,
    cellSizeMy,
    cellsInside,
    bbox,
  };
}
