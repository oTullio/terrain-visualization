/**
 * areaVolumeMath — pure helpers for the Area / volume tool (D3).
 *
 *   - `planimetricAreaM2(polygon)` — geodesic area of the closed polygon
 *     (great-circle on the WGS-84 ellipsoid) via @turf/area.
 *
 *   - `surfaceAreaM2(samples, cellSizeMx, cellSizeMy)` — 3D triangulated
 *     surface area summed over the masked sample grid. Each cell is split
 *     into two triangles (NW-SE diagonal) and only cells whose four corner
 *     samples are all valid (non-NaN) contribute. This is the standard
 *     finite-difference DEM surface-area approximation.
 *
 *     Edge handling: cells with any NaN corner are dropped. This means cells
 *     that straddle the polygon boundary (cell-centre inside but corner
 *     outside) are excluded from the surface-area sum even though their
 *     planimetric area was counted by @turf/area. The discrepancy is at most
 *     one cell-thickness fringe and shrinks with finer resolution; documenting
 *     it here so the v1 approximation is explicit.
 *
 *   - `cutFillVolumeM3(samples, cellArea, referenceM)` — sum of (h - ref)
 *     × cellArea over masked cells, separated into cut (where h < ref) and
 *     fill (where h > ref). `net = fill - cut` (positive = net fill).
 *
 *   - `computeReferenceM(heights, mode, custom)` — derives the reference
 *     elevation from the in-polygon heights based on the user's mode.
 *
 * Conventions:
 *   - The grid is row-major over the polygon's bbox: heights[r * cols + c].
 *   - Heights outside the polygon are encoded as NaN in the Float32Array.
 *   - All functions are deterministic and side-effect free; the heavy I/O
 *     (terrain sampling) lives in sampleInsidePolygon.
 */
import area from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';
import type { PickedPoint } from '../../store/useAppStore.js';

/** Sane upper bound for a custom reference plane (Mt Everest is ~8849 m). */
export const MAX_REASONABLE_REFERENCE_M = 9000;

/**
 * Planimetric (geodesic) area of the polygon in m². Returns 0 for
 * degenerate inputs (< 3 vertices).
 */
export function planimetricAreaM2(polygon: PickedPoint[]): number {
  if (polygon.length < 3) return 0;
  // Build a closed GeoJSON ring (first === last).
  const ring: [number, number][] = polygon.map((p) => [p.lng, p.lat]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  const feature = turfPolygon([ring]);
  return area(feature);
}

/**
 * 3D surface area summed over masked cells. NaN entries in `heights`
 * indicate "outside polygon" — any cell whose 4 corners include a NaN is
 * skipped.
 */
export function surfaceAreaM2(
  samples: { heights: Float32Array; cols: number; rows: number },
  cellSizeMx: number,
  cellSizeMy: number,
): number {
  const { heights, cols, rows } = samples;
  if (cols < 2 || rows < 2) return 0;

  let total = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i00 = r * cols + c;
      const i10 = r * cols + (c + 1);
      const i01 = (r + 1) * cols + c;
      const i11 = (r + 1) * cols + (c + 1);

      const h00 = heights[i00]!;
      const h10 = heights[i10]!;
      const h01 = heights[i01]!;
      const h11 = heights[i11]!;

      // Drop cells that touch the polygon edge (any corner outside → NaN).
      if (
        Number.isNaN(h00) ||
        Number.isNaN(h10) ||
        Number.isNaN(h01) ||
        Number.isNaN(h11)
      ) {
        continue;
      }

      // Triangle 1: (00) (10) (11)
      total += triangleAreaM2(
        0,
        0,
        h00,
        cellSizeMx,
        0,
        h10,
        cellSizeMx,
        cellSizeMy,
        h11,
      );
      // Triangle 2: (00) (11) (01)
      total += triangleAreaM2(
        0,
        0,
        h00,
        cellSizeMx,
        cellSizeMy,
        h11,
        0,
        cellSizeMy,
        h01,
      );
    }
  }
  return total;
}

/**
 * Cut/fill volume relative to a reference elevation. Sums |Δh| × cellArea
 * over masked cells, splitting into cut (h < ref) and fill (h > ref).
 */
export function cutFillVolumeM3(
  samples: { heights: Float32Array; cellsInside: number },
  cellArea: number,
  referenceM: number,
): { cut: number; fill: number; net: number } {
  let cut = 0;
  let fill = 0;
  const { heights } = samples;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i]!;
    if (Number.isNaN(h)) continue;
    const dh = h - referenceM;
    if (dh > 0) {
      fill += dh * cellArea;
    } else if (dh < 0) {
      cut += -dh * cellArea;
    }
  }
  return { cut, fill, net: fill - cut };
}

/**
 * Derive the reference elevation from the masked heights. `custom` is the
 * user's input value (only used when `mode === 'custom'`); it is clamped
 * to a sane range so a typo doesn't blow the volume math up.
 */
export function computeReferenceM(
  heights: number[],
  mode: 'lowest' | 'mean' | 'custom',
  custom: number,
): number {
  if (mode === 'custom') {
    if (!Number.isFinite(custom)) return 0;
    return Math.min(Math.max(custom, 0), MAX_REASONABLE_REFERENCE_M);
  }
  if (heights.length === 0) return 0;
  if (mode === 'lowest') {
    let min = Infinity;
    for (const h of heights) if (h < min) min = h;
    return min === Infinity ? 0 : min;
  }
  // 'mean'
  let sum = 0;
  for (const h of heights) sum += h;
  return sum / heights.length;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/**
 * Area of a 3D triangle from three (x, y, z) points using the half-cross-product
 * formula. Inputs are in metres in the local-tangent frame of the cell.
 */
function triangleAreaM2(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
}
