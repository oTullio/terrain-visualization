/**
 * Tests for overpassHandler.ts — createOverpassHandler factory.
 *
 * Uses constructor-injected fakes for `cache` and `fetchFn` so no real
 * Redis connection or Overpass HTTP call is made.
 */
import { describe, it, expect, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createOverpassHandler } from './overpassHandler.js';
import { OverpassTimeoutError, OverpassHttpError } from './overpassFetch.js';
import type { Cache } from './cache.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal GeoJSON FeatureCollection for testing. */
const EMPTY_COLLECTION = { type: 'FeatureCollection' as const, features: [] };

/** Create a fake Cache that always misses (returns null from get). */
function makeCache(getReturn: string | null = null): Cache & { getFn: ReturnType<typeof vi.fn>; setFn: ReturnType<typeof vi.fn> } {
  const getFn = vi.fn().mockResolvedValue(getReturn);
  const setFn = vi.fn().mockResolvedValue(undefined);
  return { get: getFn, set: setFn, getFn, setFn };
}

/** Create a minimal VercelRequest mock with the given query params. */
function makeReq(query: Record<string, string | undefined> = {}, method = 'GET'): VercelRequest {
  return { method, query } as unknown as VercelRequest;
}

/** Create a minimal VercelResponse mock that records calls. */
function makeRes(): VercelResponse & {
  _status: number;
  _body: string;
  _headers: Record<string, string>;
} {
  const res = {
    _status: 200,
    _body: '',
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = JSON.stringify(body);
      return res;
    },
    end(body: string) {
      res._body = body;
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
  } as unknown as VercelResponse & { _status: number; _body: string; _headers: Record<string, string> };
  return res;
}

/** Valid Lisbon bbox params. */
const VALID_BBOX = { west: '-9.155', south: '38.706', east: '-9.131', north: '38.726' };

/** Build handler with sensible defaults for most tests. */
function makeHandler(
  fetchFn: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({}),
  cache: Cache = makeCache(),
) {
  return createOverpassHandler(
    {
      cachePrefix: 'test',
      queryBuilder: () => '[out:json];way[building];out;',
      simplify: () => EMPTY_COLLECTION,
      tooDenseMessage: 'Too dense for test.',
    },
    { cache, fetchFn },
  );
}

// ---------------------------------------------------------------------------
// 400 — invalid bbox params
// ---------------------------------------------------------------------------

