/**
 * Tests for ViewshedLayer.
 *
 *   1. Tool inactive → no overlay, no observer entity.
 *   2. Tool active + observer set → overlay added (NOT at index 0), observer
 *      entity rendered, status transitions to ready, setResult dispatched.
 *   3. Unmount cleans up both the overlay and the observer entity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import type { PickedPoint } from '../../store/useAppStore.js';

// ---------------------------------------------------------------------------
// Fake imageryLayers + entities
// ---------------------------------------------------------------------------

interface FakeLayer { id: string }
interface FakeEntity { id: string; options: unknown }

function makeFakeLayers() {
  const layers: FakeLayer[] = [{ id: 'base' }];
  return {
    add: vi.fn((layer: FakeLayer, idx?: number) => {
      if (typeof idx === 'number') layers.splice(idx, 0, layer);
      else layers.push(layer);
    }),
    remove: vi.fn((layer: FakeLayer) => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
    }),
    _peek: () => [...layers],
  };
}

function makeFakeEntities() {
  let counter = 0;
  const items: FakeEntity[] = [];
  return {
    add: vi.fn((opts: unknown) => {
      const e: FakeEntity = { id: `ent-${++counter}`, options: opts };
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

let fakeLayers = makeFakeLayers();
let fakeEntities = makeFakeEntities();

const fakeViewer = {
  isDestroyed: vi.fn(() => false),
  imageryLayers: fakeLayers,
  entities: fakeEntities,
  terrainProvider: {} as unknown,
};

vi.mock('resium', () => ({
  useCesium: () => ({ viewer: fakeViewer }),
}));

// ---------------------------------------------------------------------------
// Mock cesium — minimum surface used by ViewshedLayer.
// ---------------------------------------------------------------------------

vi.mock('cesium', async () => {
  const actual = (await vi.importActual('cesium')) as Record<string, unknown>;
  let counter = 0;
  return {
    ...actual,
    Cartesian3: {
      ...(actual['Cartesian3'] as Record<string, unknown>),
      fromDegrees: vi.fn((lng: number, lat: number, height: number) => ({
        kind: 'Cartesian3',
        lng,
        lat,
        height,
      })),
    },
    Color: {
      ...(actual['Color'] as Record<string, unknown>),
      YELLOW: { kind: 'Color', name: 'YELLOW' },
      BLACK: { kind: 'Color', name: 'BLACK' },
    },
    Rectangle: {
      ...(actual['Rectangle'] as Record<string, unknown>),
      fromDegrees: vi.fn((...args: number[]) => ({ kind: 'Rect', args })),
    },
    Credit: vi.fn((s: string) => ({ kind: 'Credit', s })),
    // Mirror Cesium engine ≥24's constructor validation: it throws unless
    // tileWidth/tileHeight are supplied as numbers.
    SingleTileImageryProvider: vi.fn(
      (options: { tileWidth?: unknown; tileHeight?: unknown }) => {
        if (
          typeof options?.tileWidth !== 'number' ||
          typeof options?.tileHeight !== 'number'
        ) {
          throw new Error(
            'Expected options.tileWidth to be typeof number, actual typeof was undefined',
          );
        }
        return { kind: 'SingleTileProvider' };
      },
    ),
    ImageryLayer: {
      fromProviderAsync: vi.fn(() => ({ id: `overlay-${++counter}` })),
    },
  };
});

// ---------------------------------------------------------------------------
// Mock helpers — skip real terrain sampling and viewshed math.
// ---------------------------------------------------------------------------

vi.mock('../slopeAspect/sampleGrid.js', () => ({
  sampleHeightGrid: vi.fn(async (_tp, _bbox, cols: number, rows: number) =>
    new Float32Array(cols * rows),
  ),
}));

vi.mock('./viewshedMath.js', () => ({
  computeViewshedGrid: vi.fn((g: { cols: number; rows: number }) =>
    new Uint8Array(g.cols * g.rows).fill(2),
  ),
}));

vi.mock('./renderViewshedCanvas.js', () => ({
  renderViewshedCanvas: vi.fn(() => {
    const c = {
      width: 0,
      height: 0,
      toDataURL: vi.fn(() => 'data:image/png;base64,xx'),
    };
    return c as unknown as HTMLCanvasElement;
  }),
}));

// ---------------------------------------------------------------------------
// Mock store
// ---------------------------------------------------------------------------

const mockSetStatus = vi.fn();
const mockSetResult = vi.fn();

let mockState = {
  activeTool: null as string | null,
  viewshed: {
    observer: null as PickedPoint | null,
    observerEyeHeightM: 2,
    maxRangeM: 3000,
  },
  setViewshedStatus: mockSetStatus,
  setViewshedResult: mockSetResult,
};

vi.mock('../../store/useAppStore.js', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));

import ViewshedLayer from './ViewshedLayer.js';

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  fakeLayers = makeFakeLayers();
  fakeEntities = makeFakeEntities();
  (fakeViewer as { imageryLayers: typeof fakeLayers }).imageryLayers = fakeLayers;
  (fakeViewer as { entities: typeof fakeEntities }).entities = fakeEntities;
  fakeViewer.isDestroyed.mockReturnValue(false);
  mockState = {
    activeTool: null,
    viewshed: { observer: null, observerEyeHeightM: 2, maxRangeM: 3000 },
    setViewshedStatus: mockSetStatus,
    setViewshedResult: mockSetResult,
  };
});

describe('ViewshedLayer', () => {
  it('does not add anything when the tool is inactive', async () => {
    mockState.activeTool = null;
    mockState.viewshed.observer = { lng: 0, lat: 0, height: 100 };
    await act(async () => {
      render(<ViewshedLayer />);
      await Promise.resolve();
    });
    expect(fakeLayers.add).not.toHaveBeenCalled();
    expect(fakeEntities.add).not.toHaveBeenCalled();
  });

  it('with active tool + observer: adds overlay (not index 0), adds observer entity, dispatches result', async () => {
    mockState.activeTool = 'viewshed';
    mockState.viewshed.observer = { lng: -9.1, lat: 38.7, height: 50 };
    await act(async () => {
      render(<ViewshedLayer />);
      // Allow the async sampling chain to settle.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fakeLayers.add).toHaveBeenCalledTimes(1);
    const call = fakeLayers.add.mock.calls[0]!;
    if (call.length > 1) {
      expect(call[1]).not.toBe(0);
    } else {
      expect(call.length).toBe(1);
    }
    // Observer entity was added with a point graphic.
    expect(fakeEntities.add).toHaveBeenCalledTimes(1);
    const entityOpts = fakeEntities.add.mock.calls[0]![0] as {
      point?: unknown;
      position?: unknown;
    };
    expect(entityOpts.point).toBeDefined();
    expect(entityOpts.position).toBeDefined();

    expect(mockSetStatus).toHaveBeenCalledWith('computing');
    expect(mockSetResult).toHaveBeenCalled();
  });

  it('cleans up overlay + observer entity on unmount', async () => {
    mockState.activeTool = 'viewshed';
    mockState.viewshed.observer = { lng: -9.1, lat: 38.7, height: 50 };
    let unmount: (() => void) | undefined;
    await act(async () => {
      ({ unmount } = render(<ViewshedLayer />));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fakeLayers.add).toHaveBeenCalledTimes(1);
    const overlay = fakeLayers.add.mock.calls[0]![0]!;
    const entity = fakeEntities.add.mock.calls[0]![0];
    expect(entity).toBeDefined();

    await act(async () => {
      unmount!();
    });

    expect(fakeLayers.remove).toHaveBeenCalledWith(overlay);
    expect(fakeEntities.remove).toHaveBeenCalled();
  });
});
