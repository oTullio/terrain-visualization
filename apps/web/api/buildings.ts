/**
 * GET /api/buildings
 *
 * Query params: west, south, east, north (decimal degrees, WGS-84)
 * Response:     GeoJSON FeatureCollection of building polygons
 * Errors:
 *   400  { error: 'INVALID_PARAMS',        message: string }  — bad query params
 *   413  { error: 'AREA_TOO_DENSE',        message: string }  — response > 4 MB
 *   502  { error: 'OVERPASS_UPSTREAM',     message: string }  — Overpass 5xx
 *   503  { error: 'OVERPASS_RATE_LIMITED', message: string }  — Overpass 429
 *   504  { error: 'OVERPASS_UPSTREAM',     message: string }  — Overpass timeout
 *   500  { error: 'INTERNAL_ERROR',        message: string }  — unexpected failure
 * Cache-Control: public, max-age=3600 on 200 responses.
 * X-Cache: HIT | MISS header reflects cache state.
 */
import { buildingsQuery } from '@terrain/shared';
import { simplifyBuildings } from '../lib/simplify/buildings.js';
import { createOverpassHandler } from '../lib/overpassHandler.js';

export default createOverpassHandler({
  cachePrefix: 'buildings',
  queryBuilder: buildingsQuery,
  simplify: simplifyBuildings,
  tooDenseMessage: 'Selection contains too many buildings. Try a smaller area.',
});