describe('400 on missing/non-numeric bbox params', () => {
  it('returns 400 when all params are missing', async () => {
    const handler = makeHandler();
    const req = makeReq({});
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(JSON.parse(res._body).error).toBe('INVALID_PARAMS');
  });

  it('returns 400 when west is not a number', async () => {
    const handler = makeHandler();
    const req = makeReq({ ...VALID_BBOX, west: 'abc' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when south >= north', async () => {
    const handler = makeHandler();
    const req = makeReq({ ...VALID_BBOX, south: '38.726', north: '38.706' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when latitude out of range', async () => {
    const handler = makeHandler();
    const req = makeReq({ ...VALID_BBOX, south: '-95' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 413 — too dense (body exceeds MAX_BODY_BYTES)
// ---------------------------------------------------------------------------

describe('413 with configured tooDenseMessage', () => {
  it('returns 413 and the custom message when body > 4 MB', async () => {
    // Produce a collection whose JSON representation exceeds 4 MB
    const bigFeatures = Array.from({ length: 50_000 }, (_, i) => ({
      type: 'Feature' as const,
      id: `way/${i}`,
      geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      properties: { building: 'yes', name: 'A'.repeat(100) },
    }));
    const bigCollection = { type: 'FeatureCollection' as const, features: bigFeatures };

    const handler = createOverpassHandler(
      {
        cachePrefix: 'test',
        queryBuilder: () => '',
        simplify: () => bigCollection,
        tooDenseMessage: 'Selection contains too many buildings. Try a smaller area.',
      },
      {
        cache: makeCache(),
        fetchFn: vi.fn().mockResolvedValue({}),
      },
    );

    const req = makeReq(VALID_BBOX);
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(413);
    const body = JSON.parse(res._body);
    expect(body.error).toBe('AREA_TOO_DENSE');
    expect(body.message).toBe('Selection contains too many buildings. Try a smaller area.');
  });
});

// ---------------------------------------------------------------------------
// 504 — Overpass timeout
// ---------------------------------------------------------------------------

describe('504 on OverpassTimeoutError', () => {
  it('returns 504 OVERPASS_UPSTREAM with timeout message', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new OverpassTimeoutError());
    const handler = makeHandler(fetchFn);
    const req = makeReq(VALID_BBOX);
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(504);
    const body = JSON.parse(res._body);
    expect(body.error).toBe('OVERPASS_UPSTREAM');
    expect(body.message).toContain('timed out');
  });
});

// ---------------------------------------------------------------------------
// 502 — Overpass 5xx
// ---------------------------------------------------------------------------

describe('502 on Overpass 5xx', () => {
  it('returns 502 OVERPASS_UPSTREAM with unavailable message', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new OverpassHttpError(503, 'Service Unavailable'));
    const handler = makeHandler(fetchFn);
    const req = makeReq(VALID_BBOX);
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(502);
    const body = JSON.parse(res._body);
    expect(body.error).toBe('OVERPASS_UPSTREAM');
    expect(body.message).toContain('temporarily unavailable');
  });

  it('returns 502 for 500 status', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new OverpassHttpError(500, 'Internal Server Error'));
    const handler = makeHandler(fetchFn);
    const req = makeReq(VALID_BBOX);
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(502);
  });
});

// ---------------------------------------------------------------------------
// 503 — Overpass 429 (rate limited)
// ---------------------------------------------------------------------------

describe('503 on Overpass 429', () => {
  it('returns 503 OVERPASS_RATE_LIMITED', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new OverpassHttpError(429, 'Too Many Requests'));
    const handler = makeHandler(fetchFn);
    const req = makeReq(VALID_BBOX);
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(503);
    const body = JSON.parse(res._body);
    expect(body.error).toBe('OVERPASS_RATE_LIMITED');
    expect(body.message).toContain('rate-limiting');
  });
});

// ---------------------------------------------------------------------------
// 200 + X-Cache MISS then HIT
// ---------------------------------------------------------------------------

describe('200 with X-Cache MISS then HIT', () => {
  it('first call returns X-Cache MISS; second call returns X-Cache HIT with same body', async () => {
    const collectionJson = JSON.stringify(EMPTY_COLLECTION);

    // Start with a miss cache; after set it should return the stored value
    let storedValue: string | null = null;
    const cache: Cache = {
      get: vi.fn().mockImplementation(async () => storedValue),
      set: vi.fn().mockImplementation(async (_k: string, v: string) => {
        storedValue = v;
      }),
    };

    const fetchFn = vi.fn().mockResolvedValue({});
    const handler = createOverpassHandler(
      {
        cachePrefix: 'test',
        queryBuilder: () => '',
        simplify: () => EMPTY_COLLECTION,
      },
      { cache, fetchFn },
    );

    // First call — cache miss
    const req1 = makeReq(VALID_BBOX);
    const res1 = makeRes();
    await handler(req1, res1);
    expect(res1._status).toBe(200);
    expect(res1._headers['X-Cache']).toBe('MISS');
    expect(res1._body).toBe(collectionJson);

    // Second call — cache hit
    const req2 = makeReq(VALID_BBOX);
    const res2 = makeRes();
    await handler(req2, res2);
    expect(res2._status).toBe(200);
    expect(res2._headers['X-Cache']).toBe('HIT');
    expect(res2._body).toBe(collectionJson);

    // fetchFn should only have been called once (not on the HIT)
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// 405 — wrong method
// ---------------------------------------------------------------------------

describe('405 on non-GET request', () => {
  it('returns 405 for POST', async () => {
    const handler = makeHandler();
    const req = makeReq(VALID_BBOX, 'POST');
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});
