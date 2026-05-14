/**
 * Returns the appropriate cache implementation based on environment.
 * - Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN set → Upstash.
 * - Otherwise → in-memory Map (for local dev / vercel dev).
 *
 * The choice is memoized — only one instance is created per process.
 * Both implementations are imported eagerly (ESM "type":"module" — no lazy require).
 * The Upstash client is small and cheap to import even when not used.
 */
import type { Cache } from './cache.js';
import { memoryCache } from './cacheInMemory.js';
import { UpstashCache } from './cacheUpstash.js';

let _cache: Cache | undefined;

export function getCache(): Cache {
  if (_cache) return _cache;

  const url = process.env['UPSTASH_REDIS_REST_URL'];
  const token = process.env['UPSTASH_REDIS_REST_TOKEN'];

  if (url && token) {
    _cache = new UpstashCache();
  } else {
    _cache = memoryCache;
  }

  return _cache;
}
