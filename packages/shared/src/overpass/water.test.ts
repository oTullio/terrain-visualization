/**
 * Tests for overpass/water.ts — written BEFORE the implementation (TDD).
 *
 * Run: pnpm --filter @terrain/shared test
 */
import { describe, it, expect } from 'vitest';
import { waterQuery } from './water.js';
import type { BoundingBox } from '../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LISBON: BoundingBox = {
  west: -9.155,
  south: 38.706,
  east: -9.131,
  north: 38.726,
};

// ---------------------------------------------------------------------------
// waterQuery
// ---------------------------------------------------------------------------

describe('waterQuery', () => {
  it('includes the correct bbox:S,W,N,E substring (Overpass south,west,north,east order)', () => {
    const q = waterQuery(LISBON);
    // Overpass bbox order: south, west, north, east
    expect(q).toContain('bbox:38.706,-9.155,38.726,-9.131');
  });

  it('uses the default timeout of 25 seconds', () => {
    const q = waterQuery(LISBON);
    expect(q).toContain('[timeout:25]');
  });

  it('respects a custom timeout passed via opts', () => {
    const q = waterQuery(LISBON, { timeout: 60 });
    expect(q).toContain('[timeout:60]');
    expect(q).not.toContain('[timeout:25]');
  });

  it('selects way[natural=water]', () => {
    const q = waterQuery(LISBON);
    expect(q).toContain('way[natural=water]');
  });

  it('selects way[landuse=reservoir]', () => {
    const q = waterQuery(LISBON);
    expect(q).toContain('way[landuse=reservoir]');
  });

  it('selects way[waterway]', () => {
    const q = waterQuery(LISBON);
    expect(q).toContain('way[waterway]');
  });

  it('selects way[natural=coastline]', () => {
    const q = waterQuery(LISBON);
    expect(q).toContain('way[natural=coastline]');
  });

  it('selects relation[natural=water]', () => {
    const q = waterQuery(LISBON);
    expect(q).toContain('relation[natural=water]');
  });

  it('selects relation[landuse=reservoir]', () => {
    const q = waterQuery(LISBON);
    expect(q).toContain('relation[landuse=reservoir]');
  });

  it('uses [out:json] format in the preamble', () => {
    const q = waterQuery(LISBON);
    expect(q).toContain('[out:json]');
  });

  it('uses out body geom; for inline geometry', () => {
    const q = waterQuery(LISBON);
    expect(q).toContain('out body geom;');
  });

  it('throws on antimeridian-crossing bbox (west > east)', () => {
    const crossing: BoundingBox = { west: 170, south: -20, east: -170, north: -10 };
    expect(() => waterQuery(crossing)).toThrow(/antimeridian/i);
  });
});
