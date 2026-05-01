/**
 * Tests for areaVolumeMath.
 *
 *   1. Square 1km×1km polygon → planimetric area ≈ 1 km² (±5%).
 *   2. < 3 vertices → planimetric area is 0.
 *   3. Surface area on flat terrain ≈ planimetric area of the bbox cell grid.
 *   4. Surface area on tilted terrain > flat surface area.
 *   5. Cut/fill: all-zero heights vs reference 0 → all zero.
 *   6. Cut/fill: mean reference → cut and fill roughly balance.
 *   7. computeReferenceM for the three modes.
 */
import { describe, it, expect } from 'vitest';
import {
  planimetricAreaM2,
  surfaceAreaM2,
  cutFillVolumeM3,
  computeReferenceM,
  MAX_REASONABLE_REFERENCE_M,
} from './areaVolumeMath.js';
import type { PickedPoint } from '../../store/useAppStore.js';

const METRES_PER_DEG_LAT = 111_320;

/**
 * Build a (roughly) 1 km × 1 km square polygon centred on the equator.
 * Easy to verify: at the equator one degree of latitude ≈ 111.32 km, so
 * 1 km = ~0.008983 deg; longitude is the same at the equator since
 * cos(0) = 1.
 */
function squareKmPolygon(): PickedPoint[] {
  const halfDeg = 500 / METRES_PER_DEG_LAT; // 500 m radius from centre
  return [
    { lng: -halfDeg, lat: -halfDeg, height: 0 },
    { lng: halfDeg, lat: -halfDeg, height: 0 },
    { lng: halfDeg, lat: halfDeg, height: 0 },
    { lng: -halfDeg, lat: halfDeg, height: 0 },
  ];
}

describe('planimetricAreaM2', () => {
  it('1 km × 1 km square at the equator → ~1 km² (±5%)', () => {
    const a = planimetricAreaM2(squareKmPolygon());
    expect(a).toBeGreaterThan(0.95e6);
    expect(a).toBeLessThan(1.05e6);
  });

  it('returns 0 for < 3 vertices', () => {
    expect(planimetricAreaM2([])).toBe(0);
    expect(planimetricAreaM2([{ lng: 0, lat: 0, height: 0 }])).toBe(0);
    expect(
      planimetricAreaM2([
        { lng: 0, lat: 0, height: 0 },
        { lng: 1, lat: 0, height: 0 },
      ]),
    ).toBe(0);
  });
});

describe('surfaceAreaM2', () => {
  // Build a 5×5 grid (4×4 cells) of 100 m × 100 m cells.
  const COLS = 5;
  const ROWS = 5;
  const CELL = 100; // metres per side

  it('flat terrain: surface area ≈ planimetric (4×4 cells = 4×4×100² m²)', () => {
    const heights = new Float32Array(COLS * ROWS).fill(50);
    const surface = surfaceAreaM2(
      { heights, cols: COLS, rows: ROWS },
      CELL,
      CELL,
    );
    // Expected: 4 cells × 4 cells × 10_000 m² each = 160_000 m².
    const expected = (COLS - 1) * (ROWS - 1) * CELL * CELL;
    expect(surface).toBeCloseTo(expected, 0);
  });

  it('tilted terrain: surface area > flat surface area', () => {
    const flat = new Float32Array(COLS * ROWS).fill(0);
    // Linear ramp: height = c × 50  → 45° slope along x at scale of cell size.
    const tilted = new Float32Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        tilted[r * COLS + c] = c * CELL; // 45° rise along x
      }
    }
    const flatA = surfaceAreaM2({ heights: flat, cols: COLS, rows: ROWS }, CELL, CELL);
    const tiltA = surfaceAreaM2({ heights: tilted, cols: COLS, rows: ROWS }, CELL, CELL);
    expect(tiltA).toBeGreaterThan(flatA);
    // 45° slope along one axis multiplies area by sqrt(2) (~1.414).
    expect(tiltA / flatA).toBeCloseTo(Math.sqrt(2), 1);
  });

  it('skips cells whose corners include NaN (edge mask)', () => {
    const heights = new Float32Array(COLS * ROWS).fill(0);
    heights[0] = NaN; // top-left corner is outside the polygon
    const a = surfaceAreaM2({ heights, cols: COLS, rows: ROWS }, CELL, CELL);
    // Only the cell at (r=0, c=0) has the corrupted corner, so 1 fewer cell:
    const expected = ((COLS - 1) * (ROWS - 1) - 1) * CELL * CELL;
    expect(a).toBeCloseTo(expected, 0);
  });
});

describe('cutFillVolumeM3', () => {
  it('all-zero heights vs reference 0 → all zero', () => {
    const heights = new Float32Array(16);
    const v = cutFillVolumeM3({ heights, cellsInside: 16 }, 100, 0);
    expect(v).toEqual({ cut: 0, fill: 0, net: 0 });
  });

  it('mean reference: cut and fill roughly balance for symmetric heights', () => {
    // Heights [0, 10, 20, 30, 40] — mean = 20.
    const heights = new Float32Array([0, 10, 20, 30, 40]);
    const cellArea = 100;
    const v = cutFillVolumeM3({ heights, cellsInside: 5 }, cellArea, 20);
    // cut: |0-20|*100 + |10-20|*100 = 30*100 = 3000
    // fill: (30-20)*100 + (40-20)*100 = 30*100 = 3000
    expect(v.cut).toBe(3000);
    expect(v.fill).toBe(3000);
    expect(v.net).toBe(0);
  });

  it('skips NaN cells in volume integration', () => {
    const heights = new Float32Array([10, NaN, 10, 10]);
    const v = cutFillVolumeM3({ heights, cellsInside: 3 }, 100, 0);
    // 3 valid cells × 10 m × 100 m² = 3000 m³ fill, 0 cut.
    expect(v.fill).toBe(3000);
    expect(v.cut).toBe(0);
    expect(v.net).toBe(3000);
  });
});

describe('computeReferenceM', () => {
  it('lowest mode returns the minimum', () => {
    expect(computeReferenceM([5, 3, 7, 4], 'lowest', 0)).toBe(3);
  });

  it('mean mode returns the arithmetic mean', () => {
    expect(computeReferenceM([10, 20, 30], 'mean', 0)).toBe(20);
  });

  it('custom mode returns the user value clamped to [0, MAX]', () => {
    expect(computeReferenceM([], 'custom', 100)).toBe(100);
    expect(computeReferenceM([], 'custom', -50)).toBe(0);
    expect(computeReferenceM([], 'custom', 1e9)).toBe(MAX_REASONABLE_REFERENCE_M);
  });

  it('handles empty heights gracefully for lowest/mean', () => {
    expect(computeReferenceM([], 'lowest', 0)).toBe(0);
    expect(computeReferenceM([], 'mean', 0)).toBe(0);
  });
});
