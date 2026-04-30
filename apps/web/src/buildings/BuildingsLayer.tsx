/**
 * BuildingsLayer — fetches OSM buildings for the active selection and
 * renders them as extruded prisms in the parent `<Viewer>` Cesium scene.
 *
 * Lifecycle:
 *   1. Subscribes to `bbox` + `selectionPolygon` from the Zustand store.
 *   2. On bbox change: aborts any in-flight request, calls fetchBuildings,
 *      applies clipToPolygon (no-op when polygon is null), applies the
 *      LOD cap, and renders one Entity per surviving feature.
 *   3. Tracks the entities it added in a Set ref so they can be removed
 *      on the next bbox/polygon change OR on unmount.
 *   4. After the first batch of entities for a NEW bbox lands, flies the
 *      camera to the bbox rectangle.
 *
 * v1 simplification: only the first polygon of a MultiPolygon is rendered,
 * and only its outer ring. Holes (courtyards) are deferred per the brief.
 */
import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';
import type { BoundingBox } from '@terrain/shared';
import { useAppStore } from '../store/useAppStore.js';
import { fetchBuildings, BuildingsApiError } from '../api/buildingsClient.js';
import { clipFeaturesToPolygon } from './clipToPolygon.js';
import { applyLodCap } from './applyLodCap.js';
import { buildingHeight } from './buildingHeight.js';
import { DEFAULT_LOD_CAP } from './config.js';

const BUILDING_COLOR = Cesium.Color.fromCssColorString('#cccccc');

/** Extract the outer ring of the (first, for MultiPolygon) polygon as flat lng/lat numbers. */
function outerRingFlat(feature: Feature<Polygon | MultiPolygon>): number[] | null {
  const geom = feature.geometry;
  let ring: Position[] | undefined;
  if (geom.type === 'Polygon') {
    ring = geom.coordinates[0];
  } else {
    // MultiPolygon → first polygon's outer ring (v1 — see file-level comment)
    ring = geom.coordinates[0]?.[0];
  }
  if (!ring || ring.length < 4) return null;
  const flat: number[] = [];
  for (const [lng, lat] of ring) {
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    flat.push(lng, lat);
  }
  return flat;
}

function bboxesEqual(a: BoundingBox | null, b: BoundingBox | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.west === b.west && a.south === b.south && a.east === b.east && a.north === b.north
  );
}

export default function BuildingsLayer() {
  const { viewer } = useCesium();
  const bbox = useAppStore((s) => s.bbox);
  const selectionPolygon = useAppStore((s) => s.selectionPolygon);
  const setBuildingsLoading = useAppStore((s) => s.setBuildingsLoading);
  const setBuildingsReady = useAppStore((s) => s.setBuildingsReady);
  const setBuildingsError = useAppStore((s) => s.setBuildingsError);
  const clearBuildingsStatus = useAppStore((s) => s.clearBuildingsStatus);

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
      clearBuildingsStatus();
      lastFlownBbox.current = null;
      return;
    }

    const ac = new AbortController();
    let cancelled = false;
    setBuildingsLoading();

    (async () => {
      try {
        const fc = await fetchBuildings(bbox, { signal: ac.signal });
        if (cancelled) return;
        const total = fc.features.length;

        const clipped = clipFeaturesToPolygon(fc, selectionPolygon);
        const { kept, dropped } = applyLodCap(clipped.features, {
          maxFeatures: DEFAULT_LOD_CAP,
          rankBy: 'area',
        });

        if (cancelled || !viewer || viewer.isDestroyed()) return;

        for (const feature of kept) {
          const flat = outerRingFlat(feature);
          if (!flat) continue;
          const { height, baseHeight } = buildingHeight(feature);
          const positions = Cesium.Cartesian3.fromDegreesArray(flat);
          const entity = viewer.entities.add({
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(positions),
              height: baseHeight,
              extrudedHeight: height,
              material: BUILDING_COLOR,
              outline: false,
            },
          });
          ownedEntities.current.add(entity);
        }

        setBuildingsReady({ total, kept: kept.length, dropped });

        // Camera fly-to once per NEW bbox.
        if (!bboxesEqual(lastFlownBbox.current, bbox)) {
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
        if (err instanceof BuildingsApiError) {
          setBuildingsError(err.userMessage);
        } else {
          setBuildingsError("Couldn't load buildings — please try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      // On bbox/polygon change OR unmount, clean up entities we added.
      clearOwnedEntities();
    };
  }, [
    viewer,
    bbox,
    selectionPolygon,
    setBuildingsLoading,
    setBuildingsReady,
    setBuildingsError,
    clearBuildingsStatus,
  ]);

  return null;
}
