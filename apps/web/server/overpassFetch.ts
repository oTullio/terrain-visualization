/**
 * Low-level Overpass API HTTP client.
 *
 * POSTs Overpass QL queries using application/x-www-form-urlencoded body.
 * Respects a configurable HTTP-level timeout (separate from the Overpass
 * server-side [timeout:N] directive embedded in the query).
 *
 * Endpoint is overridable via OVERPASS_ENDPOINT env var for mirror support.
 */

const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = 'terrain-viz/0.1 (+orwtullio@gmail.com)';

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class OverpassTimeoutError extends Error {
  readonly code = 'OVERPASS_TIMEOUT';
  constructor() {
    super('Overpass request timed out');
    this.name = 'OverpassTimeoutError';
  }
}

export class OverpassHttpError extends Error {
  readonly code = 'OVERPASS_HTTP_ERROR';
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'OverpassHttpError';
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface FetchOverpassOpts {
  /** HTTP-level abort timeout in milliseconds. Default: 30 000. */
  timeoutMs?: number;
}

/**
 * Fetch Overpass JSON for `query`.
 *
 * @throws {OverpassTimeoutError} when the HTTP request times out.
 * @throws {OverpassHttpError} on non-2xx response.
 * @returns Parsed JSON (shape depends on the query; callers cast as needed).
 */
export async function fetchOverpass(query: string, opts: FetchOverpassOpts = {}): Promise<unknown> {
  const endpoint = process.env['OVERPASS_ENDPOINT'] ?? DEFAULT_ENDPOINT;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // AbortController fires a DOMException with name 'AbortError'
    if (err instanceof Error && err.name === 'AbortError') {
      throw new OverpassTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new OverpassHttpError(response.status, `Overpass returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json() as Promise<unknown>;
}
