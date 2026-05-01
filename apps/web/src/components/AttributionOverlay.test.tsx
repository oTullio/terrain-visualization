/**
 * Tests for AttributionOverlay.tsx.
 *
 * Verifies:
 *   1. Satellite drape renders the correct imagery credit.
 *   2. Hillshade drape renders the correct imagery credit.
 *   3. Topographic drape renders the correct imagery credit.
 *   4. OSM data credit and Cesium terrain credit are always present.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Zustand store mock
// ---------------------------------------------------------------------------

let mockSurfaceDrape = 'satellite';

vi.mock('../store/useAppStore.js', () => ({
  useAppStore: (selector: (s: { surfaceDrape: string }) => unknown) =>
    selector({ surfaceDrape: mockSurfaceDrape }),
}));

import AttributionOverlay from './AttributionOverlay.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AttributionOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSurfaceDrape = 'satellite';
  });

  it('shows the satellite imagery credit when drape is satellite', () => {
    mockSurfaceDrape = 'satellite';
    render(<AttributionOverlay />);
    const el = screen.getByLabelText('Map data attributions');
    expect(el.textContent).toContain('Microsoft');
    expect(el.textContent).toContain('Bing Maps');
  });

  it('shows the hillshade imagery credit when drape is hillshade', () => {
    mockSurfaceDrape = 'hillshade';
    render(<AttributionOverlay />);
    const el = screen.getByLabelText('Map data attributions');
    expect(el.textContent).toContain('Esri');
    expect(el.textContent).toContain('Hillshade');
  });

  it('shows the topographic imagery credit when drape is topographic', () => {
    mockSurfaceDrape = 'topographic';
    render(<AttributionOverlay />);
    const el = screen.getByLabelText('Map data attributions');
    expect(el.textContent).toContain('OpenTopoMap');
    expect(el.textContent).toContain('CC-BY-SA');
  });

  it('always shows OSM data and Cesium terrain credits', () => {
    render(<AttributionOverlay />);
    const el = screen.getByLabelText('Map data attributions');
    expect(el.textContent).toContain('OpenStreetMap contributors');
    expect(el.textContent).toContain('© Cesium');
  });
});
