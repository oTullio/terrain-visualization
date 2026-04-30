/**
 * Tests for SurfaceDrapeLayer.tsx.
 *
 * Verifies that:
 *   1. On mount, removeAll() + add() are called once for the initial mode.
 *   2. Changing the drape mode via the store triggers another removeAll() + add().
 *   3. A destroyed viewer is skipped (no crash).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Fake Cesium viewer
// ---------------------------------------------------------------------------

const fakeLayer = { type: 'FakeImageryLayer' };
const fakeViewer = {
  isDestroyed: vi.fn(() => false),
  imageryLayers: {
    removeAll: vi.fn(),
    add: vi.fn(),
  },
};

vi.mock('resium', () => ({
  useCesium: () => ({ viewer: fakeViewer }),
}));

// ---------------------------------------------------------------------------
// Mock Cesium
// ---------------------------------------------------------------------------

vi.mock('cesium', () => ({
  IonImageryProvider: {
    fromAssetId: vi.fn(() => Promise.resolve({ type: 'IonProvider' })),
  },
  ArcGisMapServerImageryProvider: {
    fromUrl: vi.fn(() => Promise.resolve({ type: 'ArcGisProvider' })),
  },
  UrlTemplateImageryProvider: vi.fn(() => ({ type: 'UrlTemplateProvider' })),
  ImageryLayer: {
    fromProviderAsync: vi.fn(() => fakeLayer),
  },
  Credit: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Zustand store mock — real store state with overridable surfaceDrape
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
    mockSurfaceDrape = 'satellite';
    fakeViewer.isDestroyed.mockReturnValue(false);
  });

  it('calls removeAll() and add() once on mount for the default satellite mode', () => {
    render(<SurfaceDrapeLayer />);

    expect(fakeViewer.imageryLayers.removeAll).toHaveBeenCalledTimes(1);
    expect(fakeViewer.imageryLayers.add).toHaveBeenCalledTimes(1);
    expect(fakeViewer.imageryLayers.add).toHaveBeenCalledWith(fakeLayer);
  });

  it('does not call removeAll() when viewer is destroyed', () => {
    fakeViewer.isDestroyed.mockReturnValue(true);
    render(<SurfaceDrapeLayer />);
    expect(fakeViewer.imageryLayers.removeAll).not.toHaveBeenCalled();
  });

  it('swaps layers again when surfaceDrape changes', async () => {
    const { rerender } = render(<SurfaceDrapeLayer />);
    expect(fakeViewer.imageryLayers.removeAll).toHaveBeenCalledTimes(1);

    // Simulate store change to hillshade
    mockSurfaceDrape = 'hillshade';
    await act(async () => {
      rerender(<SurfaceDrapeLayer />);
    });

    // removeAll and add should each have been called twice total (once per render cycle)
    expect(fakeViewer.imageryLayers.removeAll).toHaveBeenCalledTimes(2);
    expect(fakeViewer.imageryLayers.add).toHaveBeenCalledTimes(2);
  });
});
