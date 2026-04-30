/**
 * Generic Overpass proxy handler factory.
 *
 * Creates a Vercel serverless handler that:
 * 1. Parses and validates west/south/east/north query params.
 * 2. Checks a bbox-keyed cache (X-Cache: HIT | MISS).
 * 3. Splits at the antimeridian and fetches Overpass in parallel if needed.
 * 4. Simplifies raw Overpass JSON using the caller-supplied `simplify` fn.
 * 5. Deduplicates antimeridian-merged features by id.
 * 6. Guards against responses > MAX_BODY_BYTES (413 AREA_TOO_DENSE).
 * 7. Stores the response in cache (Cache-Control: public, max-age=3600).
 * 8. Maps typed errors to correct HTTP status codes:
 *    - OverpassTimeoutError  → 504 OVERPASS_UPSTREAM
 *    - OverpassHttpError 5xx → 502 OVERPASS_UPSTREAM
 *    - OverpassHttpError 429 → 503 OVERPASS_RATE_LIMITED
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type GeoJSON from 'geojson';
import { splitAtAntimeridian } from '@terrain/shared';
import type { BoundingBox } from '@terrain/shared';
import { getCache } from './cacheFactory.js';
import type { Cache } from './cache.js';
import { bboxCacheKey } from './bboxKey.js';
import { fetchOverpass, OverpassTimeoutError, OverpassHttpError } from './overpassFetch.js';
import type { FetchOverpassOpts } from './overpassFetch.js';
import { mergeAndDedupeById } from './overpass/mergeAndDedupeById.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour
const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB — headroom under Vercel's 4.5 MB limit
const OVERPASS_SERVER_TIMEOUT = 25; // seconds — embedded in Overpass QL
const OVERPASS_HTTP_TIMEOUT_MS = 32_000; // ms — slightly above server timeout

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VercelHandler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

export type OverpassHandlerOptions<F extends GeoJSON.Feature = GeoJSON.Feature> = {
  /** Cache key prefix — e.g. 'buildings', 'water', 'roads'. */
  cachePrefix: string;
  /**
   * Build the Overpass QL query string for a given bbox.
   * Called once per sub-bbox (may be called twice for antimeridian splits).
   */
  queryBuilder: (bbox: BoundingBox, opts?: { timeout?: number }) => string;
  /**
   * Convert raw Overpass JSON into a GeoJSON FeatureCollection.
   * Called once per sub-bbox result before merging.
   */
  simplify: (overpassJson: unknown) => GeoJSON.FeatureCollection<F['geometry'] extends GeoJSON.Geometry ? F['geometry'] : GeoJSON.Geometry>;
  /**
   * User-facing error message when the response body exceeds MAX_BODY_BYTES.
   * Default: 'Selection is too dense — try a smaller area.'
   */
  tooDenseMessage?: string;
};

/** Injectable dependencies (for testing). */
export type OverpassHandlerDeps = {
  cache?: Cache;
  fetchFn?: (query: string, opts?: FetchOverpassOpts) => Promise<unknown>;
};

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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Vercel serverless handler for an Overpass-backed GeoJSON endpoint.
 *
 * @param opts - Configuration for the specific feature layer.
 * @param deps - Optional dependency injection for tests (cache, fetchFn).
 */
export function createOverpassHandler<F extends GeoJSON.Feature>(
  opts: OverpassHandlerOptions<F>,
  deps: OverpassHandlerDeps = {},
): VercelHandler {
  const tooDenseMessage = opts.tooDenseMessage ?? 'Selection is too dense — try a smaller area.';

  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
    const cache = deps.cache ?? getCache();
    const cacheKey = bboxCacheKey(opts.cachePrefix, bbox);

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
      console.error(`[${opts.cachePrefix}] cache.get error:`, err);
    }

    // 3. Build query/queries (handle antimeridian split)
    const subBboxes = splitAtAntimeridian(bbox);
    const doFetch = deps.fetchFn ?? fetchOverpass;
    const queries = subBboxes.map((b) => opts.queryBuilder(b, { timeout: OVERPASS_SERVER_TIMEOUT }));

    // 4. Fetch from Overpass and simplify
    let collection: GeoJSON.FeatureCollection;
    try {
      if (queries.length === 1) {
        const raw = await doFetch(queries[0]!, { timeoutMs: OVERPASS_HTTP_TIMEOUT_MS });
        collection = opts.simplify(raw) as GeoJSON.FeatureCollection;
      } else {
        // Antimeridian split — fetch both halves in parallel
        const [rawA, rawB] = await Promise.all(
          queries.map((q) => doFetch(q, { timeoutMs: OVERPASS_HTTP_TIMEOUT_MS })),
        );
        // Deduplicate: a feature that straddles 180° can appear in both halves
        collection = mergeAndDedupeById(
          opts.simplify(rawA) as GeoJSON.FeatureCollection,
          opts.simplify(rawB) as GeoJSON.FeatureCollection,
        );
      }
    } catch (err) {
      // Fix I4: 429 from Overpass → 503 OVERPASS_RATE_LIMITED
      if (err instanceof OverpassHttpError && err.statusCode === 429) {
        res.status(503).json({
          error: 'OVERPASS_RATE_LIMITED',
          message: 'OpenStreetMap is rate-limiting requests. Please try again in a moment.',
        });
        return;
      }
      // Fix I3: Overpass timeout → 504; Overpass 5xx → 502 (different wording)
      if (err instanceof OverpassTimeoutError) {
        res.status(504).json({
          error: 'OVERPASS_UPSTREAM',
          message: 'OpenStreetMap query timed out. Try a smaller area or try again.',
        });
        return;
      }
      if (err instanceof OverpassHttpError && err.statusCode >= 500) {
        res.status(502).json({
          error: 'OVERPASS_UPSTREAM',
          message: 'OpenStreetMap is temporarily unavailable. Please try again shortly.',
        });
        return;
      }
      console.error(`[${opts.cachePrefix}] unexpected fetch error:`, err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
      return;
    }

    // 5. Serialize and check size
    const body = JSON.stringify(collection);
    const byteLength = Buffer.byteLength(body, 'utf8');

    if (byteLength > MAX_BODY_BYTES) {
      res.status(413).json({
        error: 'AREA_TOO_DENSE',
        message: tooDenseMessage,
      });
      return;
    }

    // 6. Cache the response
    try {
      await cache.set(cacheKey, body, CACHE_TTL_SECONDS);
    } catch (err) {
      // Cache write failure is non-fatal
      console.error(`[${opts.cachePrefix}] cache.set error:`, err);
    }

    // 7. Respond
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Cache', 'MISS');
    res.status(200).end(body);
  };
}
