/**
 * Upstash Redis REST client cache implementation for production.
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
 *
 * Uses @upstash/redis ^1.34.9 — `set` with `{ ex: ttlSeconds }` for TTL.
 *
 * IMPORTANT: automaticDeserialization is disabled. The @upstash/redis client
 * silently JSON.parses values on read when automaticDeserialization is true
 * (the default), which turns stored JSON strings into objects and breaks the
 * Cache interface contract (which promises string | null). We store opaque
 * JSON strings and want them back as strings.
 */
import { Redis } from '@upstash/redis';
import type { Cache } from './cache.js';

/** Minimal interface of the Redis client methods we use, for testability. */
export interface RedisClient {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts: { ex: number }): Promise<unknown>;
}

export class UpstashCache implements Cache {
  private readonly redis: RedisClient;

  constructor(redis?: RedisClient) {
    // Redis.fromEnv() reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
    // automaticDeserialization: false ensures values pass through as opaque
    // strings instead of being silently JSON.parsed on read.
    this.redis = redis ?? Redis.fromEnv({ automaticDeserialization: false });
  }

  async get(key: string): Promise<string | null> {
    const result = await this.redis.get<string>(key);
    return result ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }
}
