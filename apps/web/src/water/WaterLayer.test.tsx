/**
 * Tests for WaterLayer.tsx.
 *
 * Uses the same mock strategy as useGeoJsonLayer.test.tsx:
 * Cesium and Resium are mocked so no real WebGL context is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import type { BoundingBox } from '@terrain/shared';

// ---------------------------------------------------------------------------
// Fake Cesium viewer
// ---------------------------------------------------------------------------

const fakeEntity = { id: 'fake-water-entity' };
const fakeViewer = {
  isDestroyed: vi.fn(() => false),
  entities: {
    add: vi.fn(() => fakeEntity),
    remove: vi.fn(),
  },
  camera: { flyTo: vi.fn() },
};

vi.mock('resium', () => ({
  useCesium: () => ({ viewer: fakeViewer }),
}));

vi.mock('cesium', async () => {
  const actual = (await vi.importActual('cesium')) as Record<string, unknown>;
  return {
    ...actual,
    Color: {
      fromCssColorString: vi.fn((hex: string) => ({
        hex,
        withAlpha: vi.fn((a: number) => ({ hex, alpha: a })),
      })),
    },
    Cartesian3: {
      fromDegreesArray: vi.fn((arr: number[]) => arr),
    },
    PolygonHierarchy: vi.fn((positions: unknown) => ({ positions })),
    Rectangle: { fromDegrees: vi.fn((...args: number[]) => args) },
  };
});

// Zustand store mock
const mockSetLayerStatus = vi.fn();
vi.mock('../store/useAppStore.js', () => ({
  useAppStore: (
    selector: (s: {
      bbox: BoundingBox | null;
      selectionPolygon: null;
      setLayerStatus: typeof mockSetLayerStatus;
    }) => unknown,
  ) =>
    selector({
      bbox: { west: -9.155, south: 38.706, east: -9.131, north: 38.726 },
      selectionPolygon: null,
      setLayerStatus: mockSetLayerStatus,
    }),
}));

// ---------------------------------------------------------------------------
// Mock fetchWater
// ---------------------------------------------------------------------------

const mockFetchWater = vi.fn();
vi.mock('../api/waterClient.js', () => ({
  fetchWater: (...args: unknown[]) => mockFetchWater(...args),
}));

import WaterLayer from './WaterLayer.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WaterLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeViewer.isDestroyed.mockReturnValue(false);
  });

  it('calls renderFeature for each polygon feature', async () => {
    const polygonFc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'way/2001',
          properties: { natural: 'water' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [[-9.155, 38.706], [-9.131, 38.706], [-9.131, 38.726], [-9.155, 38.726], [-9.155, 38.706]],
            ],
          },
        },
      ],
    };
    mockFetchWater.mockResolvedValueOnce(polygonFc);

    await act(async () => {
      render(<WaterLayer />);
    });

    // entities.add should be called once for the polygon feature
    expect(fakeViewer.entities.add).toHaveBeenCalledTimes(1);
    const call = fakeViewer.entities.add.mock.calls[0]![0] as { polygon?: unknown };
    expect(call).toHaveProperty('polygon');
  });

  it('calls renderFeature for each linestring feature', async () => {
    const lineFc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'way/2002',
          properties: { waterway: 'river' },
          geometry: {
            type: 'LineString',
            coordinates: [[-9.155, 38.706], [-9.131, 38.726]],
          },
        },
      ],
    };
    mockFetchWater.mockResolvedValueOnce(lineFc);

    await act(async () => {
      render(<WaterLayer />);
    });

    expect(fakeViewer.entities.add).toHaveBeenCalledTimes(1);
    const call = fakeViewer.entities.add.mock.calls[0]![0] as { polyline?: unknown };
    expect(call).toHaveProperty('polyline');
  });

  it('sets loading then ready status on successful fetch', async () => {
    mockFetchWater.mockResolvedValueOnce({ type: 'FeatureCollection', features: [] });

    await act(async () => {
      render(<WaterLayer />);
    });

    const calls = mockSetLayerStatus.mock.calls;
    expect(calls.some(([id, s]: [string, { status: string }]) => id === 'water' && s.status === 'loading')).toBe(true);
    expect(calls.some(([id, s]: [string, { status: string }]) => id === 'water' && s.status === 'ready')).toBe(true);
  });
});
