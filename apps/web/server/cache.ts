/**
 * Minimal cache interface used by the Overpass proxy layer.
 * Two implementations: InMemoryCache (dev) and UpstashCache (prod).
 */
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}
