import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BoundingBox } from '@terrain/shared';
import { fetchRoads, RoadsApiError } from './roadsClient.js';
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

describe('fetchRoads', () => {
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
    await fetchRoads(TEST_BBOX);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/roads\?/);
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
    await fetchRoads(TEST_BBOX, { signal: ac.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(ac.signal);
  });

  it('returns the parsed FeatureCollection on 2xx', async () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { highway: 'primary', name: 'Test Road' },
          geometry: { type: 'LineString', coordinates: [[-9.155, 38.706], [-9.131, 38.726]] },
        },
      ],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(fc));
    const result = await fetchRoads(TEST_BBOX);
    expect(result).toEqual(fc);
  });

  it('throws LayerApiError with code AREA_TOO_DENSE on 413', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'AREA_TOO_DENSE',
          message: 'Selection contains too dense a road network. Try a smaller area.',
        },
        { status: 413 },
      ),
    );

    await expect(fetchRoads(TEST_BBOX)).rejects.toMatchObject({
      name: 'LayerApiError',
      code: 'AREA_TOO_DENSE',
      status: 413,
      userMessage: 'Selection contains too dense a road network. Try a smaller area.',
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

    await expect(fetchRoads(TEST_BBOX)).rejects.toMatchObject({
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

    await expect(fetchRoads(TEST_BBOX)).rejects.toMatchObject({
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

    await expect(fetchRoads(TEST_BBOX)).rejects.toMatchObject({
      code: 'OVERPASS_UPSTREAM',
      status: 504,
    });
  });

  it('throws INVALID_BBOX on 400', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'INVALID_PARAMS', message: 'Bad bbox' }, { status: 400 }),
    );
    await expect(fetchRoads(TEST_BBOX)).rejects.toMatchObject({
      code: 'INVALID_BBOX',
      status: 400,
    });
  });

  it('throws INTERNAL_ERROR on a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(fetchRoads(TEST_BBOX)).rejects.toMatchObject({
      name: 'LayerApiError',
      code: 'INTERNAL_ERROR',
      userMessage: "Couldn't load road data — please try again.",
    });
  });

  it('throws INTERNAL_ERROR when the response body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>oops</html>', {
        status: 500,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(fetchRoads(TEST_BBOX)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 500,
    });
  });

  it('throws INTERNAL_ERROR when the success body is malformed (not a FeatureCollection)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ totally: 'wrong' }));
    await expect(fetchRoads(TEST_BBOX)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('propagates AbortError without wrapping', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    fetchMock.mockRejectedValueOnce(abortError);
    await expect(fetchRoads(TEST_BBOX)).rejects.toBe(abortError);
  });

  it('RoadsApiError is an alias for LayerApiError (instanceof safe)', () => {
    const err = new RoadsApiError('AREA_TOO_DENSE', 'msg', 413);
    expect(err).toBeInstanceOf(RoadsApiError);
    expect(err).toBeInstanceOf(LayerApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('AREA_TOO_DENSE');
    expect(err.userMessage).toBe('msg');
    expect(err.status).toBe(413);
  });
});
