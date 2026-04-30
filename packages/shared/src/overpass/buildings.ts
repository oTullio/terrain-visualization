/**
 * Overpass QL query builder for building features.
 *
 * Contract: callers MUST NOT pass antimeridian-crossing bboxes (west > east).
 * Use `splitAtAntimeridian(bbox)` from the geo module first and call this
 * function once per sub-bbox.
 */
import type { BoundingBox } from '../types/index.js';

export interface BuildingsQueryOpts {
  /**
   * Overpass server-side timeout in seconds.
   * Separate from the HTTP request timeout used by the proxy.
   * Default: 25
   */
  timeout?: number;
}

/**
 * Builds an Overpass QL query that fetches building geometry within `bbox`.
 *
 * Overpass bbox order: south, west, north, east (NOT the GeoJSON lng-lat order).
 *
 * @throws {Error} if `bbox.west > bbox.east` (antimeridian-crossing).
 *   Call `splitAtAntimeridian(bbox)` first and invoke once per sub-bbox.
 */
export function buildingsQuery(bbox: BoundingBox, opts: BuildingsQueryOpts = {}): string {
  const { west, south, east, north } = bbox;
  const timeout = opts.timeout ?? 25;

  if (west > east) {
    throw new Error(
      'buildingsQuery: bbox crosses the antimeridian (west > east). ' +
        'Call splitAtAntimeridian(bbox) first and call buildingsQuery on each sub-bbox.',
    );
  }

  // Overpass bbox order: south,west,north,east
  const bboxStr = `${south},${west},${north},${east}`;

  return (
    `[out:json][timeout:${timeout}][bbox:${bboxStr}];\n` +
    `(\n` +
    `  way[building];\n` +
    `  way["building:part"];\n` +
    `  relation[building];\n` +
    `);\n` +
    `out body geom;\n`
  );
}
