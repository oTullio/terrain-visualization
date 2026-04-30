/**
 * Overpass QL query builder for water features.
 *
 * Selects: natural=water (ways + relations), landuse=reservoir (ways + relations),
 * waterway (all tagged ways, covers rivers/streams/canals), natural=coastline.
 *
 * Contract: callers MUST NOT pass antimeridian-crossing bboxes (west > east).
 * Use `splitAtAntimeridian(bbox)` from the geo module first and call this
 * function once per sub-bbox.
 */
import type { BoundingBox } from '../types/index.js';

export interface WaterQueryOpts {
  /**
   * Overpass server-side timeout in seconds.
   * Separate from the HTTP request timeout used by the proxy.
   * Default: 25
   */
  timeout?: number;
}

/**
 * Builds an Overpass QL query that fetches water features within `bbox`.
 *
 * Overpass bbox order: south, west, north, east (NOT the GeoJSON lng-lat order).
 *
 * Selectors:
 *   - way[natural=water]         — lakes, ponds, swimming pools (polygons)
 *   - way[landuse=reservoir]     — reservoirs (polygons)
 *   - way[waterway]              — rivers, streams, canals, ditches (lines + riverbanks)
 *   - way[natural=coastline]     — coastlines (lines)
 *   - relation[natural=water]    — large water bodies (multipolygons)
 *   - relation[landuse=reservoir]— large reservoirs (multipolygons)
 *
 * @throws {Error} if `bbox.west > bbox.east` (antimeridian-crossing).
 *   Call `splitAtAntimeridian(bbox)` first and invoke once per sub-bbox.
 */
export function waterQuery(bbox: BoundingBox, opts: WaterQueryOpts = {}): string {
  const { west, south, east, north } = bbox;
  const timeout = opts.timeout ?? 25;

  if (west > east) {
    throw new Error(
      'waterQuery: bbox crosses the antimeridian (west > east). ' +
        'Call splitAtAntimeridian(bbox) first and call waterQuery on each sub-bbox.',
    );
  }

  // Overpass bbox order: south,west,north,east
  const bboxStr = `${south},${west},${north},${east}`;

  return (
    `[out:json][timeout:${timeout}][bbox:${bboxStr}];\n` +
    `(\n` +
    `  way[natural=water];\n` +
    `  way[landuse=reservoir];\n` +
    `  way[waterway];\n` +
    `  way[natural=coastline];\n` +
    `  relation[natural=water];\n` +
    `  relation[landuse=reservoir];\n` +
    `);\n` +
    `out body geom;\n`
  );
}
