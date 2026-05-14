/**
 * Overpass JSON → GeoJSON simplification for road features.
 *
 * Design decisions:
 * - All road elements are ways → use `wayToLineString` exclusively.
 * - Relations (e.g. bus/tram route relations) are dropped — they are out of
 *   scope for the Phase C3 roads layer which shows the physical road network.
 * - Drop LineStrings shorter than 5 m (same threshold as waterways; sub-5 m
 *   ways are likely digitising artefacts or duplicated nodes).
 * - Coordinates are snapped to 6 decimal places by `wayToLineString` via
 *   `snap6` (~11 cm precision at equator) — no further rounding needed here.
 * - Tag whitelist: only tags needed by the renderer and tooling are kept.
 *   `highway` is mandatory — it drives per-class colour/width styling.
 *   The rest support attribution panels and future routing tooling.
 * - Returns a FeatureCollection<LineString> (homogeneous — no Polygons).
 */
import length from '@turf/length';
import { lineString as turfLineString } from '@turf/helpers';
import type GeoJSON from 'geojson';
import { wayToLineString } from '../overpass/convert.js';
import { filterTags } from '../overpass/filterTags.js';
import type {
  OverpassJson,
  OverpassWayElement,
} from '../overpass/convert.js';

// ---------------------------------------------------------------------------
// Roads-specific constants
// ---------------------------------------------------------------------------

/** Drop linestrings shorter than 5 m (sub-5 m road segments are noise). */
const SHORT_LINE_THRESHOLD_KM = 0.005; // 5 m expressed in km (turf/length unit)

/**
 * Tags kept in the GeoJSON output.
 *
 * - `highway`   — required by the renderer for per-class colour/width styling
 * - `name`      — display label
 * - `ref`       — road reference number (e.g. "A1", "M25")
 * - `lanes`     — lane count (future tooling)
 * - `oneway`    — directionality (future routing)
 * - `maxspeed`  — speed limit (future tooling)
 * - `surface`   — pavement type (future drape mode)
 * - `bridge`    — bridge flag (future 3D extrusion)
 * - `tunnel`    — tunnel flag (future underground styling)
 * - `layer`     — z-order for overlapping ways (bridge/tunnel stacking)
 * - `access`    — access restriction (future routing)
 */
export const ROADS_TAG_WHITELIST = new Set<string>([
  'highway',
  'name',
  'ref',
  'lanes',
  'oneway',
  'maxspeed',
  'surface',
  'bridge',
  'tunnel',
  'layer',
  'access',
]);

// ---------------------------------------------------------------------------
// Roads-specific helpers
// ---------------------------------------------------------------------------

/** Returns true if the LineString spans above the short-line threshold (5 m). */
export function isSignificantRoadLine(coords: GeoJSON.Position[]): boolean {
  if (coords.length < 2) return false;
  try {
    const line = turfLineString(coords);
    return length(line, { units: 'kilometers' }) > SHORT_LINE_THRESHOLD_KM;
  } catch {
    return false;
  }
}

/** Filter tags to the roads whitelist. */
function roadsTagFilter(tags: Record<string, string> | undefined): Record<string, string> {
  return filterTags(tags, ROADS_TAG_WHITELIST);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Convert raw Overpass JSON (from `out body geom`) to a simplified GeoJSON
 * FeatureCollection ready for client delivery.
 *
 * Returns a HOMOGENEOUS collection (LineString only). The Overpass query only
 * selects ways, and road ways are always open lines (not closed polygons).
 * Relations are dropped — route relations (bus, tram) are out of scope.
 *
 * @param overpass - Parsed Overpass JSON response (type `unknown` to accept
 *   unvalidated HTTP responses; structurally validated inside).
 */
export function simplifyRoads(
  overpass: unknown,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const data = overpass as OverpassJson;
  const elements = data?.elements ?? [];
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (const el of elements) {
    if (el.type === 'way') {
      const way = el as OverpassWayElement;
      const f = wayToLineString(way, roadsTagFilter);
      if (f && isSignificantRoadLine(f.geometry.coordinates)) {
        features.push(f);
      }
    }
    // Relations (route relations) and nodes are silently skipped.
  }

  return { type: 'FeatureCollection', features };
}
