/**
 * Tests for ElevationProfileTool.
 *
 * Recharts is wholesale-mocked: rendering the real SVG tree in jsdom is
 * slow and noisy, and the tests we care about are about state transitions
 * + sample data wiring, not pixel-perfect chart layout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import type { PickedPoint, ElevationSample } from '../../store/useAppStore.js';

// ---------------------------------------------------------------------------
// Recharts stub
// ---------------------------------------------------------------------------
vi.mock('recharts', () => {
  const Stub = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'recharts-stub' }, children);
  return {
    AreaChart: Stub,
    Area: Stub,
    XAxis: Stub,
    YAxis: Stub,
    Tooltip: Stub,
    CartesianGrid: Stub,
    ResponsiveContainer: Stub,
  };
});

// ---------------------------------------------------------------------------
// Resium / Cesium / sampleAlongLine mocks
// ---------------------------------------------------------------------------
const fakeEntity = { id: 'fake' };
const fakeViewer = {
  isDestroyed: vi.fn(() => false),
  terrainProvider: {} as unknown,
  entities: { add: vi.fn(() => fakeEntity), remove: vi.fn() },
};

vi.mock('resium', () => ({ useCesium: () => ({ viewer: fakeViewer }) }));

vi.mock('cesium', async () => {
  const actual = (await vi.importActual('cesium')) as Record<string, unknown>;
  return {
    ...actual,
    Color: {
      ...(actual['Color'] as Record<string, unknown>),
      fromCssColorString: vi.fn(() => ({})),
      WHITE: {},
    },
    Cartesian3: {
      ...(actual['Cartesian3'] as Record<string, unknown>),
      fromDegreesArray: vi.fn(() => []),
      fromDegrees: vi.fn(() => ({})),
    },
  };
});

const mockSamples: ElevationSample[] = [
  { lng: 0, lat: 0, height: 0, distance: 0 },
  { lng: 0.001, lat: 0, height: 25, distance: 100 },
  { lng: 0.002, lat: 0, height: 50, distance: 200 },
];
vi.mock('../sampleAlongLine.js', () => ({
  sampleAlongLine: vi.fn(async () => mockSamples),
  DEFAULT_SAMPLES: 100,
}));

// ---------------------------------------------------------------------------
// Store mock
// ---------------------------------------------------------------------------
let mockPoints: PickedPoint[] = [];
let mockSamplesState: ElevationSample[] | null = null;
const mockSetSamples = vi.fn((s: ElevationSample[]) => {
  mockSamplesState = s;
});
const mockReset = vi.fn();

vi.mock('../../store/useAppStore.js', () => ({
  useAppStore: (
    selector: (s: {
      elevationProfile: { points: PickedPoint[]; samples: ElevationSample[] | null };
      setElevationSamples: typeof mockSetSamples;
      resetElevationProfile: () => void;
    }) => unknown,
  ) =>
    selector({
      elevationProfile: { points: mockPoints, samples: mockSamplesState },
      setElevationSamples: mockSetSamples,
      resetElevationProfile: mockReset,
    }),
}));

import ElevationProfileTool from './ElevationProfileTool.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockPoints = [];
  mockSamplesState = null;
});

describe('ElevationProfileTool', () => {
  it('renders the empty-state prompt with no points', () => {
    mockPoints = [];
    render(<ElevationProfileTool />);
    expect(screen.getByText(/click two points/i)).toBeInTheDocument();
  });

  it('prompts for the second click after one point', () => {
    mockPoints = [{ lng: 0, lat: 0, height: 0 }];
    render(<ElevationProfileTool />);
    expect(screen.getByText(/click second point/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('renders the chart container after sampling resolves', async () => {
    mockPoints = [
      { lng: 0, lat: 0, height: 0 },
      { lng: 0.002, lat: 0, height: 50 },
    ];
    mockSamplesState = mockSamples; // pretend samples are already in the store

    await act(async () => {
      render(<ElevationProfileTool />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('elevation-profile-chart')).toBeInTheDocument();
    });

    // Polyline entity added (chart hover dot is created lazily on mouse move).
    expect(fakeViewer.entities.add).toHaveBeenCalled();
  });
});
