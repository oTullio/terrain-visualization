/**
 * Tests for SlopeAspectTool.
 *
 *   1. Renders the Slope/Aspect mode toggle. Active button has
 *      aria-checked="true".
 *   2. Loading state shows the sample-count message.
 *   3. Switching modes swaps the legend (slope ramp ↔ compass key).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { SlopeAspectMode, SlopeAspectStatus } from '../../store/useAppStore.js';
import type { BoundingBox } from '@terrain/shared';

let mockMode: SlopeAspectMode = 'slope';
let mockStatus: SlopeAspectStatus = { status: 'idle' };
let mockBbox: BoundingBox | null = { west: 0, south: 0, east: 1, north: 1 };
const mockSetMode = vi.fn((m: SlopeAspectMode) => {
  mockMode = m;
});
const mockClear = vi.fn();

vi.mock('../../store/useAppStore.js', () => ({
  useAppStore: (
    selector: (s: {
      slopeAspect: { mode: SlopeAspectMode; status: SlopeAspectStatus };
      bbox: BoundingBox | null;
      setSlopeAspectMode: typeof mockSetMode;
      clearSelection: typeof mockClear;
    }) => unknown,
  ) =>
    selector({
      slopeAspect: { mode: mockMode, status: mockStatus },
      bbox: mockBbox,
      setSlopeAspectMode: mockSetMode,
      clearSelection: mockClear,
    }),
}));

import SlopeAspectTool from './SlopeAspectTool.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockMode = 'slope';
  mockStatus = { status: 'idle' };
  mockBbox = { west: 0, south: 0, east: 1, north: 1 };
});

describe('SlopeAspectTool', () => {
  it('renders Slope and Aspect mode toggle buttons; active matches aria-checked', () => {
    render(<SlopeAspectTool />);
    const slope = screen.getByRole('radio', { name: 'Slope' });
    const aspect = screen.getByRole('radio', { name: 'Aspect' });
    expect(slope).toHaveAttribute('aria-checked', 'true');
    expect(aspect).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(aspect);
    expect(mockSetMode).toHaveBeenCalledWith('aspect');
  });

  it('shows the loading status with cell-count message', () => {
    mockStatus = { status: 'loading', cols: 200, rows: 100 };
    render(<SlopeAspectTool />);
    // Cell-count message is exposed in plain text.
    expect(screen.getByText(/Sampling terrain/i)).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument();
  });

  it('shows the slope legend in slope mode and the aspect legend in aspect mode', () => {
    mockMode = 'slope';
    const { rerender } = render(<SlopeAspectTool />);
    expect(screen.getByTestId('slope-legend')).toBeInTheDocument();
    expect(screen.queryByTestId('aspect-legend')).not.toBeInTheDocument();

    mockMode = 'aspect';
    rerender(<SlopeAspectTool />);
    expect(screen.getByTestId('aspect-legend')).toBeInTheDocument();
    expect(screen.queryByTestId('slope-legend')).not.toBeInTheDocument();
  });

  it('Reset button calls clearSelection; disabled when no bbox', () => {
    mockBbox = null;
    const { rerender } = render(<SlopeAspectTool />);
    const resetA = screen.getByRole('button', { name: /reset/i });
    expect(resetA).toBeDisabled();

    mockBbox = { west: 0, south: 0, east: 1, north: 1 };
    rerender(<SlopeAspectTool />);
    const resetB = screen.getByRole('button', { name: /reset/i });
    expect(resetB).not.toBeDisabled();
    fireEvent.click(resetB);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });
});
