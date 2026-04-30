/**
 * Tests for RoadsLayer.tsx.
 *
 * Uses the same mock strategy as WaterLayer.test.tsx:
 * Cesium and Resium are mocked so no real WebGL context is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import type { BoundingBox } from '@terrain/shared';

// ---------------------------------------------------------------------------
// Fake Cesium viewer
// ---------------------------------------------------------------------------

const fakeEntity = { id: 'fake-road-entity' };
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
      fromCssColorString: vi.fn((hex: string) => ({ hex })),
    },
    Cartesian3: {
      fromDegreesArray: vi.fn((arr: number[]) => arr),
    },
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
// Mock fetchRoads
// ---------------------------------------------------------------------------

const mockFetchRoads = vi.fn();
vi.mock('../api/roadsClient.js', () => ({
  fetchRoads: (...args: unknown[]) => mockFetchRoads(...args),
}));

import RoadsLayer from './RoadsLayer.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoadsLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeViewer.isDestroyed.mockReturnValue(false);
  });

  it('calls entities.add for each LineString feature', async () => {
    const lineFc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'way/4001',
          properties: { highway: 'primary', name: 'Test Road' },
          geometry: {
            type: 'LineString',
            coordinates: [[-9.155, 38.706], [-9.131, 38.726]],
          },
        },
        {
          type: 'Feature',
          id: 'way/4002',
          properties: { highway: 'residential' },
          geometry: {
            type: 'LineString',
            coordinates: [[-9.14, 38.71], [-9.13, 38.72]],
          },
        },
      ],
    };
    mockFetchRoads.mockResolvedValueOnce(lineFc);

    await act(async () => {
      render(<RoadsLayer />);
    });

    // entities.add should be called once per LineString feature
    expect(fakeViewer.entities.add).toHaveBeenCalledTimes(2);
    const call = fakeViewer.entities.add.mock.calls[0]![0] as { polyline?: unknown };
    expect(call).toHaveProperty('polyline');
  });

  it('each polyline entity has clampToGround: true', async () => {
    const lineFc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'way/4003',
          properties: { highway: 'motorway' },
          geometry: {
            type: 'LineString',
            coordinates: [[-9.155, 38.706], [-9.131, 38.726], [-9.1, 38.74]],
          },
        },
      ],
    };
    mockFetchRoads.mockResolvedValueOnce(lineFc);

    await act(async () => {
      render(<RoadsLayer />);
    });

    expect(fakeViewer.entities.add).toHaveBeenCalledTimes(1);
    const polyline = (fakeViewer.entities.add.mock.calls[0]![0] as { polyline: { clampToGround: boolean } }).polyline;
    expect(polyline.clampToGround).toBe(true);
  });

  it('sets loading then ready status on successful fetch', async () => {
    mockFetchRoads.mockResolvedValueOnce({ type: 'FeatureCollection', features: [] });

    await act(async () => {
      render(<RoadsLayer />);
    });

    const calls = mockSetLayerStatus.mock.calls;
    expect(calls.some(([id, s]: [string, { status: string }]) => id === 'roads' && s.status === 'loading')).toBe(true);
    expect(calls.some(([id, s]: [string, { status: string }]) => id === 'roads' && s.status === 'ready')).toBe(true);
  });
});
