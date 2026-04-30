/**
 * Browser-side client for `GET /api/buildings`.
 *
 * Wraps `fetch` with:
 *   - URL builder (URLSearchParams of west/south/east/north).
 *   - Typed error class (`BuildingsApiError`) for ergonomic error UX.
 *   - JSON-only contract: any non-2xx → typed error with code + userMessage.
 *
 * AbortSignal is propagated; `AbortError` is re-thrown unchanged so callers
 * can treat it as cancellation (not a real failure).
 */
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type { BoundingBox } from '@terrain/shared';

export type BuildingsApiErrorCode =
  | 'AREA_TOO_DENSE'
  | 'OVERPASS_UPSTREAM'
  | 'OVERPASS_RATE_LIMITED'
  | 'INVALID_BBOX'
  | 'INTERNAL_ERROR';

export class BuildingsApiError extends Error {
  override readonly name = 'BuildingsApiError';
  readonly code: BuildingsApiErrorCode;
  readonly userMessage: string;
  readonly status: number | undefined;

  constructor(code: BuildingsApiErrorCode, userMessage: string, status?: number) {
    super(`[${code}] ${userMessage}`);
    this.code = code;
    this.userMessage = userMessage;
    this.status = status;
  }
}

const DEFAULT_USER_MESSAGES: Record<BuildingsApiErrorCode, string> = {
  AREA_TOO_DENSE: 'Selection contains too many buildings. Try a smaller area.',
  OVERPASS_UPSTREAM: 'OpenStreetMap is temporarily unavailable. Please try again shortly.',
  OVERPASS_RATE_LIMITED:
    'OpenStreetMap is rate-limiting requests. Please try again in a moment.',
  INVALID_BBOX: 'Selection is invalid. Please draw a new area.',
  INTERNAL_ERROR: "Couldn't load buildings — please try again.",
};

/** Map an HTTP status to one of our typed error codes. */
function codeForStatus(status: number): BuildingsApiErrorCode {
  switch (status) {
    case 413:
      return 'AREA_TOO_DENSE';
    case 502:
    case 504:
      return 'OVERPASS_UPSTREAM';
    case 503:
      return 'OVERPASS_RATE_LIMITED';
    case 400:
      return 'INVALID_BBOX';
    default:
      return 'INTERNAL_ERROR';
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'AbortError' || err.code === DOMException.ABORT_ERR)
  );
}

function isFeatureCollection(
  value: unknown,
): value is FeatureCollection<Polygon | MultiPolygon> {
  if (!value || typeof value !== 'object') return false;
  const v = value as { type?: unknown; features?: unknown };
  return v.type === 'FeatureCollection' && Array.isArray(v.features);
}

export interface FetchBuildingsOptions {
  signal?: AbortSignal;
}

export async function fetchBuildings(
  bbox: BoundingBox,
  opts: FetchBuildingsOptions = {},
): Promise<FeatureCollection<Polygon | MultiPolygon>> {
  const params = new URLSearchParams({
    west: String(bbox.west),
    south: String(bbox.south),
    east: String(bbox.east),
    north: String(bbox.north),
  });
  const url = `/api/buildings?${params.toString()}`;

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
    throw new BuildingsApiError(
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
    throw new BuildingsApiError(code, message, res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new BuildingsApiError(
      'INTERNAL_ERROR',
      DEFAULT_USER_MESSAGES.INTERNAL_ERROR,
      res.status,
    );
  }

  if (!isFeatureCollection(body)) {
    throw new BuildingsApiError(
      'INTERNAL_ERROR',
      DEFAULT_USER_MESSAGES.INTERNAL_ERROR,
      res.status,
    );
  }

  return body;
}
