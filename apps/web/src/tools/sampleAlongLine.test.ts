/**
 * Tests for sampleAlongLine.
 *
 * We mock `Cesium.sampleTerrainMostDetailed` so we don't hit Cesium Ion or
 * any real terrain provider. The mock simply assigns a deterministic height
 * to each Cartographic and returns the array.
 *
 * Real `Cesium.EllipsoidGeodesic`, `Cartographic`, and `Math` are kept so
 * the cumulative-distance calculation runs against the actual ellipsoid.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cesium so sampleTerrainMostDetailed never reaches the network.
vi.mock('cesium', async () => {
  const actual = (await vi.importActual('cesium')) as Record<string, unknown>;
  return {
    ...actual,
    sampleTerrainMostDetailed: vi.fn(),
  };
});

import * as Cesium from 'cesium';
import { sampleAlongLine } from './sampleAlongLine.js';

const fakeTerrainProvider = {} as unknown as Cesium.TerrainProvider;

const mockSampleTerrain = Cesium.sampleTerrainMostDetailed as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  mockSampleTerrain.mockReset();
});

describe('sampleAlongLine', () => {
  it('returns the requested number of samples (including endpoints)', async () => {
    // Constant 100m height for every position.
    mockSampleTerrain.mockImplementation((_tp: unknown, cartos: Cesium.Cartographic[]) => {
      for (const c of cartos) c.height = 100;
      return Promise.resolve(cartos);
    });

    const samples = await sampleAlongLine(
      fakeTerrainProvider,
      { lng: -9.0, lat: 38.0 },
      { lng: -8.99, lat: 38.0 },
      10,
    );
    expect(samples).toHaveLength(10);
    // First and last should match the input lat/lng.
    expect(samples[0]!.lng).toBeCloseTo(-9.0, 6);
    expect(samples[0]!.lat).toBeCloseTo(38.0, 6);
    expect(samples[9]!.lng).toBeCloseTo(-8.99, 6);
    expect(samples[9]!.lat).toBeCloseTo(38.0, 6);
    // All heights are 100.
    for (const s of samples) {
      expect(s.height).toBe(100);
    }
  });

  it('produces a strictly monotonically increasing distance', async () => {
    mockSampleTerrain.mockImplementation((_tp: unknown, cartos: Cesium.Cartographic[]) => {
      for (const c of cartos) c.height = 0;
      return Promise.resolve(cartos);
    });

    const samples = await sampleAlongLine(
      fakeTerrainProvider,
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 },
      20,
    );
    expect(samples[0]!.distance).toBe(0);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.distance).toBeGreaterThan(samples[i - 1]!.distance);
    }
  });

  it('endpoint cumulative distance matches a known great-circle (~111 km along the equator)', async () => {
    mockSampleTerrain.mockImplementation((_tp: unknown, cartos: Cesium.Cartographic[]) => {
      for (const c of cartos) c.height = 0;
      return Promise.resolve(cartos);
    });

    const samples = await sampleAlongLine(
      fakeTerrainProvider,
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 },
      50,
    );

    // 1° of equator ≈ 111.319 km on the WGS-84 ellipsoid.
    const last = samples[samples.length - 1]!;
    expect(last.distance).toBeGreaterThan(110_000);
    expect(last.distance).toBeLessThan(112_000);
  });

  it('rejects when samples < 2', async () => {
    await expect(
      sampleAlongLine(
        fakeTerrainProvider,
        { lng: 0, lat: 0 },
        { lng: 1, lat: 0 },
        1,
      ),
    ).rejects.toThrow(/samples must be >= 2/);
  });

  it('passes through varying heights from the terrain provider', async () => {
    mockSampleTerrain.mockImplementation((_tp: unknown, cartos: Cesium.Cartographic[]) => {
      // Climbs linearly from 0 to (length-1) * 10 m.
      cartos.forEach((c, i) => {
        c.height = i * 10;
      });
      return Promise.resolve(cartos);
    });

    const samples = await sampleAlongLine(
      fakeTerrainProvider,
      { lng: 0, lat: 0 },
      { lng: 0, lat: 0.1 },
      5,
    );
    expect(samples.map((s) => s.height)).toEqual([0, 10, 20, 30, 40]);
  });
});
