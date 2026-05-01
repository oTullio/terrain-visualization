/**
 * AttributionOverlay — permanent credit string shown at the bottom-right of
 * the Cesium viewport.
 *
 * Always visible while the Cesium scene is rendering. Shows:
 *   - Imagery credit for the active drape mode (from IMAGERY_ATTRIBUTIONS)
 *   - OSM data credit (buildings / water / roads always come from OSM)
 *   - Terrain credit (Cesium World Terrain)
 *
 * NOTE: Cesium's built-in credit container is NOT disabled — it continues
 * to surface per-tile attributions (e.g. tile-server credits) in the
 * bottom-left corner. This overlay adds the data-source level credits that
 * belong at a UI layer, not inside Cesium's internal credit system.
 *
 * Positioning: absolute bottom-1 right-1 so it doesn't visually fight
 * Cesium's bottom-left credit overlay.
 */
import { useAppStore } from '../store/useAppStore.js';
import { IMAGERY_ATTRIBUTIONS } from '../terrain/imageryProviders.js';

const OSM_CREDIT = '© OpenStreetMap contributors';
const TERRAIN_CREDIT = '© Cesium';

export default function AttributionOverlay() {
  const surfaceDrape = useAppStore((s) => s.surfaceDrape);

  const imageryCredit = IMAGERY_ATTRIBUTIONS[surfaceDrape];

  const text = `Imagery: ${imageryCredit} · Data: ${OSM_CREDIT} · Terrain: ${TERRAIN_CREDIT}`;

  return (
    <div
      aria-label="Map data attributions"
      className={[
        'absolute bottom-1 right-1 z-20',
        'px-1.5 py-0.5 rounded',
        'bg-black/50',
        'text-[10px] text-white leading-tight',
        'max-w-[min(480px,90vw)]',
        'line-clamp-2',
        'pointer-events-none select-none',
      ].join(' ')}
    >
      {text}
    </div>
  );
}
