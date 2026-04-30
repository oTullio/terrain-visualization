/**
 * Overpass JSON → GeoJSON simplification for building features.
 *
 * Design decisions:
 * - Hand-rolled converter (no osmtogeojson): Overpass `out body geom` embeds
 *   geometry directly on each element, making conversion trivial and avoiding
 *   an extra dependency. Relations with `out geom` include member geometry too.
 * - @turf/area is used for the tiny-polygon filter (< 4 m²).
 * - Coordinates are snapped to 6 decimal places (~11 cm at equator).
 * - Tag whitelist: only building-display-relevant tags are kept; all others
 *   are dropped to minimise payload size.
 */
import area from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';
import type GeoJSON from 'geojson';
import { wayToPolygon, relationToMultiPolygon } from '../overpass/convert.js';
import { filterTags } from '../overpass/filterTags.js';
import type { OverpassJson, OverpassWayElement, OverpassRelationElement } from '../overpass/convert.js';

// ---------------------------------------------------------------------------
// Buildings-specific constants
// ---------------------------------------------------------------------------

const TINY_AREA_THRESHOLD_M2 = 4; // drop polygons <= 4 m²

export const BUILDING_TAG_WHITELIST = new Set<string>([
  'building',
  'building:part',
  'height',
  'building:levels',
  'min_height',
  'roof:shape',
  'roof:height',
  'name',
]);

// ---------------------------------------------------------------------------
// Buildings-specific helpers
// ---------------------------------------------------------------------------

/** Returns true if the polygon ring is above the tiny-area threshold. */
export function isSignificantBuilding(ring: GeoJSON.Position[]): boolean {
  if (ring.length < 4) return false; // degenerate
  try {
    const poly = turfPolygon([ring]);
    return area(poly) > TINY_AREA_THRESHOLD_M2;
  } catch {
    return false;
  }
}

/** Filter tags to the buildings whitelist. */
function buildingTagFilter(tags: Record<string, string> | undefined): Record<string, string> {
  return filterTags(tags, BUILDING_TAG_WHITELIST);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Convert raw Overpass JSON (from `out body geom`) to a simplified GeoJSON
 * FeatureCollection ready for client delivery.
 *
 * @param overpass - Parsed Overpass JSON response (type `unknown` to accept
 *   unvalidated HTTP responses; structurally validated inside).
 */
export function simplifyBuildings(overpass: unknown): GeoJSON.FeatureCollection {
  const data = overpass as OverpassJson;
  const elements = data?.elements ?? [];
  const features: GeoJSON.Feature[] = [];

  for (const el of elements) {
    if (el.type === 'way') {
      const f = wayToPolygon(el as OverpassWayElement, buildingTagFilter);
      if (f && isSignificantBuilding((f.geometry as GeoJSON.Polygon).coordinates[0]!)) {
        features.push(f);
      }
    } else if (el.type === 'relation') {
      const f = relationToMultiPolygon(
        el as OverpassRelationElement,
        isSignificantBuilding,
        buildingTagFilter,
      );
      if (f) features.push(f);
    }
    // node elements are skipped — buildings need area geometry
  }

  return { type: 'FeatureCollection', features };
}
