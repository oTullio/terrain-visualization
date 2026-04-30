/**
 * WaterLayer — fetches OSM water features for the active selection and
 * renders them as translucent blue polygons and polylines in the parent
 * `<Viewer>` Cesium scene.
 *
 * Lifecycle is handled by the generic `useGeoJsonLayer` hook. This component
 * only supplies the water-specific functions:
 *   - fetcher         → fetchWater
 *   - applyCap        → identity (no LOD cap; water features are typically far
 *                       fewer than buildings, and visual quality requires showing
 *                       all of them — a river shouldn't disappear mid-viewport)
 *   - renderFeature   → translucent polygon for area water; clamped polyline for
 *                       linear waterways
 *
 * flyToOnSelection is false: the camera is already flown by BuildingsLayer,
 * and a second flyTo from WaterLayer (which may resolve slightly later due to
 * async fetch ordering) would cause a jarring double-pan.
 *
 * v1 simplification: only the first polygon of a MultiPolygon is rendered.
 * MultiLineString is not emitted by the backend simplifier at v1, but the
 * renderer handles it gracefully (takes the first member linestring).
 */
import * as Cesium from 'cesium';
import type { Feature, Polygon, MultiPolygon, LineString, MultiLineString, Position } from 'geojson';
import { useAppStore } from '../store/useAppStore.js';
import { fetchWater } from '../api/waterClient.js';
import { LayerApiError } from '../api/layerApiError.js';
import { useGeoJsonLayer } from '../layers/useGeoJsonLayer.js';
import type { BoundingBox } from '@terrain/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WATER_COLOR = Cesium.Color.fromCssColorString('#4F8FBA');
const WATER_FILL = WATER_COLOR.withAlpha(0.6);
const WATER_LINE_WIDTH = 3;

// ---------------------------------------------------------------------------
// Feature type
// ---------------------------------------------------------------------------

type WaterFeature = Feature<Polygon | MultiPolygon | LineString | MultiLineString>;

// ---------------------------------------------------------------------------
// Module-level callbacks (referentially stable — do NOT inline in the component)
// ---------------------------------------------------------------------------

function waterFetcher(bbox: BoundingBox, signal: AbortSignal) {
  return fetchWater(bbox, { signal });
}

/** No LOD cap for water: features are few, and rivers must not be truncated. */
function waterApplyCap(features: WaterFeature[]) {
  return { kept: features, dropped: 0 };
}

function renderWaterFeature(
  feature: WaterFeature,
  viewer: Cesium.Viewer,
): Cesium.Entity | null {
  const geom = feature.geometry;

  if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
    // Resolve the outer ring of the (first) polygon.
    let ring: Position[] | undefined;
    if (geom.type === 'Polygon') {
      ring = geom.coordinates[0];
    } else {
      // MultiPolygon → first polygon's outer ring (v1 — same as buildings)
      ring = geom.coordinates[0]?.[0];
    }
    if (!ring || ring.length < 4) return null;

    const flat: number[] = [];
    for (const [lng, lat] of ring) {
      if (typeof lng !== 'number' || typeof lat !== 'number') return null;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      flat.push(lng, lat);
    }

    const positions = Cesium.Cartesian3.fromDegreesArray(flat);
    return viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: WATER_FILL,
        height: 0,
        // No extrudedHeight — water lies on the terrain surface
        outline: false,
      },
    });
  }

  if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
    // Resolve coordinate array of the (first) line.
    let coords: Position[] | undefined;
    if (geom.type === 'LineString') {
      coords = geom.coordinates;
    } else {
      coords = geom.coordinates[0];
    }
    if (!coords || coords.length < 2) return null;

    const flat: number[] = [];
    for (const [lng, lat] of coords) {
      if (typeof lng !== 'number' || typeof lat !== 'number') return null;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      flat.push(lng, lat);
    }

    const positions = Cesium.Cartesian3.fromDegreesArray(flat);
    return viewer.entities.add({
      polyline: {
        positions,
        width: WATER_LINE_WIDTH,
        material: WATER_COLOR,
        clampToGround: true,
      },
    });
  }

  return null;
}

function waterErrorToMessage(err: unknown): string {
  if (err instanceof LayerApiError) return err.userMessage;
  return 'Could not load water data.';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WaterLayer() {
  const bbox = useAppStore((s) => s.bbox);
  const selectionPolygon = useAppStore((s) => s.selectionPolygon);

  useGeoJsonLayer<WaterFeature>({
    layerId: 'water',
    bbox,
    selectionPolygon,
    fetcher: waterFetcher,
    // No clip step: water features are already bbox-scoped; client-side
    // polygon clipping would incorrectly truncate rivers at the selection edge.
    applyCap: waterApplyCap,
    renderFeature: renderWaterFeature,
    errorToMessage: waterErrorToMessage,
    // flyToOnSelection: false — BuildingsLayer already handles camera flyTo.
    // A second flyTo from WaterLayer (which may settle slightly later) would
    // cause a jarring double-pan. Water is always co-located with buildings.
    flyToOnSelection: false,
  });

  return null;
}
