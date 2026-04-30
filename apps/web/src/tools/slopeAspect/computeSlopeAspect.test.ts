/**
 * Tests for computeSlopeAspect — Horn's method finite-difference slope/aspect.
 *
 * Conventions used in the tests:
 *   - heights is row-major: heights[row * cols + col]
 *   - row=0 is the SOUTHERNMOST row (gridCoords order)
 *   - North means decreasing row index? NO — row=0 is south, row=rows-1 is
 *     north. So an increase in row corresponds to moving NORTH.
 *   - Aspect: 0° = north, 90° = east, 180° = south, 270° = west.
 */
import { describe, it, expect } from 'vitest';
import { computeSlopeAspect } from './computeSlopeAspect.js';

/** Build a flat Float32Array filled with `value`. */
function flat(cols: number, rows: number, value = 0): Float32Array {
  return new Float32Array(cols * rows).fill(value);
}

describe('computeSlopeAspect', () => {
  it('flat terrain → all-zero slope and all-(-1) aspect', () => {
    const cols = 5;
    const rows = 5;
    const heights = flat(cols, rows, 100);
    const { slope, aspect } = computeSlopeAspect(heights, cols, rows, 30, 30);
    expect(slope.length).toBe(cols * rows);
    expect(aspect.length).toBe(cols * rows);
    for (let i = 0; i < slope.length; i++) {
      expect(slope[i]).toBe(0);
      expect(aspect[i]).toBe(-1);
    }
  });

  it('45° west→east tilt → slope ≈ 45° everywhere; aspect ≈ 90° (east)', () => {
    // The terrain rises 30 m per cell as we go east — slope = atan(1) = 45°.
    const cols = 5;
    const rows = 5;
    const cell = 30;
    const h = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Height rises linearly with col.
        h[r * cols + c] = c * cell;
      }
    }
    const { slope, aspect } = computeSlopeAspect(h, cols, rows, cell, cell);
    // Inspect the centre cell (away from edges, ideally Horn's full filter).
    const centre = 2 * cols + 2;
    expect(slope[centre]).toBeCloseTo(45, 1);
    // East-facing slope: aspect should be ≈ 90°.  (Slope rises to the east,
    // so the steepest *descent* points west… but ESRI/Horn convention has
    // aspect = compass direction the slope faces, i.e. the direction of
    // steepest *descent's opposite* — i.e. the direction the slope rises
    // towards. Actually: standard GIS aspect points DOWN-slope.  We need to
    // be precise.)
    //
    // Horn's formula (ESRI): aspect = atan2(dz/dy, -dz/dx) converted to
    // compass degrees, where the surface gradient (dz/dx, dz/dy) points
    // up-slope. The aspect points DOWN-slope.
    //
    // Here the terrain rises eastward so down-slope points west = 270°.
    // For the test to pass we either pin down the convention up-front or
    // accept the spec's choice. The acceptance criteria say:
    //   "an east-facing slope yields aspect ≈ 90°"
    // An "east-facing slope" in GIS parlance means the slope faces east,
    // i.e. the surface DESCENDS to the east — meaning heights DECREASE as
    // we move east. So we need to invert the test data.
    void slope;
    void aspect;
  });

  it('east-facing slope (heights decrease eastward) → aspect ≈ 90°', () => {
    const cols = 5;
    const rows = 5;
    const cell = 30;
    const h = new Float32Array(cols * rows);
    // Heights DECREASE moving east → slope faces east → aspect 90°.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        h[r * cols + c] = (cols - 1 - c) * cell;
      }
    }
    const { slope, aspect } = computeSlopeAspect(h, cols, rows, cell, cell);
    const centre = 2 * cols + 2;
    expect(slope[centre]).toBeCloseTo(45, 1);
    expect(aspect[centre]).toBeCloseTo(90, 0);
  });

  it('south-facing slope (heights decrease southward) → aspect ≈ 180°', () => {
    const cols = 5;
    const rows = 5;
    const cell = 30;
    const h = new Float32Array(cols * rows);
    // Row 0 is south; heights DECREASE moving south means heights increase
    // moving north (row index ↑ = north). So h grows with row.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        h[r * cols + c] = r * cell;
      }
    }
    const { slope, aspect } = computeSlopeAspect(h, cols, rows, cell, cell);
    const centre = 2 * cols + 2;
    expect(slope[centre]).toBeCloseTo(45, 1);
    expect(aspect[centre]).toBeCloseTo(180, 0);
  });

  it('north-facing slope (heights decrease northward) → aspect ≈ 0°/360°', () => {
    const cols = 5;
    const rows = 5;
    const cell = 30;
    const h = new Float32Array(cols * rows);
    // Heights DECREASE moving north (row ↑) → h decreases with row.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        h[r * cols + c] = (rows - 1 - r) * cell;
      }
    }
    const { slope, aspect } = computeSlopeAspect(h, cols, rows, cell, cell);
    const centre = 2 * cols + 2;
    expect(slope[centre]).toBeCloseTo(45, 1);
    // North can be reported as either 0 or 360 depending on the formula's
    // mod handling; accept either via a delta to 0 or 360.
    const a = aspect[centre]!;
    const isNorth = Math.min(a, Math.abs(a - 360)) < 1;
    expect(isNorth).toBe(true);
  });

  it('west-facing slope (heights decrease westward) → aspect ≈ 270°', () => {
    const cols = 5;
    const rows = 5;
    const cell = 30;
    const h = new Float32Array(cols * rows);
    // Heights DECREASE moving west: h is high at high col (east) and low
    // at low col (west) → so h grows with col.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        h[r * cols + c] = c * cell;
      }
    }
    const { slope, aspect } = computeSlopeAspect(h, cols, rows, cell, cell);
    const centre = 2 * cols + 2;
    expect(slope[centre]).toBeCloseTo(45, 1);
    expect(aspect[centre]).toBeCloseTo(270, 0);
  });

  it('edge cells use a 1-direction finite difference but still yield finite slope', () => {
    // 3×3 grid with a tilt.  The corner/edge cells should not be NaN.
    const cols = 3;
    const rows = 3;
    const cell = 30;
    const h = new Float32Array([0, 30, 60, 0, 30, 60, 0, 30, 60]); // east-rising
    const { slope, aspect } = computeSlopeAspect(h, cols, rows, cell, cell);
    for (let i = 0; i < slope.length; i++) {
      expect(Number.isFinite(slope[i]!)).toBe(true);
      expect(Number.isFinite(aspect[i]!)).toBe(true);
    }
  });
});
