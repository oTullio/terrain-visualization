/**
 * Tests for sampleHeightsInsidePolygon.
 *
 *   1. Square polygon: every cell is in-polygon → cellsInside === cols*rows;
 *      heights are all sampled.
 *   2. Triangular polygon: roughly half of the bbox cells fall outside →
 *      out-of-polygon cells are NaN.
 *   3. Pre-aborted signal: rejects with AbortError, no sampling done.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../slopeAspect/sampleGrid.js', () => ({
  // Returns a deterministic height = i for cell index i. The polygon-mask
  // logic is what we're testing — the actual heights are just a probe.
  sampleHeightGrid: vi.fn(async (_tp: unknown, _bbox: unknown, cols: number, rows: number) => {
    const out = new Float32Array(cols * rows);
    for (let i = 0; i < out.length; i++) out[i] = i;
    return out;
  }),
}));

import { sampleHeightsInsidePolygon } from './sampleInsidePolygon.js';
import { sampleHeightGrid } from '../slopeAspect/sampleGrid.js';
import type * as Cesium from 'cesium';
import type { PickedPoint } from '../../store/useAppStore.js';

const mockSample = sampleHeightGrid as unknown as ReturnType<typeof vi.fn>;
const fakeViewer = {
  terrainProvider: {} as Cesium.TerrainProvider,
} as unknown as Cesium.Viewer;

beforeEach(() => {
  mockSample.mockClear();
});

describe('sampleHeightsInsidePolygon', () => {
  it('square polygon → every cell is inside (no NaN entries)', async () => {
    // ~1 km × 1 km square at the equator (so cellSize is well-defined).
    const halfDeg = 0.005; // ~556 m at the equator
    const square: PickedPoint[] = [
      { lng: -halfDeg, lat: -halfDeg, height: 0 },
      { lng: halfDeg, lat: -halfDeg, height: 0 },
      { lng: halfDeg, lat: halfDeg, height: 0 },
      { lng: -halfDeg, lat: halfDeg, height: 0 },
    ];
    const out = await sampleHeightsInsidePolygon(fakeViewer, square, 100);
    expect(out.cellsInside).toBe(out.cols * out.rows);
    // No NaN anywhere.
    let hasNaN = false;
    for (const h of out.heights) if (Number.isNaN(h)) hasNaN = true;
    expect(hasNaN).toBe(false);
    expect(out.cellAreaM2).toBeGreaterThan(0);
    expect(mockSample).toHaveBeenCalledTimes(1);
  });

  it('triangular polygon → some cells are outside (NaN)', async () => {
    // A right triangle covering only the SW half of its bbox.
    const triangle: PickedPoint[] = [
      { lng: 0, lat: 0, height: 0 },
      { lng: 0.01, lat: 0, height: 0 },
      { lng: 0, lat: 0.01, height: 0 },
    ];
    const out = await sampleHeightsInsidePolygon(fakeViewer, triangle, 100);
    expect(out.cellsInside).toBeGreaterThan(0);
    expect(out.cellsInside).toBeLessThan(out.cols * out.rows);

    // Verify out-of-polygon cells are NaN, in-polygon are finite.
    let nans = 0;
    let valid = 0;
    for (const h of out.heights) {
      if (Number.isNaN(h)) nans++;
      else valid++;
    }
    expect(valid).toBe(out.cellsInside);
    expect(nans).toBe(out.cols * out.rows - out.cellsInside);
  });

  it('pre-aborted signal → rejects with AbortError, no sampling', async () => {
    const square: PickedPoint[] = [
      { lng: 0, lat: 0, height: 0 },
      { lng: 0.001, lat: 0, height: 0 },
      { lng: 0.001, lat: 0.001, height: 0 },
      { lng: 0, lat: 0.001, height: 0 },
    ];
    const ac = new AbortController();
    ac.abort();
    await expect(
      sampleHeightsInsidePolygon(fakeViewer, square, 30, ac.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockSample).not.toHaveBeenCalled();
  });
});
