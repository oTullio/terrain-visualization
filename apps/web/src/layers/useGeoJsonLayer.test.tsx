/**
 * Tests for the useGeoJsonLayer hook.
 *
 * Strategy: imperative test-only wrappers that exercise the hook's logic
 * by calling it through a thin React component rendered with
 * @testing-library/react. Cesium and Resium are both vi.mocked at the module
 * level so no real WebGL context is needed.
 *
 * Covered scenarios:
 *   1. Status transitions: idle → loading → ready
 *   2. Cleanup removes owned entities when bbox changes
 *   3. AbortController fires when bbox changes mid-fetch
 *   4. Error status surfaces from a rejected fetcher
 *   5. idle status when bbox is null
 *   6. renderFeature called once per kept feature
 *   7. errorToMessage customisation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import type { BoundingBox } from '@terrain/shared';
import type GeoJSON from 'geojson';
import type { Entity, Viewer } from 'cesium';

// ---------------------------------------------------------------------------
// Fake Cesium viewer — must be set up BEFORE the hook module is imported so
// that vi.mock factories can reference the fake.
// ---------------------------------------------------------------------------

const fakeEntity = { id: 'fake-entity' } as unknown as Entity;

const fakeViewer = {
  isDestroyed: vi.fn(() => false),
  entities: {
    add: vi.fn(() => fakeEntity),
    remove: vi.fn(),
  },
  camera: {
    flyTo: vi.fn(),
  },
};

// Mock Resium so useCesium() returns our fake viewer.
vi.mock('resium', () => ({
  useCesium: () => ({ viewer: fakeViewer }),
}));

// Mock Cesium — we only need Rectangle.fromDegrees to return something.
vi.mock('cesium', async () => {
  const actual = (await vi.importActual('cesium')) as Record<string, unknown>;
  return {
    ...actual,
    Rectangle: {
      fromDegrees: vi.fn((...args: number[]) => args),
    },
  };
});

// Mock the Zustand store to track setLayerStatus calls.
const mockSetLayerStatus = vi.fn();

vi.mock('../store/useAppStore.js', () => ({
  useAppStore: (selector: (s: { setLayerStatus: typeof mockSetLayerStatus }) => unknown) =>
    selector({ setLayerStatus: mockSetLayerStatus }),
}));

// Now import the hook (after mocks are in place).
import { useGeoJsonLayer } from './useGeoJsonLayer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_BBOX: BoundingBox = { west: -9, south: 38, east: -8, north: 39 };
const TEST_BBOX_2: BoundingBox = { west: -10, south: 37, east: -7, north: 40 };

type PlainFeature = GeoJSON.Feature<GeoJSON.Point>;

const EMPTY_FC: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: 'FeatureCollection',
  features: [],
};

const ONE_FC: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [0, 0] },
    },
  ],
};

/** Renders a component that calls useGeoJsonLayer with the given options. */
function renderHook(
  props: Parameters<typeof useGeoJsonLayer<PlainFeature>>[0],
) {
  function HookRunner() {
    useGeoJsonLayer<PlainFeature>(props);
    return null;
  }
  return render(<HookRunner />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useGeoJsonLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeViewer.isDestroyed.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // -------------------------------------------------------------------------
  // 1. idle status when bbox is null
  // -------------------------------------------------------------------------
  it('sets idle status immediately when bbox is null', () => {
    renderHook({
      layerId: 'buildings',
      bbox: null,
      selectionPolygon: null,
      fetcher: vi.fn(),
      applyCap: (features) => ({ kept: features, dropped: 0 }),
      renderFeature: vi.fn(() => null),
    });

    expect(mockSetLayerStatus).toHaveBeenCalledWith('buildings', { status: 'idle' });
  });

  // -------------------------------------------------------------------------
  // 2. idle → loading → ready transitions
  // -------------------------------------------------------------------------
  it('transitions idle → loading → ready on a successful fetch', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ONE_FC);
    const renderFeature = vi.fn(() => fakeEntity);

    await act(async () => {
      renderHook({
        layerId: 'buildings',
        bbox: TEST_BBOX,
        selectionPolygon: null,
        fetcher,
        applyCap: (features) => ({ kept: features, dropped: 0 }),
        renderFeature,
      });
    });

    const calls = mockSetLayerStatus.mock.calls;
    // First call: loading
    expect(calls[0]).toEqual(['buildings', { status: 'loading' }]);
    // Last call: ready
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe('buildings');
    expect((lastCall[1] as { status: string }).status).toBe('ready');
  });

  // -------------------------------------------------------------------------
  // 3. renderFeature is called once per kept feature
  // -------------------------------------------------------------------------
  it('calls renderFeature once per kept feature', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ONE_FC);
    const renderFeature = vi.fn(() => fakeEntity);

    await act(async () => {
      renderHook({
        layerId: 'buildings',
        bbox: TEST_BBOX,
        selectionPolygon: null,
        fetcher,
        applyCap: (features) => ({ kept: features, dropped: 0 }),
        renderFeature,
      });
    });

    // ONE_FC has one feature, so renderFeature should be called exactly once.
    expect(renderFeature).toHaveBeenCalledTimes(1);
    // The feature argument should be the GeoJSON feature.
    expect(renderFeature.mock.calls[0]![0]).toMatchObject({ type: 'Feature' });
  });

  // -------------------------------------------------------------------------
  // 4. Cleanup removes owned entities when bbox changes
  // -------------------------------------------------------------------------
  it('removes owned entities from viewer when bbox changes (cleanup)', async () => {
    let resolveFirst!: (fc: GeoJSON.FeatureCollection<GeoJSON.Point>) => void;
    const firstFetch = new Promise<GeoJSON.FeatureCollection<GeoJSON.Point>>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );

    const fetcher = vi.fn().mockReturnValueOnce(firstFetch).mockResolvedValueOnce(EMPTY_FC);
    const renderFeature = vi.fn(() => fakeEntity);

    const { rerender } = render(
      <Wrapper
        bbox={TEST_BBOX}
        fetcher={fetcher}
        renderFeature={renderFeature}
      />,
    );

    // Resolve the first fetch AFTER the bbox has already changed.
    await act(async () => {
      // Change bbox → triggers cleanup of previous effect.
      rerender(
        <Wrapper
          bbox={TEST_BBOX_2}
          fetcher={fetcher}
          renderFeature={renderFeature}
        />,
      );
      resolveFirst(ONE_FC); // Resolve the first fetch now (it's already cancelled).
    });

    // Cleanup should have been called — entities.remove invoked for tracked entities.
    expect(fakeViewer.entities.remove).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. AbortController fires when bbox changes mid-fetch
  // -------------------------------------------------------------------------
  it('aborts the in-flight request when bbox changes', async () => {
    let capturedSignal: AbortSignal | null = null;

    const neverResolves = new Promise<GeoJSON.FeatureCollection<GeoJSON.Point>>(
      () => {/* never resolves */},
    );
    const fetcher = vi.fn().mockImplementationOnce(
      (_bbox: BoundingBox, signal: AbortSignal) => {
        capturedSignal = signal;
        return neverResolves;
      },
    ).mockResolvedValueOnce(EMPTY_FC);

    const { rerender } = render(
      <Wrapper bbox={TEST_BBOX} fetcher={fetcher} renderFeature={vi.fn(() => null)} />,
    );

    // Signal should exist and NOT be aborted yet.
    expect(capturedSignal).not.toBeNull();
    expect((capturedSignal as unknown as AbortSignal).aborted).toBe(false);

    await act(async () => {
      // Changing the bbox triggers cleanup which calls ac.abort().
      rerender(
        <Wrapper bbox={TEST_BBOX_2} fetcher={fetcher} renderFeature={vi.fn(() => null)} />,
      );
    });

    // Signal must now be aborted.
    expect((capturedSignal as unknown as AbortSignal).aborted).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. Error status from a rejected fetcher
  // -------------------------------------------------------------------------
  it('surfaces an error status when the fetcher rejects', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('network failure'));

    await act(async () => {
      renderHook({
        layerId: 'buildings',
        bbox: TEST_BBOX,
        selectionPolygon: null,
        fetcher,
        applyCap: (features) => ({ kept: features, dropped: 0 }),
        renderFeature: vi.fn(() => null),
      });
    });

    const errorCall = mockSetLayerStatus.mock.calls.find(
      ([, s]) => (s as { status: string }).status === 'error',
    );
    expect(errorCall).toBeDefined();
    expect((errorCall![1] as { status: string; message: string }).message).toBe(
      'network failure',
    );
  });

  // -------------------------------------------------------------------------
  // 7. errorToMessage customisation
  // -------------------------------------------------------------------------
  it('uses the custom errorToMessage when provided', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce({ userMessage: 'Too dense' });

    await act(async () => {
      renderHook({
        layerId: 'buildings',
        bbox: TEST_BBOX,
        selectionPolygon: null,
        fetcher,
        applyCap: (features) => ({ kept: features, dropped: 0 }),
        renderFeature: vi.fn(() => null),
        errorToMessage: (err) => {
          const e = err as { userMessage?: string };
          return e.userMessage ?? 'Unknown';
        },
      });
    });

    const errorCall = mockSetLayerStatus.mock.calls.find(
      ([, s]) => (s as { status: string }).status === 'error',
    );
    expect((errorCall![1] as { message: string }).message).toBe('Too dense');
  });
});

// ---------------------------------------------------------------------------
// Helper component used by tests that need rerender
// ---------------------------------------------------------------------------
function Wrapper({
  bbox,
  fetcher,
  renderFeature,
}: {
  bbox: BoundingBox | null;
  fetcher: (bbox: BoundingBox, signal: AbortSignal) => Promise<GeoJSON.FeatureCollection<GeoJSON.Point>>;
  renderFeature: (feature: PlainFeature, viewer: Viewer) => Entity | null;
}) {
  useGeoJsonLayer<PlainFeature>({
    layerId: 'buildings',
    bbox,
    selectionPolygon: null,
    fetcher,
    applyCap: (features) => ({ kept: features, dropped: 0 }),
    renderFeature,
  });
  return null;
}
