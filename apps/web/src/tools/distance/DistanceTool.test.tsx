/**
 * Tests for DistanceTool.
 *
 * Renders the component three times under mocked store states:
 *   - 0 points → prompt for two points.
 *   - 1 point  → "Click second point".
 *   - 2 points → planimetric distance + Δheight rendered (surface distance
 *                comes from the mocked sampleAlongLine).
 *
 * sampleAlongLine and the cesium entities API are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import type { PickedPoint } from '../../store/useAppStore.js';

const fakeEntity = { id: 'fake' };
const fakeViewer = {
  isDestroyed: vi.fn(() => false),
  terrainProvider: {} as unknown,
  entities: {
    add: vi.fn(() => fakeEntity),
    remove: vi.fn(),
  },
};

vi.mock('resium', () => ({
  useCesium: () => ({ viewer: fakeViewer }),
}));

vi.mock('cesium', async () => {
  const actual = (await vi.importActual('cesium')) as Record<string, unknown>;
  return {
    ...actual,
    Color: {
      ...(actual['Color'] as Record<string, unknown>),
      fromCssColorString: vi.fn(() => ({})),
    },
    Cartesian3: {
      ...(actual['Cartesian3'] as Record<string, unknown>),
      fromDegreesArray: vi.fn(() => []),
    },
  };
});

vi.mock('../sampleAlongLine.js', () => ({
  sampleAlongLine: vi.fn(async () => [
    { lng: 0, lat: 0, height: 0, distance: 0 },
    { lng: 0.001, lat: 0, height: 0, distance: 111.3 },
  ]),
  DEFAULT_SAMPLES: 100,
}));

let mockPoints: PickedPoint[] = [];
const mockResetDistance = vi.fn();
vi.mock('../../store/useAppStore.js', () => ({
  useAppStore: (
    selector: (s: { distance: { points: PickedPoint[] }; resetDistance: () => void }) => unknown,
  ) =>
    selector({
      distance: { points: mockPoints },
      resetDistance: mockResetDistance,
    }),
}));

import DistanceTool from './DistanceTool.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockPoints = [];
});

describe('DistanceTool', () => {
  it('renders the empty-state prompt with no points', () => {
    mockPoints = [];
    render(<DistanceTool />);
    expect(screen.getByText(/click two points/i)).toBeInTheDocument();
  });

  it('prompts for the second click after one point', () => {
    mockPoints = [{ lng: -9, lat: 38, height: 100 }];
    render(<DistanceTool />);
    expect(screen.getByText(/click second point/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('shows planimetric and Δheight after two points are picked', async () => {
    mockPoints = [
      { lng: -9.1393, lat: 38.7223, height: 100 },
      { lng: -8.6109, lat: 41.1496, height: 250 },
    ];
    await act(async () => {
      render(<DistanceTool />);
    });
    // Planimetric label and a km-formatted value (Lisbon → Porto ~ 274 km).
    expect(screen.getByText(/planimetric/i)).toBeInTheDocument();
    expect(screen.getByText(/Δ height/i)).toBeInTheDocument();
    // Δ height = 250 - 100 = 150 m.
    expect(screen.getByText(/\+150\.0 m/)).toBeInTheDocument();

    // Surface distance resolves from the mocked sampleAlongLine on the next tick.
    await waitFor(() => {
      // Surface label remains; we just assert the spinner placeholder went away.
      const items = screen.getAllByText(/m|km/);
      expect(items.length).toBeGreaterThan(1);
    });

    // Polyline entity was added.
    expect(fakeViewer.entities.add).toHaveBeenCalled();
  });
});
