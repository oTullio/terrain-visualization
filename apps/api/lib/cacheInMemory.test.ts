/**
 * Tests for cacheInMemory.ts — get/set, TTL expiry, key isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryCache } from './cacheInMemory.js';

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    // Use a fresh instance per test (not the module-level singleton) for isolation.
    cache = new InMemoryCache();
  });

  it('returns null for a key that has never been set', async () => {
    const result = await cache.get('missing');
    expect(result).toBeNull();
  });

  it('returns the stored value immediately after set', async () => {
    await cache.set('k', 'hello', 60);
    const result = await cache.get('k');
    expect(result).toBe('hello');
  });

  it('isolates different keys', async () => {
    await cache.set('a', 'alpha', 60);
    await cache.set('b', 'beta', 60);
    expect(await cache.get('a')).toBe('alpha');
    expect(await cache.get('b')).toBe('beta');
  });

  it('overwrites an existing key on second set', async () => {
    await cache.set('k', 'first', 60);
    await cache.set('k', 'second', 60);
    expect(await cache.get('k')).toBe('second');
  });

  it('returns null after TTL has expired', async () => {
    // Fake timers: advance clock past TTL without actually waiting.
    vi.useFakeTimers();
    await cache.set('k', 'value', 1); // 1 second TTL
    vi.advanceTimersByTime(1001); // advance 1001 ms
    const result = await cache.get('k');
    expect(result).toBeNull();
    vi.useRealTimers();
  });

  it('still returns value before TTL has expired', async () => {
    vi.useFakeTimers();
    await cache.set('k', 'value', 10); // 10 second TTL
    vi.advanceTimersByTime(5000); // advance 5 s — still live
    const result = await cache.get('k');
    expect(result).toBe('value');
    vi.useRealTimers();
  });
});
