/**
 * AreaVolumeLayer — Resium component (returns null) that renders the
 * polygon-pick visualisation on the Cesium scene and runs the terrain
 * sample / volume computation when the polygon is finalized.
 *
 * Two effects:
 *
 *   A. *Geometry effect* — keyed on `activeTool`, polygon vertices, and
 *      `finalized`. Adds:
 *        - a green polyline tracing the in-progress vertex chain (always),
 *        - a translucent green fill polygon (only when `finalized === true`).
 *      Cleanup removes the entities on every re-run, so changes (added
 *      vertex, finalize, tool exit) leave no stale primitives.
 *
 *   B. *Compute effect* — keyed on `activeTool`, polygon, `finalized`. When
 *      the polygon transitions to finalized:
 *        1. setStatus('computing'),
 *        2. await sampleHeightsInsidePolygon(viewer, polygon, …),
 *        3. setSamples(samples) + setStatus('ready').
 *      Race-safe: AbortController + cancelled flag aborted on cleanup; if
 *      the user un-finalizes (rare — only via tool exit / Esc), the cleanup
 *      drops any in-flight sample.
 *
 * Reference-mode changes do NOT trigger a re-sample; the panel re-derives
 * cut/fill from the cached heights.
 *
 * The component is mounted unconditionally inside `<Viewer>` (matching the
 * SlopeAspectLayer pattern); the effects early-return when the tool is
 * inactive and clean up any prior entities.
 */
import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useAppStore } from '../../store/useAppStore.js';
import { sampleHeightsInsidePolygon } from './sampleInsidePolygon.js';

const POLY_GREEN = Cesium.Color.fromCssColorString('#22C55E'); // green-500
const FILL_GREEN = POLY_GREEN.withAlpha(0.3);

/** Resolution of the in-polygon sample grid, in metres per cell. */
export const AREA_VOLUME_RESOLUTION_M = 30;

export default function AreaVolumeLayer() {
  const { viewer } = useCesium();
  const activeTool = useAppStore((s) => s.activeTool);
  const polygon = useAppStore((s) => s.areaVolume.polygon);
  const finalized = useAppStore((s) => s.areaVolume.finalized);
  const setSamples = useAppStore((s) => s.setAreaVolumeSamples);
  const setStatus = useAppStore((s) => s.setAreaVolumeStatus);

  const polylineRef = useRef<Cesium.Entity | null>(null);
  const fillRef = useRef<Cesium.Entity | null>(null);

  // ---------------- Effect A: scene geometry --------------------------------
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const removeEntities = () => {
      if (polylineRef.current) {
        try {
          viewer.entities.remove(polylineRef.current);
        } catch {
          /* viewer torn down */
        }
        polylineRef.current = null;
      }
      if (fillRef.current) {
        try {
          viewer.entities.remove(fillRef.current);
        } catch {
          /* viewer torn down */
        }
        fillRef.current = null;
      }
    };

    removeEntities();

    if (activeTool !== 'area-volume' || polygon.length === 0) {
      return removeEntities;
    }

    // Polyline: trace the picked vertices. When finalized, close the ring.
    const lineCoords: number[] = [];
    for (const p of polygon) {
      lineCoords.push(p.lng, p.lat);
    }
    if (finalized && polygon.length >= 3) {
      const first = polygon[0]!;
      lineCoords.push(first.lng, first.lat);
    }

    if (lineCoords.length >= 4) {
      polylineRef.current = viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(lineCoords),
          width: 2,
          material: POLY_GREEN,
          clampToGround: true,
        },
      });
    }

    if (finalized && polygon.length >= 3) {
      fillRef.current = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray(
              polygon.flatMap((p) => [p.lng, p.lat]),
            ),
          ),
          material: FILL_GREEN,
          // No outline (the polyline above provides the edge).
          outline: false,
        },
      });
    }

    return removeEntities;
  }, [viewer, activeTool, polygon, finalized]);

  // ---------------- Effect B: compute on finalize ---------------------------
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    if (activeTool !== 'area-volume') return;
    if (!finalized || polygon.length < 3) return;

    let cancelled = false;
    const ac = new AbortController();
    setStatus('computing');

    (async () => {
      try {
        const samples = await sampleHeightsInsidePolygon(
          viewer,
          polygon,
          AREA_VOLUME_RESOLUTION_M,
          ac.signal,
        );
        if (cancelled) return;
        setSamples(samples);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (
          err instanceof DOMException &&
          (err.name === 'AbortError' || err.code === DOMException.ABORT_ERR)
        ) {
          return;
        }
        setStatus('error', err instanceof Error ? err.message : 'Computation failed');
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [viewer, activeTool, polygon, finalized, setSamples, setStatus]);

  return null;
}
