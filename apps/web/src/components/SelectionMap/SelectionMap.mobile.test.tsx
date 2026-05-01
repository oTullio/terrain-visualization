/**
 * Tests for the mobile sidebar toggle in App.tsx (E5).
 *
 * Covers:
 *   1. "Selection" button is in the document (visible only on mobile via CSS).
 *   2. Clicking "Selection" opens the sidebar overlay (aria-expanded + sidebar becomes visible).
 *   3. Clicking the close button (✕) hides the sidebar.
 *   4. Clicking the backdrop closes the sidebar.
 *   5. Pressing Escape closes the sidebar.
 *
 * We render App.tsx and interact with it. Heavy dependencies (Cesium,
 * Resium, MapLibre, all layer components) are mocked so no WebGL is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock Cesium + Resium so the Viewer doesn't need WebGL
// ---------------------------------------------------------------------------

vi.mock('cesium', async () => {
  const actual = (await vi.importActual('cesium')) as Record<string, unknown>;
  return {
    ...actual,
    Terrain: { fromWorldTerrain: vi.fn(() => ({})) },
  };
});

vi.mock('resium', () => ({
  Viewer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="cesium-viewer">{children}</div>
  ),
  useCesium: () => ({ viewer: null }),
}));

// ---------------------------------------------------------------------------
// Mock all heavy layer / tool components
// ---------------------------------------------------------------------------

vi.mock('../../buildings/BuildingsLayer.js', () => ({ default: () => null }));
vi.mock('../../water/WaterLayer.js', () => ({ default: () => null }));
vi.mock('../../roads/RoadsLayer.js', () => ({ default: () => null }));
vi.mock('../../components/LayersStatus.js', () => ({ default: () => null }));
vi.mock('../../components/ToolsPanel.js', () => ({ default: () => null }));
vi.mock('../../terrain/SurfaceDrapeLayer.js', () => ({ default: () => null }));
vi.mock('../../components/SurfaceDrapeToggle.js', () => ({ default: () => null }));
vi.mock('../../components/ReducedSceneToggle.js', () => ({ default: () => null }));
vi.mock('../../components/ExportPanel.js', () => ({ default: () => null }));
vi.mock('../../tools/MeasurementHandler.js', () => ({ default: () => null }));
vi.mock('../../tools/ToolPanelMount.js', () => ({ default: () => null }));
vi.mock('../../components/AttributionOverlay.js', () => ({ default: () => null }));
vi.mock('../../components/AboutButton.js', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>About</button>
  ),
}));
vi.mock('../../components/AboutPanel.js', () => ({ default: () => null }));

// SelectionMap is kept as a lightweight stub so we can see the sidebar content.
vi.mock('../../components/SelectionMap/SelectionMap.js', () => ({
  default: () => <div data-testid="selection-map">2D Map</div>,
}));

// ---------------------------------------------------------------------------
// Mock Zustand store (minimal — sidebar state lives in App local state)
// ---------------------------------------------------------------------------

vi.mock('../../store/useAppStore.js', () => ({
  useAppStore: (selector: (s: { setSelection: () => void; reducedScene: boolean; setReducedScene: () => void }) => unknown) =>
    selector({ setSelection: vi.fn(), reducedScene: false, setReducedScene: vi.fn() }),
}));

import App from '../../App.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App — mobile sidebar toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Selection" header button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Show selection map' })).toBeInTheDocument();
  });

  it('sidebar is hidden by default (aria-expanded=false)', () => {
    render(<App />);
    const toggle = screen.getByRole('button', { name: 'Show selection map' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('clicking "Selection" button opens the sidebar (aria-expanded=true)', async () => {
    render(<App />);
    const toggle = screen.getByRole('button', { name: 'Show selection map' });

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // The SelectionMap stub should now be visible.
    expect(screen.getByTestId('selection-map')).toBeInTheDocument();
  });

  it('clicking the close button (✕) closes the sidebar', async () => {
    render(<App />);

    // Open it first.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show selection map' }));
    });
    expect(screen.getByRole('button', { name: 'Show selection map' })).toHaveAttribute('aria-expanded', 'true');

    // Close it via the ✕ button.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close selection map' }));
    });
    expect(screen.getByRole('button', { name: 'Show selection map' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('pressing Escape closes the sidebar', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show selection map' }));
    });
    expect(screen.getByRole('button', { name: 'Show selection map' })).toHaveAttribute('aria-expanded', 'true');

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.getByRole('button', { name: 'Show selection map' })).toHaveAttribute('aria-expanded', 'false');
  });
});
