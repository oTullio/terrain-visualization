/**
 * SurfaceDrapeLayer — swaps the Cesium viewer's base imagery layer when the
 * active `surfaceDrape` mode changes.
 *
 * ## How it works
 *
 * On mount and on every `surfaceDrape` change:
 *   1. Clear all existing imagery layers (`imageryLayers.removeAll()`).
 *   2. Create a new ImageryLayer via `createImageryLayer(mode)`.
 *   3. Add it as the sole imagery layer (`imageryLayers.add(layer)`).
 *
 * Cesium's `ImageryLayer.fromProviderAsync` wraps the async provider Promises
 * so the layer can be added to the collection before the tiles load — Cesium
 * renders tiles as they arrive.
 *
 * ## Constraints
 *
 * - Must be mounted INSIDE a Resium `<Viewer>` so that `useCesium()` returns
 *   a valid viewer instance.
 * - On unmount we do nothing destructive — Cesium's own `Viewer.destroy()`
 *   handles cleanup.
 * - This component renders no DOM; it returns null.
 */
import { useEffect } from 'react';
import { useCesium } from 'resium';
import { useAppStore } from '../store/useAppStore.js';
import { createImageryLayer } from './imageryProviders.js';

export default function SurfaceDrapeLayer() {
  const { viewer } = useCesium();
  const surfaceDrape = useAppStore((s) => s.surfaceDrape);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Remove all existing imagery layers and add the new one.
    viewer.imageryLayers.removeAll();
    const layer = createImageryLayer(surfaceDrape);
    viewer.imageryLayers.add(layer);
  }, [viewer, surfaceDrape]);

  return null;
}
