/**
 * ViewshedLayer — Resium component (returns null) that drives the sampled-ray
 * line-of-sight viewshed (Phase D4).
 *
 * Two effects, both keyed on `activeTool`, observer, eyeHeight, maxRange:
 *
 *   A. *Compute effect* — when the tool is active and an observer is set,
 *      computes the bbox (a square `2 * maxRangeM` per side centred on the
 *      observer), samples terrain heights via `sampleHeightGrid`, runs
 *      `computeViewshedGrid`, paints a canvas via `renderViewshedCanvas`,
 *      and adds the result as a `Cesium.SingleTileImageryProvider` overlay
 *      ABOVE the surface drape (index ≥ 1).
 *
 *      Race-safe: cancelled flag + AbortController. If the effect re-fires
 *      (observer change, knob change, tool exit), the in-flight sample is
 *      aborted before it reaches Cesium.
 *
 *   B. *Observer marker effect* — keyed on `activeTool` + `observer`. Adds
 *      a small yellow point Entity at the observer position so the user sees
 *      where they clicked. Removed on tool exit / observer change / unmount.
 *
 * Cleanup runs on every effect re-run, so the imagery layer + observer point
 * are always removed before being re-added.
 *
 * Implementation note (timeboxed fallback):
 *   The plan flagged a GPU shadow-map technique as the preferred approach.
 *   It was timeboxed; this is the documented sampled-ray fallback. See
 *   `viewshedMath.ts` for the algorithm details and trade-offs.
 *
 * Mounted unconditionally inside `<Viewer>` (matches D2/D3 layers).
 */
import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { gridSize, METRES_PER_DEG_LAT, type BoundingBox } from '@terrain/shared';
import { useAppStore } from '../../store/useAppStore.js';
import { sampleHeightGrid } from '../slopeAspect/sampleGrid.js';
import { computeViewshedGrid } from './viewshedMath.js';
import { renderViewshedCanvas } from './renderViewshedCanvas.js';

/** Target resolution per cell, in metres. */
export const VIEWSHED_RESOLUTION_M = 30;

/**
 * Build a square bbox of side `2 * maxRangeM` centred on `observer`.
 * Uses the same metres-per-degree conventions as gridSize / sampleHeightGrid.
 */
function bboxAroundObserver(
  observer: { lng: number; lat: number },
  maxRangeM: number,
): BoundingBox {
  const cosLat = Math.cos((observer.lat * Math.PI) / 180);
  const dLat = maxRangeM / METRES_PER_DEG_LAT;
  const dLng = maxRangeM / (METRES_PER_DEG_LAT * Math.max(cosLat, 1e-6));
  return {
    west: observer.lng - dLng,
    east: observer.lng + dLng,
    south: observer.lat - dLat,
    north: observer.lat + dLat,
  };
}

export default function ViewshedLayer() {
  const { viewer } = useCesium();
  const activeTool = useAppStore((s) => s.activeTool);
  const observer = useAppStore((s) => s.viewshed.observer);
  const eyeHeightM = useAppStore((s) => s.viewshed.observerEyeHeightM);
  const maxRangeM = useAppStore((s) => s.viewshed.maxRangeM);
  const setStatus = useAppStore((s) => s.setViewshedStatus);
  const setResult = useAppStore((s) => s.setViewshedResult);
  const reducedScene = useAppStore((s) => s.reducedScene);

  const overlayRef = useRef<Cesium.ImageryLayer | null>(null);
  const observerEntityRef = useRef<Cesium.Entity | null>(null);

  // -------- Effect A: compute + overlay ------------------------------------
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const removeOverlay = () => {
      const layer = overlayRef.current;
      if (!layer) return;
      try {
        viewer.imageryLayers.remove(layer);
      } catch {
        // viewer torn down
      }
      overlayRef.current = null;
    };
    removeOverlay();

    // When reduced-scene mode is ON skip the viewshed computation — it
    // samples a dense terrain grid and is too expensive on mobile.
    if (activeTool !== 'viewshed' || !observer || reducedScene) {
      return;
    }

    const ac = new AbortController();
    let cancelled = false;

    const bbox = bboxAroundObserver(observer, maxRangeM);
    const { cols, rows } = gridSize(bbox, VIEWSHED_RESOLUTION_M);
    setStatus('computing');

    (async () => {
      try {
        const heights = await sampleHeightGrid(
          viewer.terrainProvider,
          bbox,
          cols,
          rows,
          ac.signal,
        );
        if (cancelled) return;

        const cells = computeViewshedGrid(
          { heights, cols, rows, bbox },
          observer,
          eyeHeightM,
          maxRangeM,
        );
        if (cancelled) return;

        const canvas = renderViewshedCanvas(cells, cols, rows);
        if (cancelled) return;

        const dataUrl = canvas.toDataURL('image/png');
        if (cancelled) return;

        // Cesium engine ≥24 requires the synchronous SingleTileImageryProvider
        // constructor to be given explicit tile dimensions — it no longer
        // derives them from the loaded image. The canvas is already sized
        // cols×rows, so use those directly.
        const provider = new Cesium.SingleTileImageryProvider({
          url: dataUrl,
          tileWidth: canvas.width,
          tileHeight: canvas.height,
          rectangle: Cesium.Rectangle.fromDegrees(
            bbox.west,
            bbox.south,
            bbox.east,
            bbox.north,
          ),
          credit: new Cesium.Credit('Viewshed (sampled-ray LOS)'),
        });

        if (cancelled || viewer.isDestroyed()) return;

        const layer = Cesium.ImageryLayer.fromProviderAsync(
          Promise.resolve(provider),
          {},
        );
        viewer.imageryLayers.add(layer);
        overlayRef.current = layer;

        setResult({ cells, gridDims: { cols, rows, bbox } });
      } catch (err) {
        if (cancelled) return;
        if (
          err instanceof DOMException &&
          (err.name === 'AbortError' || err.code === DOMException.ABORT_ERR)
        ) {
          return;
        }
        setStatus('error', err instanceof Error ? err.message : 'Viewshed failed');
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      removeOverlay();
    };
  }, [viewer, activeTool, observer, eyeHeightM, maxRangeM, setStatus, setResult, reducedScene]);

  // -------- Effect B: observer marker --------------------------------------
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const removeMarker = () => {
      const e = observerEntityRef.current;
      if (!e) return;
      try {
        viewer.entities.remove(e);
      } catch {
        // viewer torn down
      }
      observerEntityRef.current = null;
    };
    removeMarker();

    if (activeTool !== 'viewshed' || !observer) {
      return;
    }

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        observer.lng,
        observer.lat,
        observer.height,
      ),
      point: {
        pixelSize: 8,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        // Render the marker even when the camera is far below or above terrain.
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    observerEntityRef.current = entity;

    return removeMarker;
  }, [viewer, activeTool, observer]);

  return null;
}
