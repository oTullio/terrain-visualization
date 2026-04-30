/**
 * Tests for bboxKey.ts — coordinate snapping and cache-key format.
 */
import { describe, it, expect } from 'vitest';
import { bboxCacheKey } from './bboxKey.js';
import type { BoundingBox } from '@terrain/shared';

describe('bboxCacheKey', () => {
  it('formats key as prefix:S,W,N,E snapped to 5 decimal places', () => {
    const bbox: BoundingBox = {
      west: -9.155,
      south: 38.706,
      east: -9.131,
      north: 38.726,
    };
    const key = bboxCacheKey('buildings', bbox);
    expect(key).toBe('buildings:38.706,-9.155,38.726,-9.131');
  });

  it('snaps noisy coords to 5 decimal places', () => {
    const bbox: BoundingBox = {
      west: -9.1550001,
      south: 38.7060009,
      east: -9.1310001,
      north: 38.7260009,
    };
    const key = bboxCacheKey('buildings', bbox);
    expect(key).toBe('buildings:38.706,-9.155,38.726,-9.131');
  });

  it('works with different prefixes', () => {
    const bbox: BoundingBox = { west: 0, south: 0, east: 1, north: 1 };
    expect(bboxCacheKey('roads', bbox)).toMatch(/^roads:/);
    expect(bboxCacheKey('water', bbox)).toMatch(/^water:/);
  });

  it('includes all four coordinates in the key', () => {
    const bbox: BoundingBox = {
      west: -9.12345,
      south: 38.71234,
      east: -9.09876,
      north: 38.74567,
    };
    const key = bboxCacheKey('buildings', bbox);
    expect(key).toBe('buildings:38.71234,-9.12345,38.74567,-9.09876');
  });

  it('handles negative coordinates correctly', () => {
    const bbox: BoundingBox = {
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    };
    const key = bboxCacheKey('buildings', bbox);
    expect(key).toBe('buildings:-90,-180,90,180');
  });
});
