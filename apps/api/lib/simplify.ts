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

// ---------------------------------------------------------------------------
// Types for Overpass `out body geom` JSON format
// ---------------------------------------------------------------------------

interface OverpassGeomPoint {
  lat: number;
  lon: number;
}

interface OverpassWayElement {
  type: 'way';
  id: number;
  nodes?: number[];
  geometry?: OverpassGeomPoint[];
  tags?: Record<string, string>;
}

interface OverpassRelationMember {
  type: 'way' | 'node' | 'relation';
  ref: number;
  role: string;
  geometry?: OverpassGeomPoint[];
}

interface OverpassRelationElement {
  type: 'relation';
  id: number;
  members?: OverpassRelationMember[];
  tags?: Record<string, string>;
}

type OverpassElement = OverpassWayElement | OverpassRelationElement | { type: 'node'; [k: string]: unknown };

interface OverpassJson {
  elements?: OverpassElement[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TINY_AREA_THRESHOLD_M2 = 4; // drop polygons <= 4 m²

const TAG_WHITELIST = new Set<string>([
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
// Helpers
// ---------------------------------------------------------------------------

/** Snap a coordinate value to 6 decimal places. */
function snap6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

/** Convert an Overpass geom point array to a GeoJSON ring [lng, lat][]. */
function geomToRing(geom: OverpassGeomPoint[]): GeoJSON.Position[] {
  return geom.map((pt) => [snap6(pt.lon), snap6(pt.lat)]);
}

/** Filter tags to the whitelist. */
function filterTags(tags: Record<string, string> | undefined): Record<string, string> {
  if (!tags) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (TAG_WHITELIST.has(k)) out[k] = v;
  }
  return out;
}

/** Returns true if the polygon is above the tiny-area threshold. */
function isSignificant(ring: GeoJSON.Position[]): boolean {
  if (ring.length < 4) return false; // degenerate
  try {
    const poly = turfPolygon([ring]);
    return area(poly) > TINY_AREA_THRESHOLD_M2;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Way converter
// ---------------------------------------------------------------------------

function wayToFeature(el: OverpassWayElement): GeoJSON.Feature<GeoJSON.Polygon> | null {
  if (!el.geometry || el.geometry.length < 4) return null;

  const ring = geomToRing(el.geometry);

  // Ensure closed ring
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([...first]);
  }

  if (!isSignificant(ring)) return null;

  return {
    type: 'Feature',
    id: `way/${el.id}`,
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: filterTags(el.tags),
  };
}

// ---------------------------------------------------------------------------
// Relation converter
// ---------------------------------------------------------------------------

function relationToFeature(el: OverpassRelationElement): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  if (!el.members) return null;

  const outerRings: GeoJSON.Position[][] = [];

  for (const member of el.members) {
    if (member.type !== 'way' || member.role !== 'outer') continue;
    if (!member.geometry || member.geometry.length < 4) continue;

    const ring = geomToRing(member.geometry);
    // Ensure closed
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      ring.push([...first]);
    }
    if (isSignificant(ring)) {
      outerRings.push(ring);
    }
  }

  if (outerRings.length === 0) return null;

  const tags = filterTags(el.tags);

  if (outerRings.length === 1) {
    return {
      type: 'Feature',
      id: `relation/${el.id}`,
      geometry: { type: 'Polygon', coordinates: [outerRings[0]!] },
      properties: tags,
    };
  }

  return {
    type: 'Feature',
    id: `relation/${el.id}`,
    geometry: {
      type: 'MultiPolygon',
      coordinates: outerRings.map((r) => [r]),
    },
    properties: tags,
  };
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
      const f = wayToFeature(el as OverpassWayElement);
      if (f) features.push(f);
    } else if (el.type === 'relation') {
      const f = relationToFeature(el as OverpassRelationElement);
      if (f) features.push(f);
    }
    // node elements are skipped — buildings need area geometry
  }

  return { type: 'FeatureCollection', features };
}
