/**
 * useGeoJsonLayer — generic hook for fetching, clipping, capping, and
 * rendering a GeoJSON FeatureCollection as Cesium entities.
 *
 * Encapsulates the boilerplate shared by every data layer (buildings, water,
 * roads, …):
 *   - Owned-entity Set ref + clearOwnedEntities
 *   - AbortController + cancellation flag
 *   - Fetch → clip → cap → render lifecycle
 *   - Per-feature render loop with isDestroyed() guard
 *   - One-shot camera flyTo per new bbox
 *   - layerStatus updates via the Zustand store
 *
 * The consumer only needs to supply layer-specific functions:
 *   - fetcher  — calls the API
 *   - clip     — optional centroid/polygon clip (default: identity or clipFeaturesToPolygon)
 *   - applyCap — LOD cap, returns { kept, dropped }
 *   - renderFeature — turns one feature into one Cesium Entity (or null to skip)
 */
import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import type GeoJSON from 'geojson';
import type { BoundingBox } from '@terrain/shared';
import { useAppStore, type LayerId } from '../store/useAppStore.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LayerStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; total: number; kept: number; dropped: number }
  | { kind: 'error'; message: string };

export interface UseGeoJsonLayerOptions<F extends GeoJSON.Feature> {
  layerId: LayerId;
  bbox: BoundingBox | null;
  selectionPolygon: GeoJSON.Polygon | null;
  /** Called inside the effect with an AbortSignal. */
  fetcher: (
    bbox: BoundingBox,
    signal: AbortSignal,
  ) => Promise<GeoJSON.FeatureCollection<F['geometry']>>;
  /** Optional clip step. Default: identity (pass-through). */
  clip?: (
    fc: GeoJSON.FeatureCollection<F['geometry']>,
    polygon: GeoJSON.Polygon | null,
  ) => GeoJSON.FeatureCollection<F['geometry']>;
  /** LOD cap stage. Returns { kept, dropped }. */
  applyCap: (features: F[]) => { kept: F[]; dropped: number };
  /** Renders ONE feature → ONE Entity (or returns null to skip). */
  renderFeature: (feature: F, viewer: Cesium.Viewer) => Cesium.Entity | null;
  /** Whether to fly camera to the bbox once per new selection (default true). */
  flyToOnSelection?: boolean;
  /** How to extract the user-facing error string from a thrown error. */
  errorToMessage?: (err: unknown) => string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function bboxesEqual(a: BoundingBox | null, b: BoundingBox | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.west === b.west && a.south === b.south && a.east === b.east && a.north === b.north
  );
}

function defaultErrorToMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e['userMessage'] === 'string') return e['userMessage'];
    if (typeof e['message'] === 'string') return e['message'];
  }
  return 'Unknown error';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGeoJsonLayer<F extends GeoJSON.Feature>(
  options: UseGeoJsonLayerOptions<F>,
): void {
  const {
    layerId,
    bbox,
    selectionPolygon,
    fetcher,
    clip,
    applyCap,
    renderFeature,
    flyToOnSelection = true,
    errorToMessage = defaultErrorToMessage,
  } = options;

  const { viewer } = useCesium();
  const setLayerStatus = useAppStore((s) => s.setLayerStatus);

  // Entities this layer has added (so we can clean up exactly what we own).
  const ownedEntities = useRef<Set<Cesium.Entity>>(new Set());

  // Last bbox we flew the camera to (so flyTo is one-shot per selection).
  const lastFlownBbox = useRef<BoundingBox | null>(null);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Always clear any previously rendered entities first.
    const clearOwnedEntities = () => {
      for (const e of ownedEntities.current) {
        try {
          viewer.entities.remove(e);
        } catch {
          // viewer may be tearing down — swallow
        }
      }
      ownedEntities.current.clear();
    };

    clearOwnedEntities();

    if (!bbox) {
      setLayerStatus(layerId, { status: 'idle' });
      lastFlownBbox.current = null;
      return;
    }

    const ac = new AbortController();
    let cancelled = false;
    setLayerStatus(layerId, { status: 'loading' });

    (async () => {
      try {
        const fc = await fetcher(bbox, ac.signal);
        if (cancelled) return;

        const total = fc.features.length;

        // Clip step (optional — identity pass-through if not supplied).
        const clipped = clip ? clip(fc, selectionPolygon) : fc;

        const { kept, dropped } = applyCap(clipped.features as F[]);

        if (cancelled || !viewer || viewer.isDestroyed()) return;

        for (const feature of kept) {
          const entity = renderFeature(feature, viewer);
          if (entity) {
            ownedEntities.current.add(entity);
          }
        }

        setLayerStatus(layerId, {
          status: 'ready',
          total,
          kept: kept.length,
          dropped,
        });

        // Camera fly-to once per NEW bbox.
        if (flyToOnSelection && !bboxesEqual(lastFlownBbox.current, bbox)) {
          lastFlownBbox.current = bbox;
          try {
            viewer.camera.flyTo({
              destination: Cesium.Rectangle.fromDegrees(
                bbox.west,
                bbox.south,
                bbox.east,
                bbox.north,
              ),
            });
          } catch {
            // ignore flyTo failures during teardown
          }
        }
      } catch (err) {
        if (cancelled) return;
        // AbortError is normal cancellation, not an error.
        if (
          err instanceof DOMException &&
          (err.name === 'AbortError' || err.code === DOMException.ABORT_ERR)
        ) {
          return;
        }
        setLayerStatus(layerId, {
          status: 'error',
          message: errorToMessage(err),
        });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      clearOwnedEntities();
    };
  }, [
    viewer,
    bbox,
    selectionPolygon,
    layerId,
    setLayerStatus,
    fetcher,
    clip,
    applyCap,
    renderFeature,
    flyToOnSelection,
    errorToMessage,
  ]);
}
