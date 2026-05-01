/**
 * Tests for AreaVolumeLayer.
 *
 *   1. Polygon vertices added (not yet finalized) → polyline entity rendered,
 *      no fill polygon.
 *   2. Polygon finalized → both polyline + fill entities rendered, sampling
 *      runs, setSamples + setStatus('ready') dispatched.
 *   3. Tool change → entities removed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import type { PickedPoint, AreaVolumeSamples } from '../../store/useAppStore.js';

// ---------------------------------------------------------------------------
// Fake viewer with an `entities` collection.
// ---------------------------------------------------------------------------

interface FakeEntity {
  id: string;
  kind: 'polyline' | 'polygon';
  options: unknown;
}

function makeFakeEntities() {
  let counter = 0;
  const items: FakeEntity[] = [];
  return {
    add: vi.fn((opts: { polyline?: unknown; polygon?: unknown }) => {
      const kind: FakeEntity['kind'] = opts.polyline ? 'polyline' : 'polygon';
      const e: FakeEntity = { id: `ent-${++counter}`, kind, options: opts };
      items.push(e);
      return e;
    }),
    remove: vi.fn((e: FakeEntity) => {
      const i = items.indexOf(e);
      if (i >= 0) items.splice(i, 1);
    }),
    _peek: () => [...items],
  };
}

let fakeEntities = makeFakeEntities();
const fakeViewer = {
  isDestroyed: vi.fn(() => false),
  entities: fakeEntities,
  terrainProvider: {} as unknown,
};

vi.mock('resium', () => ({
  useCesium: () => ({ viewer: fakeViewer }),
}));

vi.mock('cesium', async () => {
  const actual = (await vi.importActual('cesium')) as Record<string, unknown>;
  return {
    ...actual,
    Cartesian3: {
      ...(actual['Cartesian3'] as Record<string, unknown>),
      fromDegreesArray: vi.fn((coords: number[]) => coords),
    },
    Color: {
      ...(actual['Color'] as Record<string, unknown>),
      fromCssColorString: vi.fn((s: string) => ({ kind: 'Color', s, withAlpha: (a: number) => ({ kind: 'Color', s, a }) })),
    },
    PolygonHierarchy: vi.fn(function (this: unknown, positions: unknown) {
      (this as { positions: unknown }).positions = positions;
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock sampleHeightsInsidePolygon.
// ---------------------------------------------------------------------------

const fakeSamples: AreaVolumeSamples = {
  heights: new Float32Array([10, 20, 30, 40]),
  cols: 2,
  rows: 2,
  cellAreaM2: 100,
  cellSizeMx: 10,
  cellSizeMy: 10,
  cellsInside: 4,
};

vi.mock('./sampleInsidePolygon.js', () => ({
  sampleHeightsInsidePolygon: vi.fn(async () => ({
    ...fakeSamples,
    bbox: { west: 0, south: 0, east: 1, north: 1 },
  })),
}));

// ---------------------------------------------------------------------------
// Mock store. Per-test mutable state.
// ---------------------------------------------------------------------------

const mockSetSamples = vi.fn();
const mockSetStatus = vi.fn();
let mockState = {
  activeTool: null as string | null,
  areaVolume: {
    polygon: [] as PickedPoint[],
    finalized: false,
    samples: null as AreaVolumeSamples | null,
  },
  setAreaVolumeSamples: mockSetSamples,
  setAreaVolumeStatus: mockSetStatus,
};

vi.mock('../../store/useAppStore.js', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));

import AreaVolumeLayer from './AreaVolumeLayer.js';

// ---------------------------------------------------------------------------

const TRI: PickedPoint[] = [
  { lng: 0, lat: 0, height: 0 },
  { lng: 0.01, lat: 0, height: 0 },
  { lng: 0.005, lat: 0.01, height: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  fakeEntities = makeFakeEntities();
  (fakeViewer as { entities: typeof fakeEntities }).entities = fakeEntities;
  fakeViewer.isDestroyed.mockReturnValue(false);
  mockState = {
    activeTool: null,
    areaVolume: { polygon: [], finalized: false, samples: null },
    setAreaVolumeSamples: mockSetSamples,
    setAreaVolumeStatus: mockSetStatus,
  };
});

describe('AreaVolumeLayer', () => {
  it('with picked vertices but not finalized: renders polyline only', async () => {
    mockState.activeTool = 'area-volume';
    mockState.areaVolume.polygon = TRI.slice(0, 2); // two vertices
    await act(async () => {
      render(<AreaVolumeLayer />);
    });
    const ents = fakeEntities._peek();
    expect(ents.length).toBe(1);
    expect(ents[0]!.kind).toBe('polyline');
  });

  it('finalized polygon: renders polyline + fill, runs computation', async () => {
    mockState.activeTool = 'area-volume';
    mockState.areaVolume.polygon = TRI;
    mockState.areaVolume.finalized = true;
    await act(async () => {
      render(<AreaVolumeLayer />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const ents = fakeEntities._peek();
    const kinds = ents.map((e) => e.kind).sort();
    expect(kinds).toEqual(['polygon', 'polyline']);
    // computing → ready transitions
    expect(mockSetStatus).toHaveBeenCalledWith('computing');
    expect(mockSetStatus).toHaveBeenCalledWith('ready');
    expect(mockSetSamples).toHaveBeenCalled();
  });

  it('removes entities when tool changes away', async () => {
    mockState.activeTool = 'area-volume';
    mockState.areaVolume.polygon = TRI;
    mockState.areaVolume.finalized = true;
    let unmount: () => void = () => {};
    await act(async () => {
      ({ unmount } = render(<AreaVolumeLayer />));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fakeEntities._peek().length).toBeGreaterThan(0);
    await act(async () => {
      unmount();
    });
    expect(fakeEntities._peek().length).toBe(0);
  });
});
