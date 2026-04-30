/**
 * BuildingsLayer — fetches OSM buildings for the active selection and
 * renders them as extruded prisms in the parent `<Viewer>` Cesium scene.
 *
 * Lifecycle is handled by the generic `useGeoJsonLayer` hook. This component
 * only supplies the buildings-specific functions:
 *   - fetcher  → fetchBuildings
 *   - clip     → clipFeaturesToPolygon
 *   - applyCap → applyLodCap (ranked by area)
 *   - renderFeature → outerRingFlat + buildingHeight → extruded Cesium polygon
 *
 * v1 simplification: only the first polygon of a MultiPolygon is rendered,
 * and only its outer ring. Holes (courtyards) are deferred per the brief.
 */
import * as Cesium from 'cesium';
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';
import type { BoundingBox } from '@terrain/shared';
import { useAppStore } from '../store/useAppStore.js';
import { fetchBuildings, BuildingsApiError } from '../api/buildingsClient.js';
import { clipFeaturesToPolygon } from './clipToPolygon.js';
import { applyLodCap } from './applyLodCap.js';
import { buildingHeight } from './buildingHeight.js';
import { DEFAULT_LOD_CAP } from './config.js';
import { useGeoJsonLayer } from '../layers/useGeoJsonLayer.js';

const BUILDING_COLOR = Cesium.Color.fromCssColorString('#cccccc');

type BuildingFeature = Feature<Polygon | MultiPolygon>;

/** Extract the outer ring of the (first, for MultiPolygon) polygon as flat lng/lat numbers. */
function outerRingFlat(feature: BuildingFeature): number[] | null {
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

function renderBuildingFeature(
  feature: BuildingFeature,
  viewer: Cesium.Viewer,
): Cesium.Entity | null {
  const flat = outerRingFlat(feature);
  if (!flat) return null;
  const { height, baseHeight } = buildingHeight(feature);
  const positions = Cesium.Cartesian3.fromDegreesArray(flat);
  return viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      height: baseHeight,
      extrudedHeight: height,
      material: BUILDING_COLOR,
      outline: false,
    },
  });
}

function buildingsFetcher(
  bbox: BoundingBox,
  signal: AbortSignal,
) {
  return fetchBuildings(bbox, { signal });
}

function buildingsApplyCap(features: BuildingFeature[]) {
  return applyLodCap(features, { maxFeatures: DEFAULT_LOD_CAP, rankBy: 'area' });
}

function buildingsErrorToMessage(err: unknown): string {
  if (err instanceof BuildingsApiError) return err.userMessage;
  return "Couldn't load buildings — please try again.";
}

export default function BuildingsLayer() {
  const bbox = useAppStore((s) => s.bbox);
  const selectionPolygon = useAppStore((s) => s.selectionPolygon);

  useGeoJsonLayer<BuildingFeature>({
    layerId: 'buildings',
    bbox,
    selectionPolygon,
    fetcher: buildingsFetcher,
    clip: clipFeaturesToPolygon,
    applyCap: buildingsApplyCap,
    renderFeature: renderBuildingFeature,
    errorToMessage: buildingsErrorToMessage,
  });

  return null;
}
