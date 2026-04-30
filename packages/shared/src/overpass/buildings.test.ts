/**
 * Tests for overpass/buildings.ts — written BEFORE the implementation (TDD).
 *
 * Run: pnpm --filter @terrain/shared test
 */
import { describe, it, expect } from 'vitest';
import { buildingsQuery } from './buildings.js';
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
// buildingsQuery
// ---------------------------------------------------------------------------

describe('buildingsQuery', () => {
  it('includes the correct bbox:S,W,N,E substring (Overpass south,west,north,east order)', () => {
    const q = buildingsQuery(LISBON);
    // Overpass bbox order: south, west, north, east
    expect(q).toContain('bbox:38.706,-9.155,38.726,-9.131');
  });

  it('uses the default timeout of 25 seconds', () => {
    const q = buildingsQuery(LISBON);
    expect(q).toContain('[timeout:25]');
  });

  it('respects a custom timeout passed via opts', () => {
    const q = buildingsQuery(LISBON, { timeout: 60 });
    expect(q).toContain('[timeout:60]');
    expect(q).not.toContain('[timeout:25]');
  });

  it('selects way[building]', () => {
    const q = buildingsQuery(LISBON);
    expect(q).toContain('way[building]');
  });

  it('selects way[building:part]', () => {
    const q = buildingsQuery(LISBON);
    expect(q).toContain('way["building:part"]');
  });

  it('selects relation[building]', () => {
    const q = buildingsQuery(LISBON);
    expect(q).toContain('relation[building]');
  });

  it('uses out body geom; for inline geometry', () => {
    const q = buildingsQuery(LISBON);
    expect(q).toContain('out body geom;');
  });

  it('throws on antimeridian-crossing bbox (west > east)', () => {
    const crossing: BoundingBox = { west: 170, south: -20, east: -170, north: -10 };
    expect(() => buildingsQuery(crossing)).toThrow(/antimeridian/i);
  });

  it('uses [out:json] format in the preamble', () => {
    const q = buildingsQuery(LISBON);
    expect(q).toContain('[out:json]');
  });
});
