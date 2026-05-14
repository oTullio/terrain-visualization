/**
 * Tests for cacheUpstash.ts — validates the Cache interface contract
 * without a real Redis connection. A fake RedisClient stub is injected
 * via the constructor to avoid network calls.
 */
import { describe, it, expect, vi } from 'vitest';
import { UpstashCache } from './cacheUpstash.js';
import type { RedisClient } from './cacheUpstash.js';

function makeFakeRedis(getReturn: string | null = null): { client: RedisClient; getFn: ReturnType<typeof vi.fn>; setFn: ReturnType<typeof vi.fn> } {
  const getFn = vi.fn().mockResolvedValue(getReturn);
  const setFn = vi.fn().mockResolvedValue('OK');
  const client: RedisClient = {
    get: getFn,
    set: setFn,
  };
  return { client, getFn, setFn };
}

describe('UpstashCache', () => {
  it('set() calls the underlying redis.set with { ex: ttl } and the exact string value', async () => {
    const { client, setFn } = makeFakeRedis();
    const cache = new UpstashCache(client);

    const jsonValue = '{"type":"FeatureCollection","features":[]}';
    await cache.set('buildings:key', jsonValue, 3600);

    expect(setFn).toHaveBeenCalledOnce();
    expect(setFn).toHaveBeenCalledWith('buildings:key', jsonValue, { ex: 3600 });
  });

  it('set() passes the string value verbatim — does not re-stringify or parse', async () => {
    const { client, setFn } = makeFakeRedis();
    const cache = new UpstashCache(client);

    // A raw JSON string — it must NOT be JSON.parsed and then re-stringified
    const rawValue = '{"a":1}';
    await cache.set('k', rawValue, 60);

    const storedValue = setFn.mock.calls[0]?.[1];
    expect(typeof storedValue).toBe('string');
    expect(storedValue).toBe(rawValue);
  });

  it('get() returns the raw string the underlying redis returned — does not JSON.parse', async () => {
    const rawString = '{"type":"FeatureCollection","features":[]}';
    const { client, getFn } = makeFakeRedis(rawString);
    const cache = new UpstashCache(client);

    const result = await cache.get('buildings:key');

    expect(getFn).toHaveBeenCalledOnce();
    expect(getFn).toHaveBeenCalledWith('buildings:key');
    // Must be the original string, not a parsed object
    expect(result).toBe(rawString);
    expect(typeof result).toBe('string');
  });

  it('get() returns null when the underlying redis returns null', async () => {
    const { client } = makeFakeRedis(null);
    const cache = new UpstashCache(client);

    const result = await cache.get('missing');
    expect(result).toBeNull();
  });

  it('get() returns null when the underlying redis returns undefined (mapped to null)', async () => {
    const getFn = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn();
    const client: RedisClient = { get: getFn, set: setFn };
    const cache = new UpstashCache(client);

    const result = await cache.get('absent');
    expect(result).toBeNull();
  });
});
