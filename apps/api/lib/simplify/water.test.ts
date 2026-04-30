/**
 * Tests for simplify/water.ts — Overpass JSON → GeoJSON water features.
 *
 * Fixture-based: each element type is present in overpassWaterSample.json.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { simplifyWater } from './water.js';

const require = createRequire(import.meta.url);
const fixture = require('../__fixtures__/overpassWaterSample.json') as unknown;

describe('simplifyWater', () => {
  it('returns a GeoJSON FeatureCollection', () => {
    const result = simplifyWater(fixture);
    expect(result.type).toBe('FeatureCollection');
    expect(Array.isArray(result.features)).toBe(true);
  });

  it('converts a natural=water way to a Polygon feature', () => {
    // way/2001 has natural=water and is a large closed way
    const result = simplifyWater(fixture);
    const f = result.features.find((feat) => feat.id === 'way/2001');
    expect(f).toBeDefined();
    expect(f!.geometry.type).toBe('Polygon');
  });

  it('converts a waterway (stream) way to a LineString feature', () => {
    // way/2002 has waterway=stream
    const result = simplifyWater(fixture);
    const f = result.features.find((feat) => feat.id === 'way/2002');
    expect(f).toBeDefined();
    expect(f!.geometry.type).toBe('LineString');
  });

  it('converts a waterway=riverbank way to a Polygon feature', () => {
    // way/2005 has waterway=riverbank — should be polygon, not linestring
    const result = simplifyWater(fixture);
    const f = result.features.find((feat) => feat.id === 'way/2005');
    expect(f).toBeDefined();
    expect(f!.geometry.type).toBe('Polygon');
  });

  it('converts a relation[natural=water] to a Polygon/MultiPolygon feature', () => {
    // relation/3001 has natural=water with outer ring
    const result = simplifyWater(fixture);
    const f = result.features.find((feat) => feat.id === 'relation/3001');
    expect(f).toBeDefined();
    expect(['Polygon', 'MultiPolygon']).toContain(f!.geometry.type);
  });

  it('drops polygons with area < 100 m² (tiny pond)', () => {
    // way/2003 is a tiny ~1 m² square — should be filtered out
    const result = simplifyWater(fixture);
    const ids = result.features.map((f) => f.id);
    expect(ids).not.toContain('way/2003');
  });

  it('drops linestrings shorter than 5 m (tiny drain)', () => {
    // way/2004 is approximately 1 m in length — should be filtered out
    const result = simplifyWater(fixture);
    const ids = result.features.map((f) => f.id);
    expect(ids).not.toContain('way/2004');
  });

  it('applies the tag whitelist and strips non-whitelisted tags', () => {
    // way/2001 has amenity=drop_this which is NOT in the water whitelist
    const result = simplifyWater(fixture);
    const f = result.features.find((feat) => feat.id === 'way/2001');
    expect(f).toBeDefined();
    const props = f!.properties!;
    expect(props['natural']).toBe('water');
    expect(props['water']).toBe('lake');
    expect(props['name']).toBe('Pond A');
    expect(props['amenity']).toBeUndefined();
  });

  it('returns an empty FeatureCollection for empty Overpass input', () => {
    const emptyInput = { elements: [] };
    const result = simplifyWater(emptyInput);
    expect(result.type).toBe('FeatureCollection');
    expect(result.features).toHaveLength(0);
  });

  it('keeps whitelisted waterway tags (tunnel, intermittent)', () => {
    // way/2002 has waterway + tunnel=no
    const result = simplifyWater(fixture);
    const f = result.features.find((feat) => feat.id === 'way/2002');
    expect(f).toBeDefined();
    const props = f!.properties!;
    expect(props['waterway']).toBe('stream');
    expect(props['tunnel']).toBe('no');
    expect(props['name']).toBe('Test Stream');
  });
});
