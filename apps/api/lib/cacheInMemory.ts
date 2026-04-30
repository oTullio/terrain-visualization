/**
 * In-memory cache implementation for local development.
 * Uses a module-level Map so the cache survives across requests in `vercel dev`.
 * TTL is enforced lazily on read (no background eviction needed).
 */
import type { Cache } from './cache.js';

interface Entry {
  value: string;
  expiresAt: number; // Date.now() + ttlMs
}

export class InMemoryCache implements Cache {
  private readonly store: Map<string, Entry>;

  constructor(store?: Map<string, Entry>) {
    this.store = store ?? new Map();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}

// Module-level singleton — shared across all function invocations in the same
// process (vercel dev keeps one Node process alive across requests).
const _moduleStore = new Map<string, Entry>();
export const memoryCache = new InMemoryCache(_moduleStore);
