/**
 * Bounding-box math utilities for WGS-84 geographic coordinates.
 *
 * Key conventions:
 * - Coordinates are [longitude, latitude] (GeoJSON order).
 * - A bbox that crosses the antimeridian (the 180°/-180° line) is encoded
 *   with west > east (e.g. west=170, east=-170). This is the standard
 *   convention used by the OGC and RFC 7946 (GeoJSON) antimeridian guidance.
 */

import area from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';
import type GeoJSON from 'geojson';
import type { BoundingBox } from '../types/index.js';

// Re-export BoundingBox so callers can import from this module too.
export type { BoundingBox };

// ---------------------------------------------------------------------------
// bboxFromPolygon
// ---------------------------------------------------------------------------

/**
 * Returns the smallest axis-aligned bounding box that covers the polygon's
 * outer ring.
 *
 * Antimeridian handling: if consecutive longitudes have an absolute difference
 * greater than 180°, the polygon is assumed to cross the antimeridian. In that
 * case the returned bbox has `west > east` (conventional antimeridian encoding).
 *
 * Only the outer ring (coordinates[0]) is considered; holes are ignored.
 */
export function bboxFromPolygon(polygon: GeoJSON.Polygon): BoundingBox {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length === 0) {
    throw new Error('bboxFromPolygon: polygon has no outer ring');
  }

  // Detect antimeridian crossing: if any consecutive pair of longitudes has
  // |Δlng| > 180 the polygon wraps across the antimeridian.
  let crossesAntimeridian = false;
  for (let i = 1; i < ring.length; i++) {
    const prevLng = ring[i - 1]![0];
    const currLng = ring[i]![0];
    if (Math.abs(currLng - prevLng) > 180) {
      crossesAntimeridian = true;
      break;
    }
  }

  let south = Infinity;
  let north = -Infinity;

  if (!crossesAntimeridian) {
    // Simple case: collect min/max of both lat and lng.
    let west = Infinity;
    let east = -Infinity;
    for (const [lng, lat] of ring) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
    return { west, south, east, north };
  }

  // Antimeridian-crossing case.
  // We want the smallest SIGNED range [west..east] such that west > east.
  // Approach: shift all longitudes to a continuous range by unwrapping, then
  // map back to [-180, 180].
  //
  // The algorithm collects the min and max longitude treating the ring as a
  // continuous path. We normalise each longitude into the range [startLng,
  // startLng + 360) to make the span monotone, then find min/max in that
  // normalised space.

  const lngs: number[] = [];
  const startLng = ring[0]![0];

  for (const [lng, lat] of ring) {
    // Unwrap lng into a continuous range starting near startLng
    let unwrapped = lng;
    while (unwrapped < startLng - 180) unwrapped += 360;
    while (unwrapped > startLng + 180) unwrapped -= 360;
    lngs.push(unwrapped);
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  let minUnwrapped = Math.min(...lngs);
  let maxUnwrapped = Math.max(...lngs);

  // Wrap back into [-180, 180]
  const normalise = (lng: number): number => {
    while (lng > 180) lng -= 360;
    while (lng < -180) lng += 360;
    return lng;
  };

  const west = normalise(minUnwrapped);
  const east = normalise(maxUnwrapped);

  // The antimeridian-crossing convention: west > east.
  // If somehow the span doesn't cross (e.g. all normalised to same side),
  // return the normal bbox.
  return { west, south, east, north };
}

// ---------------------------------------------------------------------------
// splitAtAntimeridian
// ---------------------------------------------------------------------------

/**
 * Splits an antimeridian-crossing bbox into two non-crossing bboxes.
 *
 * If the bbox does NOT cross the antimeridian (west <= east), returns `[bbox]`
 * unchanged.
 *
 * If it DOES cross (west > east), returns two bboxes:
 *   - `{ west: bbox.west, south, east: 180, north }` (the western portion)
 *   - `{ west: -180, south, east: bbox.east, north }` (the eastern portion)
 *
 * These are already-split sub-bboxes, each with west <= east — calling
 * splitAtAntimeridian on them again returns `[sub-bbox]` unchanged (idempotent).
 *
 * Used by the Overpass proxy (Phase B2) to build two separate API calls.
 */
export function splitAtAntimeridian(bbox: BoundingBox): BoundingBox[] {
  if (bbox.west <= bbox.east) {
    // No crossing.
    return [bbox];
  }
  const { west, south, east, north } = bbox;
  return [
    { west, south, east: 180, north },
    { west: -180, south, east, north },
  ];
}

// ---------------------------------------------------------------------------
// geodesicAreaSqKm
// ---------------------------------------------------------------------------

/**
 * Computes the geodesic area of a GeoJSON Polygon in square kilometres.
 *
 * Uses `@turf/area` which implements the standard spherical excess formula
 * (Gauss–Bonnet), giving geodesic (not naïve Δlat·Δlng) area regardless of
 * latitude.
 */
export function geodesicAreaSqKm(polygon: GeoJSON.Polygon): number {
  const feature = turfPolygon(polygon.coordinates);
  const sqMeters = area(feature);
  return sqMeters / 1_000_000; // m² → km²
}

// ---------------------------------------------------------------------------
// bboxToPolygon
// ---------------------------------------------------------------------------

/**
 * Converts a non-crossing BoundingBox to a closed rectangular GeoJSON Polygon
 * (outer ring = 5 points, first === last).
 *
 * Throws if `bbox.west > bbox.east` (i.e. the bbox crosses the antimeridian).
 * In that case, call `splitAtAntimeridian(bbox)` first and convert each
 * sub-bbox separately.
 *
 * The resulting polygon can be round-tripped back to an equivalent BoundingBox
 * via `bboxFromPolygon`.
 */
export function bboxToPolygon(bbox: BoundingBox): GeoJSON.Polygon {
  if (bbox.west > bbox.east) {
    throw new Error(
      'bboxToPolygon: bbox crosses the antimeridian (west > east). ' +
        'Call splitAtAntimeridian(bbox) first and convert each half separately.',
    );
  }
  const { west, south, east, north } = bbox;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south], // closed ring
      ],
    ],
  };
}
