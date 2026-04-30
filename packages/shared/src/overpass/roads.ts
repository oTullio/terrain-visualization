/**
 * Overpass QL query builder for road features.
 *
 * Highway class whitelist — keeps payloads manageable even over dense urban
 * areas (Manhattan, Paris). The list is calibrated to include all publicly
 * routable road classes while excluding non-motorised paths, construction
 * placeholders, and niche categories that bloat the response without adding
 * navigable context to a 3D terrain viewer.
 *
 * INCLUDED:
 *   motorway, trunk, primary, secondary, tertiary — principal road network
 *   unclassified, residential                     — local roads
 *   living_street, pedestrian                     — shared/pedestrianised streets
 *   service                                       — access roads, car parks, driveways
 *   *_link (motorway_link, trunk_link, …)         — slip roads / ramps
 *
 * EXCLUDED (intentionally):
 *   footway, cycleway, path, track, steps, bridleway, corridor — non-motorised
 *   proposed, construction, raceway               — incomplete or niche
 *
 * Contract: callers MUST NOT pass antimeridian-crossing bboxes (west > east).
 * Use `splitAtAntimeridian(bbox)` from the geo module first and call this
 * function once per sub-bbox.
 */
import type { BoundingBox } from '../types/index.js';

export interface RoadsQueryOpts {
  /**
   * Overpass server-side timeout in seconds.
   * Separate from the HTTP request timeout used by the proxy.
   * Default: 25
   */
  timeout?: number;
}

/**
 * The highway values included in the whitelist regex.
 * Kept as a constant so tests can assert membership without re-parsing.
 */
const HIGHWAY_CLASSES = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'pedestrian',
  'service',
] as const;

/**
 * Link variants that are separate OSM values (not `class_link` of the above).
 * In Overpass regex these match the same selector pattern as the main classes
 * but they must also be included in the link selector.
 */
const LINK_CLASSES = [
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
] as const;

const MAIN_REGEX = `^(${HIGHWAY_CLASSES.join('|')})$`;
const LINK_REGEX = `^(${LINK_CLASSES.join('|')})$`;

/**
 * Builds an Overpass QL query that fetches road features within `bbox`.
 *
 * Overpass bbox order: south, west, north, east (NOT the GeoJSON lng-lat order).
 *
 * Two selectors are used:
 *   1. `way[highway~"^(motorway|trunk|...)$"]` — main highway classes
 *   2. `way[highway~"^(motorway_link|trunk_link|...)$"]` — link/ramp variants
 *
 * The link variants are a separate selector because `motorway_link` is a
 * distinct OSM value, not a sub-class of `motorway`.
 *
 * @throws {Error} if `bbox.west > bbox.east` (antimeridian-crossing).
 *   Call `splitAtAntimeridian(bbox)` first and invoke once per sub-bbox.
 */
export function roadsQuery(bbox: BoundingBox, opts: RoadsQueryOpts = {}): string {
  const { west, south, east, north } = bbox;
  const timeout = opts.timeout ?? 25;

  if (west > east) {
    throw new Error(
      'roadsQuery: bbox crosses the antimeridian (west > east). ' +
        'Call splitAtAntimeridian(bbox) first and call roadsQuery on each sub-bbox.',
    );
  }

  // Overpass bbox order: south,west,north,east
  const bboxStr = `${south},${west},${north},${east}`;

  return (
    `[out:json][timeout:${timeout}][bbox:${bboxStr}];\n` +
    `(\n` +
    `  way[highway~"${MAIN_REGEX}"];\n` +
    `  way[highway~"${LINK_REGEX}"];\n` +
    `);\n` +
    `out body geom;\n`
  );
}
