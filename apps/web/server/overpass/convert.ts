/**
 * Generic Overpass JSON → GeoJSON geometry converters.
 *
 * These helpers are feature-type agnostic — they convert raw Overpass element
 * geometry into GeoJSON rings/polygons. Buildings, water, and roads all share
 * this converter; each layer supplies its own tag whitelist and area filter.
 *
 * NOTE: Inner-ring (hole) support for relations is intentionally omitted.
 * The spec deferred it — only `outer` members are processed. Inner rings
 * from `inner` role members are silently ignored. Add in a future phase.
 */
import type GeoJSON from 'geojson';

// ---------------------------------------------------------------------------
// Types for Overpass `out body geom` JSON format
// ---------------------------------------------------------------------------

export interface OverpassGeomPoint {
  lat: number;
  lon: number;
}

export interface OverpassWayElement {
  type: 'way';
  id: number;
  nodes?: number[];
  geometry?: OverpassGeomPoint[];
  tags?: Record<string, string>;
}

export interface OverpassRelationMember {
  type: 'way' | 'node' | 'relation';
  ref: number;
  role: string;
  geometry?: OverpassGeomPoint[];
}

export interface OverpassRelationElement {
  type: 'relation';
  id: number;
  members?: OverpassRelationMember[];
  tags?: Record<string, string>;
}

export type OverpassElement =
  | OverpassWayElement
  | OverpassRelationElement
  | { type: 'node'; [k: string]: unknown };

export interface OverpassJson {
  elements?: OverpassElement[];
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

/** Snap a coordinate value to 6 decimal places (~11 cm precision at equator). */
export function snap6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

/** Convert an Overpass geom point array to a GeoJSON ring [lng, lat][]. */
export function geomToRing(geom: OverpassGeomPoint[]): GeoJSON.Position[] {
  return geom.map((pt) => [snap6(pt.lon), snap6(pt.lat)]);
}

/**
 * Ensure the ring is closed (first point === last point).
 * Mutates `ring` in place and returns it for convenience.
 */
export function ensureClosed(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([...first]);
  }
  return ring;
}

// ---------------------------------------------------------------------------
// Way converter
// ---------------------------------------------------------------------------

/**
 * Convert an Overpass way element to a GeoJSON Polygon Feature.
 *
 * @param el - The Overpass way element with embedded geometry.
 * @param tagFilter - Function to filter/transform the element's tags into
 *   Feature properties. Pass `(tags) => tags` to keep all tags.
 * @returns A GeoJSON Feature, or `null` if the geometry is missing/degenerate.
 */
export function wayToPolygon(
  el: OverpassWayElement,
  tagFilter: (tags: Record<string, string> | undefined) => Record<string, string>,
): GeoJSON.Feature<GeoJSON.Polygon> | null {
  if (!el.geometry || el.geometry.length < 4) return null;

  const ring = ensureClosed(geomToRing(el.geometry));

  return {
    type: 'Feature',
    id: `way/${el.id}`,
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: tagFilter(el.tags),
  };
}

// ---------------------------------------------------------------------------
// LineString converter (for waterways)
// ---------------------------------------------------------------------------

/**
 * Convert an Overpass way element to a GeoJSON LineString Feature.
 *
 * Used for waterways (rivers, streams, canals, ditches) that are modelled
 * as open lines rather than closed polygons.
 *
 * @param el - The Overpass way element with embedded geometry.
 * @param tagFilter - Function to filter/transform the element's tags into
 *   Feature properties. Pass `(tags) => tags` to keep all tags.
 * @returns A GeoJSON Feature, or `null` if geometry is missing/degenerate (< 2 pts).
 */
export function wayToLineString(
  el: OverpassWayElement,
  tagFilter: (tags: Record<string, string> | undefined) => Record<string, string>,
): GeoJSON.Feature<GeoJSON.LineString> | null {
  if (!el.geometry || el.geometry.length < 2) return null;

  const coordinates = el.geometry.map((pt) => [snap6(pt.lon), snap6(pt.lat)] as GeoJSON.Position);

  return {
    type: 'Feature',
    id: `way/${el.id}`,
    geometry: { type: 'LineString', coordinates },
    properties: tagFilter(el.tags),
  };
}

// ---------------------------------------------------------------------------
// Relation converter
// ---------------------------------------------------------------------------

/**
 * Convert an Overpass relation element to a GeoJSON Polygon or MultiPolygon Feature.
 *
 * Only `outer` role members are processed. Inner rings (holes) are ignored —
 * inner-ring support is deferred to a future phase.
 *
 * @param el - The Overpass relation element with embedded member geometry.
 * @param ringFilter - Predicate to filter individual outer rings (e.g. area check).
 * @param tagFilter - Function to filter/transform tags into Feature properties.
 * @returns A GeoJSON Feature, or `null` if no valid outer rings are found.
 */
export function relationToMultiPolygon(
  el: OverpassRelationElement,
  ringFilter: (ring: GeoJSON.Position[]) => boolean,
  tagFilter: (tags: Record<string, string> | undefined) => Record<string, string>,
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  if (!el.members) return null;

  const outerRings: GeoJSON.Position[][] = [];

  for (const member of el.members) {
    if (member.type !== 'way' || member.role !== 'outer') continue;
    if (!member.geometry || member.geometry.length < 4) continue;

    const ring = ensureClosed(geomToRing(member.geometry));
    if (ringFilter(ring)) {
      outerRings.push(ring);
    }
  }

  if (outerRings.length === 0) return null;

  const tags = tagFilter(el.tags);

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
