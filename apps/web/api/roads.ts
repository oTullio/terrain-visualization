/**
 * GET /api/roads
 *
 * Query params: west, south, east, north (decimal degrees, WGS-84)
 * Response:     GeoJSON FeatureCollection<LineString> of road features,
 *               styled by highway class (see roadStyles.ts in the web app).
 *               Each feature carries highway, name, ref, lanes, oneway,
 *               maxspeed, surface, bridge, tunnel, layer, access properties.
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
 * Note: dense urban areas (Manhattan, central Paris) may trigger 413 even with
 * the highway-class whitelist applied. The tooDenseMessage guides the user to
 * try a smaller selection rather than assuming a network problem.
 */
import { roadsQuery } from '@terrain/shared';
import { simplifyRoads } from '../server/simplify/roads.js';
import { createOverpassHandler } from '../server/overpassHandler.js';

export default createOverpassHandler({
  cachePrefix: 'roads',
  queryBuilder: roadsQuery,
  simplify: simplifyRoads,
  tooDenseMessage:
    'Selection contains too dense a road network. Try a smaller area.',
});
