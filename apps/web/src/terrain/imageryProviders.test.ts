/**
 * Tests for imageryProviders.ts.
 *
 * Cesium is mocked at the module level so no real WebGL context is needed.
 * We verify that:
 *   1. createImageryLayer returns a non-null layer for each mode.
 *   2. IMAGERY_ATTRIBUTIONS contains the expected attribution substrings.
 *   3. An unknown mode (narrowed past the type via cast) throws.
 *   4. The correct Cesium provider factory is called per mode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Cesium
// ---------------------------------------------------------------------------

const mockFromAssetId = vi.fn(() => Promise.resolve({ type: 'IonProvider' }));
const mockFromUrl = vi.fn(() => Promise.resolve({ type: 'ArcGisProvider' }));
const mockUrlTemplateProvider = vi.fn(() => ({ type: 'UrlTemplateProvider' }));
const mockFromProviderAsync = vi.fn((_promise: unknown) => ({ type: 'ImageryLayer' }));
const mockCredit = vi.fn((_html: string, _showOnScreen: boolean) => ({ html: _html }));

vi.mock('cesium', () => ({
  IonImageryProvider: {
    fromAssetId: (...args: unknown[]) => mockFromAssetId(...args),
  },
  ArcGisMapServerImageryProvider: {
    fromUrl: (...args: unknown[]) => mockFromUrl(...args),
  },
  UrlTemplateImageryProvider: function (...args: unknown[]) {
    return mockUrlTemplateProvider(...args);
  },
  ImageryLayer: {
    fromProviderAsync: (...args: unknown[]) => mockFromProviderAsync(...args),
  },
  Credit: function (...args: unknown[]) {
    return mockCredit(...args);
  },
}));

import { createImageryLayer, IMAGERY_ATTRIBUTIONS } from './imageryProviders.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IMAGERY_ATTRIBUTIONS', () => {
  it('satellite attribution references Bing or Ion', () => {
    expect(IMAGERY_ATTRIBUTIONS.satellite).toMatch(/Ion/i);
  });

  it('hillshade attribution references Esri or ArcGIS', () => {
    expect(IMAGERY_ATTRIBUTIONS.hillshade).toMatch(/[Ee]sri|ArcGIS/);
  });

  it('topographic attribution references OpenTopoMap', () => {
    expect(IMAGERY_ATTRIBUTIONS.topographic).toMatch(/OpenTopoMap/);
  });
});

describe('createImageryLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: fromProviderAsync returns a stub layer
    mockFromProviderAsync.mockImplementation((_p: unknown) => ({ type: 'ImageryLayer' }));
    mockFromAssetId.mockReturnValue(Promise.resolve({ type: 'IonProvider' }));
    mockFromUrl.mockReturnValue(Promise.resolve({ type: 'ArcGisProvider' }));
    mockUrlTemplateProvider.mockReturnValue({ type: 'UrlTemplateProvider' });
  });

  it('returns a non-null ImageryLayer for satellite mode', () => {
    const layer = createImageryLayer('satellite');
    expect(layer).not.toBeNull();
    expect(mockFromAssetId).toHaveBeenCalledWith(2);
    expect(mockFromProviderAsync).toHaveBeenCalledTimes(1);
  });

  it('returns a non-null ImageryLayer for hillshade mode', () => {
    const layer = createImageryLayer('hillshade');
    expect(layer).not.toBeNull();
    expect(mockFromUrl).toHaveBeenCalledWith(
      expect.stringContaining('World_Hillshade'),
    );
    expect(mockFromProviderAsync).toHaveBeenCalledTimes(1);
  });

  it('returns a non-null ImageryLayer for topographic mode', () => {
    const layer = createImageryLayer('topographic');
    expect(layer).not.toBeNull();
    expect(mockUrlTemplateProvider).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('opentopomap.org') }),
    );
    expect(mockFromProviderAsync).toHaveBeenCalledTimes(1);
  });

  it('throws for an unknown mode (defensive check)', () => {
    expect(() => {
      // Cast past the type system to simulate a runtime bad value.
      createImageryLayer('unknown' as 'satellite');
    }).toThrow(/Unknown drape mode/);
  });
});
