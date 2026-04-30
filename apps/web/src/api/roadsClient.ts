/**
 * Browser-side client for `GET /api/roads`.
 *
 * Wraps `fetch` with:
 *   - URL builder (URLSearchParams of west/south/east/north).
 *   - `LayerApiError` for ergonomic error UX (shared with buildings/water client).
 *   - JSON-only contract: any non-2xx → typed error with code + userMessage.
 *
 * AbortSignal is propagated; `AbortError` is re-thrown unchanged so callers
 * can treat it as cancellation (not a real failure).
 *
 * Returns a FeatureCollection<LineString>. The backend simplifier only emits
 * LineString features — the renderer dispatches by highway class via roadStyles.
 */
import type { FeatureCollection, LineString } from 'geojson';
import type { BoundingBox } from '@terrain/shared';
import {
  LayerApiError,
  codeForStatus,
  isAbortError,
  isFeatureCollection,
  type LayerApiErrorCode,
} from './layerApiError.js';

// Re-export as RoadsApiError for symmetric naming with BuildingsApiError / WaterApiError.
export { LayerApiError as RoadsApiError };
export type { LayerApiErrorCode as RoadsApiErrorCode };

const DEFAULT_USER_MESSAGES: Record<LayerApiErrorCode, string> = {
  AREA_TOO_DENSE:
    'Selection contains too dense a road network. Try a smaller area.',
  OVERPASS_UPSTREAM: 'OpenStreetMap is temporarily unavailable. Please try again shortly.',
  OVERPASS_RATE_LIMITED:
    'OpenStreetMap is rate-limiting requests. Please try again in a moment.',
  INVALID_BBOX: 'Selection is invalid. Please draw a new area.',
  INTERNAL_ERROR: "Couldn't load road data — please try again.",
};

export type RoadsFeatureCollection = FeatureCollection<LineString>;

export interface FetchRoadsOptions {
  signal?: AbortSignal;
}

export async function fetchRoads(
  bbox: BoundingBox,
  opts: FetchRoadsOptions = {},
): Promise<RoadsFeatureCollection> {
  const params = new URLSearchParams({
    west: String(bbox.west),
    south: String(bbox.south),
    east: String(bbox.east),
    north: String(bbox.north),
  });
  const url = `/api/roads?${params.toString()}`;

  let res: Response;
  try {
    const init: RequestInit = {
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
    if (opts.signal) init.signal = opts.signal;
    res = await fetch(url, init);
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new LayerApiError(
      'INTERNAL_ERROR',
      DEFAULT_USER_MESSAGES.INTERNAL_ERROR,
    );
  }

  if (!res.ok) {
    const code = codeForStatus(res.status);
    let message = DEFAULT_USER_MESSAGES[code];
    try {
      const body = (await res.json()) as { message?: unknown; error?: unknown };
      if (body && typeof body.message === 'string' && body.message.length > 0) {
        message = body.message;
      }
    } catch {
      // non-JSON body: keep default
    }
    throw new LayerApiError(code, message, res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new LayerApiError(
      'INTERNAL_ERROR',
      DEFAULT_USER_MESSAGES.INTERNAL_ERROR,
      res.status,
    );
  }

  if (!isFeatureCollection(body)) {
    throw new LayerApiError(
      'INTERNAL_ERROR',
      DEFAULT_USER_MESSAGES.INTERNAL_ERROR,
      res.status,
    );
  }

  return body as RoadsFeatureCollection;
}
