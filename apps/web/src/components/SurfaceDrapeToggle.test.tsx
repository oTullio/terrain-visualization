/**
 * Tests for SurfaceDrapeToggle.tsx.
 *
 * Verifies:
 *   1. Renders exactly three radio buttons with the correct labels.
 *   2. The ARIA radiogroup / radio roles are present.
 *   3. Clicking a button calls setSurfaceDrape with the correct mode.
 *   4. The active button has aria-checked="true"; others have aria-checked="false".
 *   5. The active button has the visually-distinct class (bg-emerald-600).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

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

import SurfaceDrapeToggle from './SurfaceDrapeToggle.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SurfaceDrapeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSurfaceDrape = 'satellite';
  });

  it('renders three buttons with the correct labels', () => {
    render(<SurfaceDrapeToggle />);

    expect(screen.getByText('Satellite')).toBeInTheDocument();
    expect(screen.getByText('Hillshade')).toBeInTheDocument();
    expect(screen.getByText('Topographic')).toBeInTheDocument();
  });

  it('has role="radiogroup" on the container and role="radio" on each button', () => {
    render(<SurfaceDrapeToggle />);

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('active button has aria-checked="true", others have aria-checked="false"', () => {
    mockSurfaceDrape = 'hillshade';
    render(<SurfaceDrapeToggle />);

    const satellite = screen.getByText('Satellite').closest('[role="radio"]');
    const hillshade = screen.getByText('Hillshade').closest('[role="radio"]');
    const topographic = screen.getByText('Topographic').closest('[role="radio"]');

    expect(satellite).toHaveAttribute('aria-checked', 'false');
    expect(hillshade).toHaveAttribute('aria-checked', 'true');
    expect(topographic).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking a button calls setSurfaceDrape with the correct mode', () => {
    render(<SurfaceDrapeToggle />);

    fireEvent.click(screen.getByText('Hillshade'));
    expect(mockSetSurfaceDrape).toHaveBeenCalledWith('hillshade');

    fireEvent.click(screen.getByText('Topographic'));
    expect(mockSetSurfaceDrape).toHaveBeenCalledWith('topographic');

    fireEvent.click(screen.getByText('Satellite'));
    expect(mockSetSurfaceDrape).toHaveBeenCalledWith('satellite');
  });

  it('the active button has the emerald background class', () => {
    mockSurfaceDrape = 'topographic';
    render(<SurfaceDrapeToggle />);

    const topoBtn = screen.getByText('Topographic').closest('[role="radio"]');
    expect(topoBtn?.className).toContain('bg-emerald-600');

    const satBtn = screen.getByText('Satellite').closest('[role="radio"]');
    expect(satBtn?.className).not.toContain('bg-emerald-600');
  });
});
