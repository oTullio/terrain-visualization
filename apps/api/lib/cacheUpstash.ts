/**
 * Upstash Redis REST client cache implementation for production.
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
 *
 * Uses @upstash/redis ^1.34.9 — `set` with `{ ex: ttlSeconds }` for TTL.
 */
import { Redis } from '@upstash/redis';
import type { Cache } from './cache.js';

export class UpstashCache implements Cache {
  private readonly redis: Redis;

  constructor() {
    // Redis.fromEnv() reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
    this.redis = Redis.fromEnv();
  }

  async get(key: string): Promise<string | null> {
    const result = await this.redis.get<string>(key);
    return result ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }
}
