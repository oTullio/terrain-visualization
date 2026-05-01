/**
 * Tests for AreaVolumeTool.
 *
 *   1. Picking states: prompt text per polygon length; Reset visible only
 *      when at least one vertex.
 *   2. Finalized + ready: results list shows planimetric / surface /
 *      reference / cut / fill / net.
 *   3. Error state: shows the error message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { PickedPoint, AreaVolumeReferenceMode, AreaVolumeStatus, AreaVolumeSamples } from '../../store/useAppStore.js';

const mockReset = vi.fn();
const mockSetMode = vi.fn();
const mockSetCustom = vi.fn();

interface MockState {
  areaVolume: {
    polygon: PickedPoint[];
    finalized: boolean;
    samples: AreaVolumeSamples | null;
    status: AreaVolumeStatus;
    errorMessage?: string;
    referenceMode: AreaVolumeReferenceMode;
    customReferenceM: number;
  };
  setAreaVolumeReferenceMode: typeof mockSetMode;
  setAreaVolumeCustomReference: typeof mockSetCustom;
  resetAreaVolume: typeof mockReset;
}

let state: MockState;

vi.mock('../../store/useAppStore.js', () => ({
  useAppStore: (selector: (s: MockState) => unknown) => selector(state),
}));

import AreaVolumeTool from './AreaVolumeTool.js';

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    areaVolume: {
      polygon: [],
      finalized: false,
      samples: null,
      status: 'idle',
      referenceMode: 'lowest',
      customReferenceM: 0,
    },
    setAreaVolumeReferenceMode: mockSetMode,
    setAreaVolumeCustomReference: mockSetCustom,
    resetAreaVolume: mockReset,
  };
});

const TRI: PickedPoint[] = [
  { lng: 0, lat: 0, height: 10 },
  { lng: 0.01, lat: 0, height: 20 },
  { lng: 0, lat: 0.01, height: 30 },
];

describe('AreaVolumeTool', () => {
  it('shows picking prompts based on vertex count', () => {
    state.areaVolume.polygon = [];
    const { rerender } = render(<AreaVolumeTool />);
    expect(screen.getByTestId('av-prompt').textContent).toMatch(/double-click to finish/i);

    state.areaVolume.polygon = [TRI[0]!];
    rerender(<AreaVolumeTool />);
    expect(screen.getByTestId('av-prompt').textContent).toMatch(/second vertex/i);

    state.areaVolume.polygon = [TRI[0]!, TRI[1]!];
    rerender(<AreaVolumeTool />);
    expect(screen.getByTestId('av-prompt').textContent).toMatch(/at least one more/i);
  });

  it('finalized + ready: renders the results list', () => {
    state.areaVolume.polygon = TRI;
    state.areaVolume.finalized = true;
    state.areaVolume.status = 'ready';
    state.areaVolume.samples = {
      heights: new Float32Array([10, 20, 30, 40]),
      cols: 2,
      rows: 2,
      cellAreaM2: 100,
      cellSizeMx: 10,
      cellSizeMy: 10,
      cellsInside: 4,
    };
    render(<AreaVolumeTool />);
    expect(screen.getByTestId('av-results')).toBeInTheDocument();
    // Reference, Cut, Fill, Net labels are present.
    expect(screen.getByText(/Reference/i)).toBeInTheDocument();
    expect(screen.getByText(/Cut/)).toBeInTheDocument();
    expect(screen.getByText(/Fill/)).toBeInTheDocument();
    expect(screen.getByText(/Net/)).toBeInTheDocument();
  });

  it('error status: shows the error alert', () => {
    state.areaVolume.polygon = TRI;
    state.areaVolume.finalized = true;
    state.areaVolume.status = 'error';
    state.areaVolume.errorMessage = 'No terrain available';
    render(<AreaVolumeTool />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/No terrain available/);
  });

  it('reference-mode picker dispatches setAreaVolumeReferenceMode', () => {
    state.areaVolume.polygon = TRI;
    state.areaVolume.finalized = true;
    state.areaVolume.status = 'ready';
    state.areaVolume.samples = {
      heights: new Float32Array([5, 5, 5, 5]),
      cols: 2,
      rows: 2,
      cellAreaM2: 100,
      cellSizeMx: 10,
      cellSizeMy: 10,
      cellsInside: 4,
    };
    render(<AreaVolumeTool />);
    const meanBtn = screen.getByRole('radio', { name: 'Mean' });
    fireEvent.click(meanBtn);
    expect(mockSetMode).toHaveBeenCalledWith('mean');
  });
});
