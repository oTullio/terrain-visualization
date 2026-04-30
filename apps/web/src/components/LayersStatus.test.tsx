/**
 * Tests for LayersStatus.tsx — multi-layer status overlay.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { LayerStatus } from '../store/useAppStore.js';

// ---------------------------------------------------------------------------
// Store mock
// ---------------------------------------------------------------------------

const mockSetLayerStatus = vi.fn();

type StoreShape = {
  layerStatus: Record<string, LayerStatus>;
  setLayerStatus: typeof mockSetLayerStatus;
};

let storeState: StoreShape = {
  layerStatus: {
    terrain: { status: 'idle' },
    buildings: { status: 'idle' },
    water: { status: 'idle' },
    roads: { status: 'idle' },
  },
  setLayerStatus: mockSetLayerStatus,
};

vi.mock('../store/useAppStore.js', () => ({
  useAppStore: (selector: (s: StoreShape) => unknown) => selector(storeState),
}));

import LayersStatus from './LayersStatus.js';

describe('LayersStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState = {
      layerStatus: {
        terrain: { status: 'idle' },
        buildings: { status: 'idle' },
        water: { status: 'idle' },
        roads: { status: 'idle' },
      },
      setLayerStatus: mockSetLayerStatus,
    };
  });

  it('renders nothing when all layers are idle', () => {
    const { container } = render(<LayersStatus />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when all layers are ready with no dropped features', () => {
    storeState.layerStatus.buildings = { status: 'ready', total: 10, kept: 10, dropped: 0 };
    storeState.layerStatus.water = { status: 'ready', total: 5, kept: 5, dropped: 0 };
    const { container } = render(<LayersStatus />);
    expect(container.firstChild).toBeNull();
  });

  it('shows loading spinner for a loading layer', () => {
    storeState.layerStatus.water = { status: 'loading' };
    render(<LayersStatus />);
    expect(screen.getByText('Loading water…')).toBeInTheDocument();
  });

  it('shows loading for buildings and water simultaneously', () => {
    storeState.layerStatus.buildings = { status: 'loading' };
    storeState.layerStatus.water = { status: 'loading' };
    render(<LayersStatus />);
    expect(screen.getByText('Loading buildings…')).toBeInTheDocument();
    expect(screen.getByText('Loading water…')).toBeInTheDocument();
  });

  it('shows cap notice when a layer has dropped features', () => {
    storeState.layerStatus.buildings = {
      status: 'ready',
      total: 1000,
      kept: 500,
      dropped: 500,
    };
    render(<LayersStatus />);
    expect(screen.getByText(/Buildings: showing 500 of 1,000/)).toBeInTheDocument();
  });

  it('shows error message with layer name prefix', () => {
    storeState.layerStatus.water = {
      status: 'error',
      message: 'Too much water in area.',
    };
    render(<LayersStatus />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Too much water in area\./)).toBeInTheDocument();
  });

  it('calls setLayerStatus with idle on Dismiss click', () => {
    storeState.layerStatus.water = {
      status: 'error',
      message: 'Some error.',
    };
    render(<LayersStatus />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(mockSetLayerStatus).toHaveBeenCalledWith('water', { status: 'idle' });
  });
});
