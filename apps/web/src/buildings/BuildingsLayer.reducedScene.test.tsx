/**
 * Tests for the reducedScene early-return in BuildingsLayer (E5).
 *
 * When `reducedScene` is true the layer must pass `null` as the bbox to
 * `useGeoJsonLayer`, which prevents any fetch from being issued.
 * We verify this by asserting that `fetchBuildings` is NOT called when
 * `reducedScene` is true, and IS called when it is false.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import type { BoundingBox } from '@terrain/shared';

// ---------------------------------------------------------------------------
// Cesium / Resium mocks
// ---------------------------------------------------------------------------

const fakeEntity = { id: 'fake-building-entity' };
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
    Color: { fromCssColorString: vi.fn((hex: string) => ({ hex })) },
    Cartesian3: { fromDegreesArray: vi.fn((arr: number[]) => arr) },
    PolygonHierarchy: vi.fn((positions: unknown) => ({ positions })),
    Rectangle: { fromDegrees: vi.fn((...args: number[]) => args) },
  };
});

// ---------------------------------------------------------------------------
// Store mock — controllable reducedScene flag
// ---------------------------------------------------------------------------

const mockSetLayerStatus = vi.fn();
let mockReducedScene = false;
const BBOX: BoundingBox = { west: -9.155, south: 38.706, east: -9.131, north: 38.726 };

vi.mock('../store/useAppStore.js', () => ({
  useAppStore: (
    selector: (s: {
      bbox: BoundingBox | null;
      selectionPolygon: null;
      reducedScene: boolean;
      setLayerStatus: typeof mockSetLayerStatus;
    }) => unknown,
  ) =>
    selector({
      bbox: BBOX,
      selectionPolygon: null,
      reducedScene: mockReducedScene,
      setLayerStatus: mockSetLayerStatus,
    }),
}));

// ---------------------------------------------------------------------------
// Mock fetchBuildings
// ---------------------------------------------------------------------------

const mockFetchBuildings = vi.fn();
vi.mock('../api/buildingsClient.js', () => ({
  fetchBuildings: (...args: unknown[]) => mockFetchBuildings(...args),
  BuildingsApiError: class BuildingsApiError extends Error {},
}));

import BuildingsLayer from './BuildingsLayer.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuildingsLayer — reducedScene', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeViewer.isDestroyed.mockReturnValue(false);
    mockFetchBuildings.mockResolvedValue({ type: 'FeatureCollection', features: [] });
  });

  it('does not call fetchBuildings when reducedScene is true', async () => {
    mockReducedScene = true;

    await act(async () => {
      render(<BuildingsLayer />);
    });

    expect(mockFetchBuildings).not.toHaveBeenCalled();
  });

  it('calls fetchBuildings when reducedScene is false', async () => {
    mockReducedScene = false;

    await act(async () => {
      render(<BuildingsLayer />);
    });

    expect(mockFetchBuildings).toHaveBeenCalled();
  });
});
