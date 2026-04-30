/**
 * Tests for overpass/roads.ts — written BEFORE the implementation (TDD).
 *
 * Run: pnpm --filter @terrain/shared test
 */
import { describe, it, expect } from 'vitest';
import { roadsQuery } from './roads.js';
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
// roadsQuery
// ---------------------------------------------------------------------------

describe('roadsQuery', () => {
  it('includes the correct bbox:S,W,N,E substring (Overpass south,west,north,east order)', () => {
    const q = roadsQuery(LISBON);
    // Overpass bbox order: south, west, north, east
    expect(q).toContain('bbox:38.706,-9.155,38.726,-9.131');
  });

  it('uses the default timeout of 25 seconds', () => {
    const q = roadsQuery(LISBON);
    expect(q).toContain('[timeout:25]');
  });

  it('respects a custom timeout passed via opts', () => {
    const q = roadsQuery(LISBON, { timeout: 60 });
    expect(q).toContain('[timeout:60]');
    expect(q).not.toContain('[timeout:25]');
  });

  it('uses [out:json] format in the preamble', () => {
    const q = roadsQuery(LISBON);
    expect(q).toContain('[out:json]');
  });

  it('uses out body geom; for inline geometry', () => {
    const q = roadsQuery(LISBON);
    expect(q).toContain('out body geom;');
  });

  it('regex pattern contains required whitelisted highway classes', () => {
    const q = roadsQuery(LISBON);
    // Must include principal classes
    expect(q).toContain('motorway');
    expect(q).toContain('residential');
    expect(q).toContain('service');
    expect(q).toContain('primary');
    expect(q).toContain('secondary');
    expect(q).toContain('tertiary');
    expect(q).toContain('trunk');
  });

  it('regex pattern does NOT contain excluded highway classes', () => {
    const q = roadsQuery(LISBON);
    // footway and cycleway must NOT appear (they are excluded from the whitelist)
    // We check the regex string doesn't match these values
    // Extract the regex portions from the query
    const mainRegexMatch = q.match(/way\[highway~"([^"]+)"\]/g);
    expect(mainRegexMatch).toBeTruthy();
    const fullRegex = mainRegexMatch!.join(' ');
    expect(fullRegex).not.toContain('footway');
    expect(fullRegex).not.toContain('cycleway');
    expect(fullRegex).not.toContain('path');
    expect(fullRegex).not.toContain('track');
    expect(fullRegex).not.toContain('steps');
    expect(fullRegex).not.toContain('bridleway');
    expect(fullRegex).not.toContain('construction');
    expect(fullRegex).not.toContain('proposed');
    expect(fullRegex).not.toContain('raceway');
  });

  it('includes the _link selector for slip roads', () => {
    const q = roadsQuery(LISBON);
    // A separate selector for link variants must be present
    expect(q).toContain('motorway_link');
    expect(q).toContain('trunk_link');
    expect(q).toContain('primary_link');
  });

  it('throws on antimeridian-crossing bbox (west > east)', () => {
    const crossing: BoundingBox = { west: 170, south: -20, east: -170, north: -10 };
    expect(() => roadsQuery(crossing)).toThrow(/antimeridian/i);
  });
});
