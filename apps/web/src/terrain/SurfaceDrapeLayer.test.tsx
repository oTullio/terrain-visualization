/**
 * Tests for SurfaceDrapeLayer.tsx.
 *
 * Verifies that:
 *   1. On mount, add(layer, 0) is called for the initial mode (no prior base
 *      to remove).
 *   2. Changing the drape mode swaps the BASE in place: the new layer is
 *      added at index 0 and the previous base is removed.
 *   3. Overlay layers at indices 1+ are NOT removed by the swap (the C4 fix).
 *   4. A destroyed viewer is skipped (no crash).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Fake Cesium imageryLayers — minimal collection that tracks length, get,
// add(layer, idx), remove. Order doesn't have to be perfectly modelled; we
// just need to assert the right calls happen.
// ---------------------------------------------------------------------------

interface FakeLayer { id: string }

function makeFakeLayers(initial: FakeLayer[] = []) {
  const layers = [...initial];
  return {
    get length() { return layers.length; },
    get: vi.fn((i: number) => layers[i]),
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

let fakeLayers = makeFakeLayers();

const fakeViewer = {
  isDestroyed: vi.fn(() => false),
  imageryLayers: fakeLayers,
};

vi.mock('resium', () => ({
  useCesium: () => ({ viewer: fakeViewer }),
}));

// ---------------------------------------------------------------------------
// Mock Cesium — createImageryLayer returns sequential fake layers each call.
// ---------------------------------------------------------------------------

let layerCounter = 0;
vi.mock('cesium', () => ({
  IonImageryProvider: { fromAssetId: vi.fn(() => Promise.resolve({})) },
  ArcGisMapServerImageryProvider: { fromUrl: vi.fn(() => Promise.resolve({})) },
  UrlTemplateImageryProvider: vi.fn(() => ({})),
  ImageryLayer: {
    fromProviderAsync: vi.fn(() => ({ id: `base-${++layerCounter}` })),
  },
  Credit: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Zustand store mock
// ---------------------------------------------------------------------------

let mockSurfaceDrape = 'satellite';
const mockSetSurfaceDrape = vi.fn((mode: string) => {
  mockSurfaceDrape = mode;
});

vi.mock('../store/useAppStore.js', () => ({
  useAppStore: (selector: (s: { surfaceDrape: string; setSurfaceDrape: typeof mockSetSurfaceDrape }) => unknown) =>
    selector({ surfaceDrape: mockSurfaceDrape, setSurfaceDrape: mockSetSurfaceDrape }),
}));

import SurfaceDrapeLayer from './SurfaceDrapeLayer.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SurfaceDrapeLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layerCounter = 0;
    mockSurfaceDrape = 'satellite';
    fakeLayers = makeFakeLayers();
    // Re-bind the viewer to the new fake collection.
    (fakeViewer as { imageryLayers: typeof fakeLayers }).imageryLayers = fakeLayers;
    fakeViewer.isDestroyed.mockReturnValue(false);
  });

  it('adds the base layer at index 0 on initial mount', () => {
    render(<SurfaceDrapeLayer />);
    expect(fakeLayers.add).toHaveBeenCalledTimes(1);
    expect(fakeLayers.add).toHaveBeenCalledWith(expect.any(Object), 0);
    // No prior base, so remove should not have been called.
    expect(fakeLayers.remove).not.toHaveBeenCalled();
  });

  it('does not call add() when viewer is destroyed', () => {
    fakeViewer.isDestroyed.mockReturnValue(true);
    render(<SurfaceDrapeLayer />);
    expect(fakeLayers.add).not.toHaveBeenCalled();
  });

  it('swaps the base layer in place when surfaceDrape changes', async () => {
    const { rerender } = render(<SurfaceDrapeLayer />);
    const firstBase = fakeLayers._peek()[0]!;

    mockSurfaceDrape = 'hillshade';
    await act(async () => {
      rerender(<SurfaceDrapeLayer />);
    });

    // Two adds total (initial + swap), each at index 0.
    expect(fakeLayers.add).toHaveBeenCalledTimes(2);
    expect(fakeLayers.add).toHaveBeenLastCalledWith(expect.any(Object), 0);
    // The first base should have been removed once.
    expect(fakeLayers.remove).toHaveBeenCalledTimes(1);
    expect(fakeLayers.remove).toHaveBeenCalledWith(firstBase);
  });

  it('preserves overlay layers at indices 1+ when swapping the base', async () => {
    // Pre-seed an overlay at index 1 (simulating SlopeAspectLayer).
    const overlay: FakeLayer = { id: 'slope-overlay' };
    fakeLayers = makeFakeLayers([{ id: 'pre-existing-base' }, overlay]);
    (fakeViewer as { imageryLayers: typeof fakeLayers }).imageryLayers = fakeLayers;

    const { rerender } = render(<SurfaceDrapeLayer />);
    // After the initial render the base is replaced by add()@0 + remove(old).
    expect(fakeLayers._peek()).toContain(overlay);

    mockSurfaceDrape = 'topographic';
    await act(async () => {
      rerender(<SurfaceDrapeLayer />);
    });
    // Overlay should still be in the collection — never removed.
    expect(fakeLayers._peek()).toContain(overlay);
    // remove() never called on the overlay.
    expect(fakeLayers.remove).not.toHaveBeenCalledWith(overlay);
  });
});
