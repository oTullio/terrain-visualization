/**
 * Tests for grid.ts — TDD-style, written before the implementation.
 *
 * Covers:
 *   - gridSize returns sensible dimensions for a rectangle bbox at a given
 *     metres-per-cell resolution.
 *   - gridSize honours the 256×256 cell cap (65k samples budget).
 *   - High-latitude bboxes shrink along longitude proportional to cos(lat).
 *   - gridCoords returns cols*rows entries with col/row indices ordered
 *     row-major (row-by-row from south to north).
 *   - gridCoords cell centres are evenly spaced inside the bbox.
 */
import { describe, it, expect } from 'vitest';
import { gridSize, gridCoords, GRID_MAX_DIM } from './grid.js';
import type { BoundingBox } from '../types/index.js';

describe('gridSize', () => {
  it('returns ~111 cols for a 1°×1° equator bbox at 1000 m resolution', () => {
    // 1° at the equator is ~111.32 km; at 1 km/cell that's ~111 cells.
    const bbox: BoundingBox = { west: 0, south: 0, east: 1, north: 1 };
    const { cols, rows } = gridSize(bbox, 1000);
    expect(cols).toBeGreaterThanOrEqual(110);
    expect(cols).toBeLessThanOrEqual(112);
    expect(rows).toBeGreaterThanOrEqual(110);
    expect(rows).toBeLessThanOrEqual(112);
  });

  it('caps both dimensions at GRID_MAX_DIM (256) for tiny resolutions', () => {
    // A 1° bbox sampled at 1 m would naively be ~111000 cells per side.
    const bbox: BoundingBox = { west: 0, south: 0, east: 1, north: 1 };
    const { cols, rows } = gridSize(bbox, 1);
    expect(cols).toBe(GRID_MAX_DIM);
    expect(rows).toBe(GRID_MAX_DIM);
  });

  it('uses cos(lat) for longitude span at high latitudes', () => {
    // At lat 60°, 1° of longitude ≈ 0.5° equivalent on the equator.
    // So a 1°×1° bbox at lat 60 should give ~half the cols of an equator bbox
    // (rows are unchanged — latitude span is independent of longitude).
    const equatorBbox: BoundingBox = { west: 0, south: 0, east: 1, north: 1 };
    const polarBbox: BoundingBox = { west: 0, south: 60, east: 1, north: 61 };
    const eq = gridSize(equatorBbox, 1000);
    const polar = gridSize(polarBbox, 1000);

    // cos(60.5°) ≈ 0.4924 — the polar bbox should have ~half the columns.
    expect(polar.cols).toBeLessThan(eq.cols);
    expect(polar.cols / eq.cols).toBeGreaterThan(0.45);
    expect(polar.cols / eq.cols).toBeLessThan(0.55);
    // Rows should be ~equal (latitude metres ≈ 111 km/° everywhere).
    expect(Math.abs(polar.rows - eq.rows)).toBeLessThanOrEqual(1);
  });

  it('returns at least 2×2 even for tiny bboxes', () => {
    // 0.0001° × 0.0001° at the equator is ~11 m × 11 m. At 30 m resolution
    // that's <1 cell, which would break the slope filter — clamp to 2.
    const bbox: BoundingBox = { west: 0, south: 0, east: 0.0001, north: 0.0001 };
    const { cols, rows } = gridSize(bbox, 30);
    expect(cols).toBeGreaterThanOrEqual(2);
    expect(rows).toBeGreaterThanOrEqual(2);
  });

  it('throws on an invalid bbox (north <= south or east < west)', () => {
    expect(() => gridSize({ west: 0, south: 1, east: 1, north: 0 }, 30)).toThrow();
    expect(() => gridSize({ west: 0, south: 0, east: 1, north: 0 }, 30)).toThrow();
  });
});

describe('gridCoords', () => {
  it('returns cols*rows entries in row-major order (row-by-row, south to north)', () => {
    const bbox: BoundingBox = { west: 0, south: 0, east: 10, north: 10 };
    const cols = 3;
    const rows = 2;
    const coords = gridCoords(bbox, cols, rows);
    expect(coords).toHaveLength(cols * rows);

    // First row should have row=0 and the lowest latitude (= southernmost
    // cell-centre).  Second row should have row=1.
    expect(coords[0]!.row).toBe(0);
    expect(coords[0]!.col).toBe(0);
    expect(coords[1]!.row).toBe(0);
    expect(coords[1]!.col).toBe(1);
    expect(coords[2]!.row).toBe(0);
    expect(coords[2]!.col).toBe(2);
    expect(coords[3]!.row).toBe(1);
    expect(coords[3]!.col).toBe(0);

    // Latitudes for row 0 should be < latitudes for row 1 (south → north).
    expect(coords[0]!.lat).toBeLessThan(coords[3]!.lat);
  });

  it('places cell centres evenly inside the bbox (not on the edges)', () => {
    const bbox: BoundingBox = { west: 0, south: 0, east: 10, north: 10 };
    const cols = 5;
    const rows = 5;
    const coords = gridCoords(bbox, cols, rows);

    // No cell centre should sit ON the bbox boundary.
    for (const c of coords) {
      expect(c.lng).toBeGreaterThan(bbox.west);
      expect(c.lng).toBeLessThan(bbox.east);
      expect(c.lat).toBeGreaterThan(bbox.south);
      expect(c.lat).toBeLessThan(bbox.north);
    }
    // First cell centre's longitude offset from west should equal half a step.
    const stepLng = (bbox.east - bbox.west) / cols;
    expect(coords[0]!.lng).toBeCloseTo(bbox.west + stepLng / 2, 6);
    // Last cell centre offset from east should also equal half a step.
    expect(coords[coords.length - 1]!.lng).toBeCloseTo(bbox.east - stepLng / 2, 6);
  });
});
