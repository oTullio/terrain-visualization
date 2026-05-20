/**
 * SlopeAspectLayer — Resium component (returns null) that drapes the
 * slope/aspect raster overlay onto the Cesium globe as a SingleTileImagery
 * layer above the base satellite/hillshade/topographic drape.
 *
 * Lifecycle (managed by one effect, keyed on `activeTool`, `bbox`, `mode`):
 *
 *   1. Compute grid dimensions at SLOPE_ASPECT_RESOLUTION_M (30 m by default,
 *      capped at 256x256 — see GRID_MAX_DIM in @terrain/shared).
 *   2. Sample the terrain heights via `sampleHeightGrid` with an AbortSignal.
 *   3. Run `computeSlopeAspect` (Horn's method) to produce slope and aspect
 *      Float32Arrays.
 *   4. Paint a canvas via `renderSlopeCanvas`, convert to a data-URL, and
 *      wrap it in a `Cesium.SingleTileImageryProvider` with the bbox as the
 *      Rectangle.
 *   5. Add the resulting ImageryLayer to the imagery collection (NOT at
 *      index 0 — the base drape stays at index 0; this overlay sits on top).
 *
 * Cleanup (effect-return):
 *   - aborts the in-flight terrain sample (cancelled flag + AbortController),
 *   - removes the ImageryLayer from the collection if it was added.
 *
 * The overlay is removed on:
 *   - tool deactivate (activeTool !== 'slope-aspect'),
 *   - bbox change (handled by effect re-run),
 *   - mode change (rerender; cleanup removes old overlay),
 *   - unmount.
 *
 * Race safety: uses the same `cancelled` flag pattern as `useGeoJsonLayer`.
 * If the effect re-fires before sampleHeightGrid resolves, the stale path
 * sees `cancelled === true` and returns without touching imagery.
 */
import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { gridSize } from '@terrain/shared';
import { useAppStore } from '../../store/useAppStore.js';
import { sampleHeightGrid } from './sampleGrid.js';
import { computeSlopeAspect } from './computeSlopeAspect.js';
import { renderSlopeCanvas } from './renderToCanvas.js';
import { METRES_PER_DEG_LAT } from '@terrain/shared';

/** Target resolution per cell, in metres. Capped indirectly by GRID_MAX_DIM. */
export const SLOPE_ASPECT_RESOLUTION_M = 30;

export default function SlopeAspectLayer() {
  const { viewer } = useCesium();
  const activeTool = useAppStore((s) => s.activeTool);
  const bbox = useAppStore((s) => s.bbox);
  const mode = useAppStore((s) => s.slopeAspect.mode);
  const setSlopeAspectStatus = useAppStore((s) => s.setSlopeAspectStatus);
  const reducedScene = useAppStore((s) => s.reducedScene);

  // Track the imagery layer we've added so we can remove exactly that one.
  const overlayRef = useRef<Cesium.ImageryLayer | null>(null);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Always clear any previously-added overlay first.
    const removeOverlay = () => {
      const layer = overlayRef.current;
      if (!layer) return;
      try {
        viewer.imageryLayers.remove(layer);
      } catch {
        // Viewer is tearing down — fine.
      }
      overlayRef.current = null;
    };
    removeOverlay();

    // When reduced-scene mode is ON skip this overlay (it requires sampling the
    // full terrain grid — expensive on mobile).
    if (activeTool !== 'slope-aspect' || !bbox || reducedScene) {
      setSlopeAspectStatus({ status: 'idle' });
      return;
    }

    const ac = new AbortController();
    let cancelled = false;

    const { cols, rows } = gridSize(bbox, SLOPE_ASPECT_RESOLUTION_M);
    setSlopeAspectStatus({ status: 'loading', cols, rows });

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

        // Cell size in metres for the slope filter.
        const midLat = (bbox.north + bbox.south) / 2;
        const cosLat = Math.cos((midLat * Math.PI) / 180);
        const cellSizeMx =
          ((bbox.east - bbox.west) * METRES_PER_DEG_LAT * Math.max(cosLat, 0)) / cols;
        const cellSizeMy = ((bbox.north - bbox.south) * METRES_PER_DEG_LAT) / rows;

        const { slope, aspect } = computeSlopeAspect(
          heights,
          cols,
          rows,
          cellSizeMx,
          cellSizeMy,
        );
        if (cancelled) return;

        const canvas = renderSlopeCanvas(
          mode === 'aspect' ? aspect : slope,
          cols,
          rows,
          { mode },
        );
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
          credit: new Cesium.Credit('Slope from Cesium World Terrain'),
        });

        if (cancelled || viewer.isDestroyed()) return;

        const layer = Cesium.ImageryLayer.fromProviderAsync(
          Promise.resolve(provider),
          {},
        );
        viewer.imageryLayers.add(layer);
        overlayRef.current = layer;

        setSlopeAspectStatus({
          status: 'ready',
          cols,
          rows,
          resolutionM: SLOPE_ASPECT_RESOLUTION_M,
        });
      } catch (err) {
        if (cancelled) return;
        if (
          err instanceof DOMException &&
          (err.name === 'AbortError' || err.code === DOMException.ABORT_ERR)
        ) {
          return;
        }
        setSlopeAspectStatus({
          status: 'error',
          message: err instanceof Error ? err.message : 'Slope/aspect failed',
        });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      removeOverlay();
    };
  }, [viewer, activeTool, bbox, mode, setSlopeAspectStatus, reducedScene]);

  return null;
}
