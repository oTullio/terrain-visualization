import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BoundingBox } from '@terrain/shared';
import { fetchWater, WaterApiError } from './waterClient.js';
import { LayerApiError } from './layerApiError.js';

const TEST_BBOX: BoundingBox = {
  west: -9.155,
  south: 38.706,
  east: -9.131,
  north: 38.726,
};

const EMPTY_FC = {
  type: 'FeatureCollection' as const,
  features: [] as never[],
};

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('fetchWater', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the URL with west/south/east/north and Accept: application/json', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(EMPTY_FC));
    await fetchWater(TEST_BBOX);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/water\?/);
    const params = new URL(url, 'http://x').searchParams;
    expect(params.get('west')).toBe('-9.155');
    expect(params.get('south')).toBe('38.706');
    expect(params.get('east')).toBe('-9.131');
    expect(params.get('north')).toBe('38.726');
    const headers = new Headers(init.headers);
    expect(headers.get('accept')).toBe('application/json');
  });

  it('forwards an AbortSignal via init.signal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(EMPTY_FC));
    const ac = new AbortController();
    await fetchWater(TEST_BBOX, { signal: ac.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(ac.signal);
  });

  it('returns the parsed FeatureCollection on 2xx', async () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { natural: 'water' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        },
        {
          type: 'Feature',
          properties: { waterway: 'river' },
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
        },
      ],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(fc));
    const result = await fetchWater(TEST_BBOX);
    expect(result).toEqual(fc);
  });

  it('throws LayerApiError with code AREA_TOO_DENSE on 413', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'AREA_TOO_DENSE',
          message: 'Selection contains too much water data. Try a smaller area or choose a region with fewer waterways.',
        },
        { status: 413 },
      ),
    );

    await expect(fetchWater(TEST_BBOX)).rejects.toMatchObject({
      name: 'LayerApiError',
      code: 'AREA_TOO_DENSE',
      status: 413,
      userMessage: 'Selection contains too much water data. Try a smaller area or choose a region with fewer waterways.',
    });
  });

  it('throws OVERPASS_UPSTREAM on 502', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'OVERPASS_UPSTREAM',
          message: 'OpenStreetMap is temporarily unavailable. Please try again shortly.',
        },
        { status: 502 },
      ),
    );

    await expect(fetchWater(TEST_BBOX)).rejects.toMatchObject({
      code: 'OVERPASS_UPSTREAM',
      status: 502,
    });
  });

  it('throws OVERPASS_RATE_LIMITED on 503', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'OVERPASS_RATE_LIMITED', message: 'Rate limited.' },
        { status: 503 },
      ),
    );

    await expect(fetchWater(TEST_BBOX)).rejects.toMatchObject({
      code: 'OVERPASS_RATE_LIMITED',
      status: 503,
    });
  });

  it('throws OVERPASS_UPSTREAM on 504', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'OVERPASS_UPSTREAM', message: 'Timed out.' },
        { status: 504 },
      ),
    );

    await expect(fetchWater(TEST_BBOX)).rejects.toMatchObject({
      code: 'OVERPASS_UPSTREAM',
      status: 504,
    });
  });

  it('throws INVALID_BBOX on 400', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'INVALID_PARAMS', message: 'Bad bbox' }, { status: 400 }),
    );
    await expect(fetchWater(TEST_BBOX)).rejects.toMatchObject({
      code: 'INVALID_BBOX',
      status: 400,
    });
  });

  it('throws INTERNAL_ERROR on a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(fetchWater(TEST_BBOX)).rejects.toMatchObject({
      name: 'LayerApiError',
      code: 'INTERNAL_ERROR',
      userMessage: "Couldn't load water data — please try again.",
    });
  });

  it('throws INTERNAL_ERROR when the response body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>oops</html>', {
        status: 500,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(fetchWater(TEST_BBOX)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 500,
    });
  });

  it('throws INTERNAL_ERROR when the success body is malformed (not a FeatureCollection)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ totally: 'wrong' }));
    await expect(fetchWater(TEST_BBOX)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('propagates AbortError without wrapping', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    fetchMock.mockRejectedValueOnce(abortError);
    await expect(fetchWater(TEST_BBOX)).rejects.toBe(abortError);
  });

  it('WaterApiError is an alias for LayerApiError (instanceof safe)', () => {
    const err = new WaterApiError('AREA_TOO_DENSE', 'msg', 413);
    expect(err).toBeInstanceOf(WaterApiError);
    expect(err).toBeInstanceOf(LayerApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('AREA_TOO_DENSE');
    expect(err.userMessage).toBe('msg');
    expect(err.status).toBe(413);
  });
});
