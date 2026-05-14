/**
 * GET /api/water
 *
 * Query params: west, south, east, north (decimal degrees, WGS-84)
 * Response:     GeoJSON FeatureCollection of water features
 *               (mixed Polygon + LineString geometry)
 * Errors:
 *   400  { error: 'INVALID_PARAMS',        message: string }  — bad query params
 *   413  { error: 'AREA_TOO_DENSE',        message: string }  — response > 4 MB
 *   502  { error: 'OVERPASS_UPSTREAM',     message: string }  — Overpass 5xx
 *   503  { error: 'OVERPASS_RATE_LIMITED', message: string }  — Overpass 429
 *   504  { error: 'OVERPASS_UPSTREAM',     message: string }  — Overpass timeout
 *   500  { error: 'INTERNAL_ERROR',        message: string }  — unexpected failure
 * Cache-Control: public, max-age=3600 on 200 responses.
 * X-Cache: HIT | MISS header reflects cache state.
 *
 * tooDenseMessage is water-specific: lake-rich or river-dense selections
 * tend to trigger 413. The message hints the user to try a smaller area
 * rather than assuming it's a network problem.
 */
import { waterQuery } from '@terrain/shared';
import { simplifyWater } from '../server/simplify/water.js';
import { createOverpassHandler } from '../server/overpassHandler.js';

export default createOverpassHandler({
  cachePrefix: 'water',
  queryBuilder: waterQuery,
  simplify: simplifyWater,
  tooDenseMessage:
    'Selection contains too much water data. Try a smaller area or choose a region with fewer waterways.',
});
