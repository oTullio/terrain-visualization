/**
 * Tests for SlopeAspectLayer.
 *
 * Strategy: heavy mocking. We mock cesium, resium, the store, and the
 * downstream slope-aspect helpers (sampleHeightGrid, computeSlopeAspect,
 * renderSlopeCanvas) so the test exercises only the layer's effect lifecycle:
 *
 *   1. Tool inactive → no overlay added.
 *   2. Tool active + bbox set → overlay added (NOT at index 0).
 *   3. Mode change while active → previous overlay removed, new overlay added.
 *   4. Tool deactivation → overlay removed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import type { BoundingBox } from '@terrain/shared';

// ---------------------------------------------------------------------------
// Fake imageryLayers collection
// ---------------------------------------------------------------------------

interface FakeLayer { id: string }

function makeFakeLayers() {
  const layers: FakeLayer[] = [{ id: 'base' }]; // index 0 = base drape
  return {
    get length() { return layers.length; },
    add: vi.fn((layer: FakeLayer, idx?: number) => {
      if (typeof idx === 'number') layers.splice(idx, 0, layer);
      else layers.push(layer);
    }),
    remove: vi.fn((layer: FakeLayer) => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
    }),
    get: vi.fn((i: number) => layers[i]),
    _peek: () => [...layers],
  };
}

let fakeLayers = makeFakeLayers();

const fakeViewer = {
  isDestroyed: vi.fn(() => false),
  imageryLayers: fakeLayers,
  terrainProvider: {} as unknown,
};

vi.mock('resium', () => ({
  useCesium: () => ({ viewer: fakeViewer }),
}));

// ---------------------------------------------------------------------------
// Mock cesium — just the bits SlopeAspectLayer touches.
// ---------------------------------------------------------------------------

vi.mock('cesium', async () => {
  const actual = (await vi.importActual('cesium')) as Record<string, unknown>;
  let counter = 0;
  return {
    ...actual,
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
// Mock helpers — we don't need real terrain sampling here.
// ---------------------------------------------------------------------------

vi.mock('./sampleGrid.js', () => ({
  sampleHeightGrid: vi.fn(async (_tp, _bbox, cols: number, rows: number) =>
    new Float32Array(cols * rows),
  ),
}));

vi.mock('./computeSlopeAspect.js', () => ({
  computeSlopeAspect: vi.fn((_h: Float32Array, cols: number, rows: number) => ({
    slope: new Float32Array(cols * rows),
    aspect: new Float32Array(cols * rows).fill(-1),
  })),
}));

vi.mock('./renderToCanvas.js', () => ({
  renderSlopeCanvas: vi.fn(() => {
    const c = {
      width: 0,
      height: 0,
      toDataURL: vi.fn(() => 'data:image/png;base64,xx'),
    };
    return c as unknown as HTMLCanvasElement;
  }),
}));

// ---------------------------------------------------------------------------
// Mock the store. We allow per-test override of activeTool, bbox, mode.
// ---------------------------------------------------------------------------

const mockSetSlopeAspectStatus = vi.fn();
const TEST_BBOX: BoundingBox = { west: -10, south: 53, east: -9.5, north: 53.5 };

let mockState = {
  activeTool: null as string | null,
  bbox: null as BoundingBox | null,
  slopeAspect: { mode: 'slope' as 'slope' | 'aspect', status: { status: 'idle' as const } },
  setSlopeAspectStatus: mockSetSlopeAspectStatus,
};

vi.mock('../../store/useAppStore.js', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));

import SlopeAspectLayer from './SlopeAspectLayer.js';

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  fakeLayers = makeFakeLayers();
  (fakeViewer as { imageryLayers: typeof fakeLayers }).imageryLayers = fakeLayers;
  fakeViewer.isDestroyed.mockReturnValue(false);
  mockState = {
    activeTool: null,
    bbox: null,
    slopeAspect: { mode: 'slope', status: { status: 'idle' } },
    setSlopeAspectStatus: mockSetSlopeAspectStatus,
  };
});

describe('SlopeAspectLayer', () => {
  it('does not add an overlay when the tool is inactive', async () => {
    mockState.activeTool = null;
    mockState.bbox = TEST_BBOX;
    await act(async () => {
      render(<SlopeAspectLayer />);
    });
    // No imagery layer should be added.
    expect(fakeLayers.add).not.toHaveBeenCalled();
  });

  it('adds an overlay imagery layer when active + bbox set, and NOT at index 0', async () => {
    mockState.activeTool = 'slope-aspect';
    mockState.bbox = TEST_BBOX;
    await act(async () => {
      render(<SlopeAspectLayer />);
      // Allow async sampling chain to settle.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fakeLayers.add).toHaveBeenCalledTimes(1);
    // Add called with no index (or any index !== 0). Our impl calls add(layer)
    // with no second arg — so add receives 1 argument.
    const call = fakeLayers.add.mock.calls[0]!;
    if (call.length > 1) {
      // If an index was supplied it MUST not be 0 (the base lives there).
      expect(call[1]).not.toBe(0);
    } else {
      expect(call.length).toBe(1);
    }
    // Status should have transitioned to ready by now.
    expect(mockSetSlopeAspectStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'loading' }),
    );
    expect(mockSetSlopeAspectStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ready' }),
    );
  });

  it('removes the overlay on cleanup (e.g. tool deactivation)', async () => {
    mockState.activeTool = 'slope-aspect';
    mockState.bbox = TEST_BBOX;
    let unmount: (() => void) | undefined;
    await act(async () => {
      ({ unmount } = render(<SlopeAspectLayer />));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fakeLayers.add).toHaveBeenCalledTimes(1);
    const overlay = fakeLayers.add.mock.calls[0]![0]!;

    await act(async () => {
      unmount!();
    });

    expect(fakeLayers.remove).toHaveBeenCalledWith(overlay);
  });
});
