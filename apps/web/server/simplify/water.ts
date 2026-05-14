/**
 * Overpass JSON → GeoJSON simplification for water features.
 *
 * Design decisions:
 * - Way with waterway tag (but not waterway=riverbank) → LineString.
 *   Riverbanks, natural=water, landuse=reservoir, natural=coastline → Polygon.
 * - @turf/area for the small-polygon filter (< 100 m²).
 *   The threshold is larger than the buildings filter (4 m²) because tiny
 *   water polygons (drainage details, micro-puddles) tend to be noise, while
 *   tiny buildings (sheds, kiosks) are often real and worth keeping.
 * - @turf/length for the short-LineString filter (< 5 m).
 * - Coordinates are snapped to 6 decimal places (~11 cm at equator).
 * - Tag whitelist: only water-display-relevant tags are kept.
 * - Returns a mixed FeatureCollection (Polygon + LineString); the renderer
 *   dispatches by geometry type.
 */
import area from '@turf/area';
import length from '@turf/length';
import { polygon as turfPolygon, lineString as turfLineString } from '@turf/helpers';
import type GeoJSON from 'geojson';
import {
  wayToPolygon,
  wayToLineString,
  relationToMultiPolygon,
} from '../overpass/convert.js';
import { filterTags } from '../overpass/filterTags.js';
import type {
  OverpassJson,
  OverpassWayElement,
  OverpassRelationElement,
} from '../overpass/convert.js';

// ---------------------------------------------------------------------------
// Water-specific constants
// ---------------------------------------------------------------------------

/** Drop polygons with area <= 100 m² (sub-100 m² water bodies are noise). */
const TINY_AREA_THRESHOLD_M2 = 100;

/** Drop linestrings shorter than 5 m (very short waterways are noise). */
const SHORT_LINE_THRESHOLD_KM = 0.005; // 5 m expressed in km (turf/length unit)

export const WATER_TAG_WHITELIST = new Set<string>([
  'natural',
  'landuse',
  'waterway',
  'water',
  'name',
  'tunnel',
  'covered',
  'intermittent',
]);

// ---------------------------------------------------------------------------
// Water-specific helpers
// ---------------------------------------------------------------------------

/** Returns true if the polygon ring is above the tiny-area threshold. */
export function isSignificantWaterPolygon(ring: GeoJSON.Position[]): boolean {
  if (ring.length < 4) return false; // degenerate
  try {
    const poly = turfPolygon([ring]);
    return area(poly) > TINY_AREA_THRESHOLD_M2;
  } catch {
    return false;
  }
}

/** Returns true if the LineString coordinates span above the short-line threshold. */
export function isSignificantWaterLine(coords: GeoJSON.Position[]): boolean {
  if (coords.length < 2) return false;
  try {
    const line = turfLineString(coords);
    return length(line, { units: 'kilometers' }) > SHORT_LINE_THRESHOLD_KM;
  } catch {
    return false;
  }
}

/** Filter tags to the water whitelist. */
function waterTagFilter(tags: Record<string, string> | undefined): Record<string, string> {
  return filterTags(tags, WATER_TAG_WHITELIST);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Convert raw Overpass JSON (from `out body geom`) to a simplified GeoJSON
 * FeatureCollection ready for client delivery.
 *
 * Returns a MIXED collection (Polygon + LineString features). The downstream
 * renderer (WaterLayer.tsx) dispatches by geometry type.
 *
 * @param overpass - Parsed Overpass JSON response (type `unknown` to accept
 *   unvalidated HTTP responses; structurally validated inside).
 */
export function simplifyWater(overpass: unknown): GeoJSON.FeatureCollection {
  const data = overpass as OverpassJson;
  const elements = data?.elements ?? [];
  const features: GeoJSON.Feature[] = [];

  for (const el of elements) {
    if (el.type === 'way') {
      const way = el as OverpassWayElement;
      const tags = way.tags ?? {};

      // Decide: polygon or linestring?
      const isPolygonalWater =
        tags['natural'] === 'water' ||
        tags['landuse'] === 'reservoir' ||
        tags['waterway'] === 'riverbank' ||
        tags['natural'] === 'coastline';

      const isLinearWaterway =
        tags['waterway'] !== undefined && tags['waterway'] !== 'riverbank';

      if (isPolygonalWater) {
        const f = wayToPolygon(way, waterTagFilter);
        if (f && isSignificantWaterPolygon((f.geometry as GeoJSON.Polygon).coordinates[0]!)) {
          features.push(f);
        }
      } else if (isLinearWaterway) {
        const f = wayToLineString(way, waterTagFilter);
        if (f && isSignificantWaterLine(f.geometry.coordinates)) {
          features.push(f);
        }
      }
    } else if (el.type === 'relation') {
      const rel = el as OverpassRelationElement;
      const tags = rel.tags ?? {};

      if (tags['natural'] === 'water' || tags['landuse'] === 'reservoir') {
        const f = relationToMultiPolygon(rel, isSignificantWaterPolygon, waterTagFilter);
        if (f) features.push(f);
      }
    }
    // node elements are skipped — water features need area/line geometry
  }

  return { type: 'FeatureCollection', features };
}
