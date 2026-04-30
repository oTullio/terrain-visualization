/**
 * Shared error class for layer API clients (buildings, water, roads, …).
 *
 * Each layer client throws `LayerApiError` with a layer-specific `code`
 * and a `userMessage` suitable for display in the UI without further
 * transformation.
 *
 * `BuildingsApiError` and `WaterApiError` are thin re-exports so existing
 * code that catches by name still works without changes.
 */

export type LayerApiErrorCode =
  | 'AREA_TOO_DENSE'
  | 'OVERPASS_UPSTREAM'
  | 'OVERPASS_RATE_LIMITED'
  | 'INVALID_BBOX'
  | 'INTERNAL_ERROR';

export class LayerApiError extends Error {
  override readonly name = 'LayerApiError';
  readonly code: LayerApiErrorCode;
  readonly userMessage: string;
  readonly status: number | undefined;

  constructor(code: LayerApiErrorCode, userMessage: string, status?: number) {
    super(`[${code}] ${userMessage}`);
    this.code = code;
    this.userMessage = userMessage;
    this.status = status;
  }
}

/** Map an HTTP status to one of our typed error codes. */
export function codeForStatus(status: number): LayerApiErrorCode {
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

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'AbortError' || err.code === DOMException.ABORT_ERR)
  );
}

export function isFeatureCollection(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as { type?: unknown; features?: unknown };
  return v.type === 'FeatureCollection' && Array.isArray(v.features);
}
