/**
 * SurfaceDrapeLayer — swaps the Cesium viewer's BASE imagery layer (index 0)
 * when the active `surfaceDrape` mode changes.
 *
 * ## How it works
 *
 * On mount and on every `surfaceDrape` change:
 *   1. Read the current base layer (`imageryLayers.get(0)`).
 *   2. Add the new ImageryLayer at index 0 (so it becomes the new base).
 *   3. Remove the old base layer.
 *
 * Steps 2 → 3 are deliberately ordered so that any *overlay* layers added by
 * other components (e.g. SlopeAspectLayer at index 1+) keep their relative
 * z-order and are never clobbered. The previous implementation called
 * `removeAll()` and would silently delete those overlays.
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

    // Swap the base layer in place. Read the OLD base first, add the NEW
    // one at index 0, then remove the old. Any overlay layers added at
    // higher indices by other components (slope/aspect, future viewshed)
    // are left untouched and just shift up by one index — which Cesium's
    // ImageryLayerCollection handles transparently.
    const oldBase = viewer.imageryLayers.length > 0
      ? viewer.imageryLayers.get(0)
      : undefined;
    const layer = createImageryLayer(surfaceDrape);
    viewer.imageryLayers.add(layer, 0);
    if (oldBase) {
      viewer.imageryLayers.remove(oldBase);
    }
  }, [viewer, surfaceDrape]);

  return null;
}
