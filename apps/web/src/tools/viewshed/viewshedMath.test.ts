/**
 * Tests for viewshedMath (sampled-ray LOS).
 *
 *   1. Flat terrain → every in-range cell is visible.
 *   2. Single hill between observer and target → target is occluded.
 *   3. Out-of-range cells → marked 0.
 *   4. Observer cell → marked visible (2).
 *   5. lineOfSightVisible: detects an obstruction at the midpoint.
 */
import { describe, it, expect } from 'vitest';
import {
  approxGroundDistanceM,
  computeViewshedGrid,
  lineOfSightVisible,
  RAY_SAMPLES,
} from './viewshedMath.js';
import type { BoundingBox } from '@terrain/shared';

// A small helper that builds a bbox + heights pair for a 9×9 grid centred
// loosely on (0, 0). Each cell is ~111 m on a side at the equator.
function buildFlatGrid(value = 100): {
  heights: Float32Array;
  cols: number;
  rows: number;
  bbox: BoundingBox;
} {
  const cols = 9;
  const rows = 9;
  const heights = new Float32Array(cols * rows).fill(value);
  // ~0.001 deg ≈ 111 m → 9×9 grid covers ~1 km × 1 km.
  const bbox: BoundingBox = { west: -0.0045, south: -0.0045, east: 0.0045, north: 0.0045 };
  return { heights, cols, rows, bbox };
}

describe('approxGroundDistanceM', () => {
  it('returns 0 for the same point', () => {
    expect(approxGroundDistanceM(0, 0, 0, 0)).toBe(0);
  });

  it('grows roughly as 111_320 m per degree of latitude', () => {
    const d = approxGroundDistanceM(0, 0, 0, 1);
    expect(d).toBeCloseTo(111_320, -2); // within ~100 m
  });
});

describe('lineOfSightVisible', () => {
  it('returns true on flat terrain at the observer height', () => {
    const obs = { lng: 0, lat: 0, height: 100 };
    const tgt = { lng: 0.001, lat: 0, height: 100 };
    const visible = lineOfSightVisible(obs, 2, tgt, () => 100);
    expect(visible).toBe(true);
  });

  it('returns false when terrain rises above the line at the midpoint', () => {
    const obs = { lng: 0, lat: 0, height: 100 };
    const tgt = { lng: 0.001, lat: 0, height: 100 };
    // Observer eye at 102 m, target at 100 m — line stays well above 100 m.
    // A hill at the midpoint pokes above the line.
    const sampleH = (lng: number) => {
      // 0.0005 = midpoint between 0 and 0.001
      const dx = Math.abs(lng - 0.0005);
      // Big spike at the midpoint, falling off either side.
      if (dx < 1e-5) return 200;
      return 100;
    };
    const visible = lineOfSightVisible(obs, 2, tgt, sampleH, RAY_SAMPLES);
    expect(visible).toBe(false);
  });

  it('endpoints are not treated as occluders even if their terrain matches', () => {
    // Both endpoints at 100 m terrain; eye 2 m above. Loop only samples
    // interior points, so this should be visible regardless of endpoint
    // height.
    const obs = { lng: 0, lat: 0, height: 100 };
    const tgt = { lng: 0.001, lat: 0, height: 100 };
    const visible = lineOfSightVisible(obs, 2, tgt, () => 100);
    expect(visible).toBe(true);
  });
});

describe('computeViewshedGrid', () => {
  it('flat terrain: every in-range cell is visible (= 2)', () => {
    const grid = buildFlatGrid(100);
    const observer = { lng: 0, lat: 0, height: 100 };
    const cells = computeViewshedGrid(grid, observer, 2, 5_000);
    // 9x9 cells fit within 5 km, all visible.
    for (let i = 0; i < cells.length; i++) {
      expect(cells[i]).toBe(2);
    }
  });

  it('cells outside maxRange are marked out-of-range (0)', () => {
    const grid = buildFlatGrid(100);
    const observer = { lng: 0, lat: 0, height: 100 };
    // Tiny range — only the observer's own cell should be in range.
    const cells = computeViewshedGrid(grid, observer, 2, 60);
    const inRangeCount = cells.reduce<number>((n, v) => (v !== 0 ? n + 1 : n), 0);
    // The cell whose centre is closest to the observer is in range; outer
    // ring of cells is out of range.
    expect(inRangeCount).toBeGreaterThan(0);
    expect(inRangeCount).toBeLessThan(cells.length);
    // Far corners should definitely be out of range.
    expect(cells[0]).toBe(0);
    expect(cells[cells.length - 1]).toBe(0);
  });

  it('observer cell is marked visible (= 2)', () => {
    const grid = buildFlatGrid(100);
    // Observer at the cell-centre coordinate of (col=4, row=4), the middle of
    // the 9x9 grid: lng = west + 4.5 * stepLng, where stepLng = 0.001.
    const observer = {
      lng: grid.bbox.west + 4.5 * ((grid.bbox.east - grid.bbox.west) / grid.cols),
      lat: grid.bbox.south + 4.5 * ((grid.bbox.north - grid.bbox.south) / grid.rows),
      height: 100,
    };
    const cells = computeViewshedGrid(grid, observer, 2, 5_000);
    const idx = 4 * grid.cols + 4;
    expect(cells[idx]).toBe(2);
  });

  it('a wall between observer and the far edge marks the far cell not-visible (= 1)', () => {
    // Build a grid where one column (col = 5) is a tall wall and everything
    // else is flat. Observer sits at col 1; the wall blocks visibility of
    // cells at col 7+ along the same row.
    const cols = 9;
    const rows = 9;
    const heights = new Float32Array(cols * rows).fill(100);
    // Wall column at col=5 across the whole grid: 500 m tall.
    for (let r = 0; r < rows; r++) {
      heights[r * cols + 5] = 500;
    }
    const bbox: BoundingBox = {
      west: -0.0045,
      south: -0.0045,
      east: 0.0045,
      north: 0.0045,
    };
    // Observer at the cell-centre of (col=1, row=4).
    const stepLng = (bbox.east - bbox.west) / cols;
    const stepLat = (bbox.north - bbox.south) / rows;
    const observer = {
      lng: bbox.west + 1.5 * stepLng,
      lat: bbox.south + 4.5 * stepLat,
      height: 100,
    };
    const cells = computeViewshedGrid(
      { heights, cols, rows, bbox },
      observer,
      2,
      5_000,
    );
    // A cell well beyond the wall on the same row should be not-visible.
    const farIdx = 4 * cols + 8; // (col=8, row=4)
    expect(cells[farIdx]).toBe(1);
    // A cell just before the wall, same row, should be visible.
    const nearIdx = 4 * cols + 3; // (col=3, row=4)
    expect(cells[nearIdx]).toBe(2);
  });

  it('throws when heights length mismatches cols*rows', () => {
    const bbox: BoundingBox = { west: 0, south: 0, east: 1, north: 1 };
    expect(() =>
      computeViewshedGrid(
        { heights: new Float32Array(3), cols: 2, rows: 2, bbox },
        { lng: 0, lat: 0, height: 0 },
        2,
        1000,
      ),
    ).toThrow();
  });
});
