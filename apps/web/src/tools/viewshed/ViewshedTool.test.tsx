/**
 * Tests for ViewshedTool.
 *
 *   1. No observer: shows instruction + idle status text.
 *   2. Observer set: shows formatted lng/lat/height.
 *   3. Eye height input dispatches setViewshedEyeHeight on change.
 *   4. Max range input dispatches setViewshedMaxRange on change.
 *   5. Reset button calls resetViewshed; disabled when idle + no observer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { PickedPoint, ViewshedStatus, ViewshedGridDims } from '../../store/useAppStore.js';

const mockReset = vi.fn();
const mockSetEyeHeight = vi.fn();
const mockSetMaxRange = vi.fn();

interface MockState {
  viewshed: {
    observer: PickedPoint | null;
    observerEyeHeightM: number;
    maxRangeM: number;
    status: ViewshedStatus;
    errorMessage: string | undefined;
    cells: Uint8Array | null;
    gridDims: ViewshedGridDims | null;
  };
  resetViewshed: typeof mockReset;
  setViewshedEyeHeight: typeof mockSetEyeHeight;
  setViewshedMaxRange: typeof mockSetMaxRange;
}

let state: MockState;

vi.mock('../../store/useAppStore.js', () => ({
  useAppStore: (selector: (s: MockState) => unknown) => selector(state),
}));

import ViewshedTool from './ViewshedTool.js';

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    viewshed: {
      observer: null,
      observerEyeHeightM: 2,
      maxRangeM: 3000,
      status: 'idle',
      errorMessage: undefined,
      cells: null,
      gridDims: null,
    },
    resetViewshed: mockReset,
    setViewshedEyeHeight: mockSetEyeHeight,
    setViewshedMaxRange: mockSetMaxRange,
  };
});

const OBS: PickedPoint = { lng: 38.7164, lat: -9.1428, height: 78.2 };

describe('ViewshedTool', () => {
  it('shows instruction and idle status text when no observer is set', () => {
    render(<ViewshedTool />);
    expect(screen.getByTestId('vs-instruction').textContent).toMatch(
      /Click on the scene to place observer/i,
    );
    expect(screen.getByTestId('vs-status').textContent).toMatch(
      /Place an observer point to begin/i,
    );
  });

  it('shows formatted observer position after observer is set', () => {
    state.viewshed.observer = OBS;
    state.viewshed.status = 'computing';
    render(<ViewshedTool />);
    const pos = screen.getByTestId('vs-observer').textContent ?? '';
    expect(pos).toContain('38.7164°');
    expect(pos).toContain('-9.1428°');
    expect(pos).toContain('78.2 m');
  });

  it('eye height input updates the store on change', () => {
    render(<ViewshedTool />);
    const input = screen.getByLabelText('Eye height (m)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '10' } });
    expect(mockSetEyeHeight).toHaveBeenCalledWith(10);
  });

  it('max range input updates the store on change', () => {
    render(<ViewshedTool />);
    const input = screen.getByLabelText('Max range (m)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5000' } });
    expect(mockSetMaxRange).toHaveBeenCalledWith(5000);
  });

  it('reset button calls resetViewshed and is disabled when idle with no observer', () => {
    // idle + no observer → disabled
    render(<ViewshedTool />);
    const btn = screen.getByRole('button', { name: 'Reset' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('reset button is enabled when observer is set', () => {
    state.viewshed.observer = OBS;
    state.viewshed.status = 'computing';
    render(<ViewshedTool />);
    const btn = screen.getByRole('button', { name: 'Reset' });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(mockReset).toHaveBeenCalledOnce();
  });
});
