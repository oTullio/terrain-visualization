/**
 * GET /api/buildings
 *
 * Query params: west, south, east, north (decimal degrees, WGS-84)
 * Response:     GeoJSON FeatureCollection of building polygons
 * Errors:
 *   400  { error: 'INVALID_PARAMS',    message: string }         — bad query params
 *   413  { error: 'AREA_TOO_DENSE',    message: string }         — response > 4 MB
 *   504  { error: 'OVERPASS_UPSTREAM', message: string }         — Overpass timeout/5xx
 *   500  { error: 'INTERNAL_ERROR',    message: string }         — unexpected failure
 * Cache-Control: public, max-age=3600 on 200 responses.
 * X-Cache: HIT | MISS header reflects cache state.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildingsQuery, splitAtAntimeridian } from '@terrain/shared';
import type { BoundingBox } from '@terrain/shared';
import { getCache } from '../lib/cacheFactory.js';
import { bboxCacheKey } from '../lib/bboxKey.js';
import { fetchOverpass, OverpassTimeoutError, OverpassHttpError } from '../lib/overpassFetch.js';
import { simplifyBuildings } from '../lib/simplify.js';
import type GeoJSON from 'geojson';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour
const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB — headroom under Vercel's 4.5 MB limit
const OVERPASS_SERVER_TIMEOUT = 25; // seconds — embedded in Overpass QL
const OVERPASS_HTTP_TIMEOUT_MS = 32_000; // ms — slightly above server timeout

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseParams(query: VercelRequest['query']): BoundingBox | null {
  const west = parseNumber(query['west']);
  const south = parseNumber(query['south']);
  const east = parseNumber(query['east']);
  const north = parseNumber(query['north']);

  if (west === null || south === null || east === null || north === null) return null;
  if (south < -90 || south > 90 || north < -90 || north > 90) return null;
  if (west < -180 || west > 180 || east < -180 || east > 180) return null;
  if (south >= north) return null;

  return { west, south, east, north };
}

/** Merge two FeatureCollections into one. */
function mergeCollections(a: GeoJSON.FeatureCollection, b: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [...a.features, ...b.features] };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET is supported.' });
    return;
  }

  // 1. Validate query params
  const bbox = parseParams(req.query);
  if (!bbox) {
    res.status(400).json({
      error: 'INVALID_PARAMS',
      message:
        'Required query parameters: west, south, east, north (decimal degrees). ' +
        'south must be < north; all values must be finite numbers within valid ranges.',
    });
    return;
  }

  // 2. Check cache
  const cache = getCache();
  const cacheKey = bboxCacheKey('buildings', bbox);

  try {
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Cache', 'HIT');
      res.status(200).end(cached);
      return;
    }
  } catch (err) {
    // Cache read failure is non-fatal — fall through to live fetch
    console.error('[buildings] cache.get error:', err);
  }

  // 3. Build query/queries (handle antimeridian split)
  const subBboxes = splitAtAntimeridian(bbox);
  const queries = subBboxes.map((b) => buildingsQuery(b, { timeout: OVERPASS_SERVER_TIMEOUT }));

  // 4. Fetch from Overpass
  let collection: GeoJSON.FeatureCollection;
  try {
    if (queries.length === 1) {
      const raw = await fetchOverpass(queries[0]!, { timeoutMs: OVERPASS_HTTP_TIMEOUT_MS });
      collection = simplifyBuildings(raw);
    } else {
      // Antimeridian split — fetch both halves in parallel
      const [rawA, rawB] = await Promise.all(
        queries.map((q) => fetchOverpass(q, { timeoutMs: OVERPASS_HTTP_TIMEOUT_MS })),
      );
      collection = mergeCollections(simplifyBuildings(rawA), simplifyBuildings(rawB));
    }
  } catch (err) {
    if (err instanceof OverpassTimeoutError) {
      res.status(504).json({
        error: 'OVERPASS_UPSTREAM',
        message: 'OpenStreetMap query timed out. Try a smaller area or try again.',
      });
      return;
    }
    if (err instanceof OverpassHttpError && err.statusCode >= 500) {
      res.status(504).json({
        error: 'OVERPASS_UPSTREAM',
        message: 'OpenStreetMap query timed out. Try a smaller area or try again.',
      });
      return;
    }
    console.error('[buildings] unexpected fetch error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
    return;
  }

  // 5. Serialize and check size
  const body = JSON.stringify(collection);
  const byteLength = Buffer.byteLength(body, 'utf8');

  if (byteLength > MAX_BODY_BYTES) {
    res.status(413).json({
      error: 'AREA_TOO_DENSE',
      message: 'Selection contains too many buildings. Try a smaller area.',
    });
    return;
  }

  // 6. Cache the response
  try {
    await cache.set(cacheKey, body, CACHE_TTL_SECONDS);
  } catch (err) {
    // Cache write failure is non-fatal
    console.error('[buildings] cache.set error:', err);
  }

  // 7. Respond
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Cache', 'MISS');
  res.status(200).end(body);
}
