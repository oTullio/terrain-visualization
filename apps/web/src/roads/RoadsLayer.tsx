/**
 * RoadsLayer — fetches OSM road features for the active selection and renders
 * them as styled polylines clamped to the ground in the parent `<Viewer>`.
 *
 * Lifecycle is handled by the generic `useGeoJsonLayer` hook. This component
 * only supplies the roads-specific functions:
 *   - fetcher       → fetchRoads
 *   - applyCap      → identity (no LOD truncation — road continuity matters;
 *                     cutting a road mid-viewport is visually confusing)
 *   - renderFeature → clamped polyline styled by highway class via getRoadStyle
 *
 * flyToOnSelection is false: BuildingsLayer already handles camera flyTo.
 * A second flyTo from RoadsLayer (which may settle slightly later due to async
 * fetch ordering) would cause a jarring double-pan. Roads are always
 * co-located with buildings.
 *
 * Only LineString geometry is handled. The backend simplifier (`simplifyRoads`)
 * emits exclusively LineStrings — no dispatch by geometry type is needed.
 */
import * as Cesium from 'cesium';
import type { Feature, LineString } from 'geojson';
import { useAppStore } from '../store/useAppStore.js';
import { fetchRoads } from '../api/roadsClient.js';
import { LayerApiError } from '../api/layerApiError.js';
import { useGeoJsonLayer } from '../layers/useGeoJsonLayer.js';
import { getRoadStyle } from './roadStyles.js';
import type { BoundingBox } from '@terrain/shared';

// ---------------------------------------------------------------------------
// Feature type
// ---------------------------------------------------------------------------

type RoadFeature = Feature<LineString>;

// ---------------------------------------------------------------------------
// Module-level callbacks (referentially stable — do NOT inline in the component)
// ---------------------------------------------------------------------------

function roadsFetcher(bbox: BoundingBox, signal: AbortSignal) {
  return fetchRoads(bbox, { signal });
}

/**
 * No LOD cap for roads: road visual continuity matters — a road that
 * disappears mid-viewport is more disorienting than showing all features.
 */
function roadsApplyCap(features: RoadFeature[]) {
  return { kept: features, dropped: 0 };
}

function renderRoadFeature(
  feature: RoadFeature,
  viewer: Cesium.Viewer,
): Cesium.Entity | null {
  const geom = feature.geometry;
  if (geom.type !== 'LineString') return null;
  if (!geom.coordinates || geom.coordinates.length < 2) return null;

  const flat: number[] = [];
  for (const coord of geom.coordinates) {
    const lng = coord[0];
    const lat = coord[1];
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    flat.push(lng, lat);
  }

  const style = getRoadStyle(feature.properties?.highway as string | undefined);
  const positions = Cesium.Cartesian3.fromDegreesArray(flat);

  return viewer.entities.add({
    polyline: {
      positions,
      width: style.width,
      material: style.color,
      clampToGround: true,
    },
  });
}

function roadsErrorToMessage(err: unknown): string {
  if (err instanceof LayerApiError) return err.userMessage;
  return 'Could not load road data.';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RoadsLayer() {
  const bbox = useAppStore((s) => s.bbox);
  const selectionPolygon = useAppStore((s) => s.selectionPolygon);
  const reducedScene = useAppStore((s) => s.reducedScene);

  // Skip road rendering when reduced-scene mode is ON (default on mobile)
  // to reduce tile fetches and keep the 3D scene smooth on low-end devices.
  useGeoJsonLayer<RoadFeature>({
    layerId: 'roads',
    bbox: reducedScene ? null : bbox,
    selectionPolygon,
    fetcher: roadsFetcher,
    applyCap: roadsApplyCap,
    renderFeature: renderRoadFeature,
    errorToMessage: roadsErrorToMessage,
    // flyToOnSelection: false — BuildingsLayer already handles camera flyTo.
    // A second flyTo from RoadsLayer would cause a jarring double-pan.
    flyToOnSelection: false,
  });

  return null;
}
