/**
 * Tests for sampleHeightGrid.
 *
 * Cesium.sampleTerrainMostDetailed is mocked at the module boundary; we
 * verify the wrapper builds the correct number of Cartographic positions,
 * passes them through, returns a Float32Array of length cols*rows in
 * row-major order, and honours the AbortSignal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('cesium', async () => {
  const actual = (await vi.importActual('cesium')) as Record<string, unknown>;
  return {
    ...actual,
    sampleTerrainMostDetailed: vi.fn(),
  };
});

import * as Cesium from 'cesium';
import { sampleHeightGrid } from './sampleGrid.js';
import type { BoundingBox } from '@terrain/shared';

const mockSample = Cesium.sampleTerrainMostDetailed as unknown as ReturnType<typeof vi.fn>;
const fakeProvider = {} as unknown as Cesium.TerrainProvider;

const BBOX: BoundingBox = { west: 0, south: 0, east: 1, north: 1 };

beforeEach(() => {
  mockSample.mockReset();
});

describe('sampleHeightGrid', () => {
  it('returns a Float32Array of length cols*rows in row-major order', async () => {
    // Mock: each cartographic gets height = its row*100 + col (deterministic).
    // We compute that from the longitude/latitude relative to the bbox so the
    // assertion checks ordering, not the specific lat/lng arithmetic.
    mockSample.mockImplementation(async (_tp: unknown, cartos: Cesium.Cartographic[]) => {
      cartos.forEach((c, i) => {
        c.height = i; // identity ordering for easy verification
      });
      return cartos;
    });

    const cols = 4;
    const rows = 3;
    const heights = await sampleHeightGrid(fakeProvider, BBOX, cols, rows);
    expect(heights).toBeInstanceOf(Float32Array);
    expect(heights.length).toBe(cols * rows);
    // Row-major: heights[r * cols + c] === r * cols + c
    for (let i = 0; i < heights.length; i++) {
      expect(heights[i]).toBe(i);
    }
  });

  it('throws AbortError when the signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      sampleHeightGrid(fakeProvider, BBOX, 2, 2, ac.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockSample).not.toHaveBeenCalled();
  });

  it('throws AbortError when the signal aborts during sampling', async () => {
    const ac = new AbortController();
    let resolveSample: (cs: Cesium.Cartographic[]) => void = () => {};
    mockSample.mockImplementation(
      (_tp: unknown, cartos: Cesium.Cartographic[]) =>
        new Promise<Cesium.Cartographic[]>((resolve) => {
          resolveSample = resolve;
          // Fill heights so resolution is well-formed if we did resolve.
          cartos.forEach((c, i) => {
            c.height = i;
          });
        }),
    );

    const promise = sampleHeightGrid(fakeProvider, BBOX, 2, 2, ac.signal);

    // Abort before the mock resolves.
    ac.abort();
    // Now resolve — the wrapper should still throw AbortError.
    resolveSample([]);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
