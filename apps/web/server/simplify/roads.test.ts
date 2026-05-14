/**
 * Tests for simplify/roads.ts — Overpass JSON → GeoJSON road features.
 *
 * Fixture-based: all element types are present in overpassRoadsSample.json.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { simplifyRoads } from './roads.js';

const require = createRequire(import.meta.url);
const fixture = require('../__fixtures__/overpassRoadsSample.json') as unknown;

describe('simplifyRoads', () => {
  it('returns a GeoJSON FeatureCollection', () => {
    const result = simplifyRoads(fixture);
    expect(result.type).toBe('FeatureCollection');
    expect(Array.isArray(result.features)).toBe(true);
  });

  it('converts a highway way to a LineString feature', () => {
    // way/4001 has highway=primary with a valid 3-point geometry
    const result = simplifyRoads(fixture);
    const f = result.features.find((feat) => feat.id === 'way/4001');
    expect(f).toBeDefined();
    expect(f!.geometry.type).toBe('LineString');
  });

  it('drops linestrings shorter than 5 m', () => {
    // way/4003 has only 2 nodes ~1 m apart — should be filtered out
    const result = simplifyRoads(fixture);
    const ids = result.features.map((f) => f.id);
    expect(ids).not.toContain('way/4003');
  });

  it('drops relation elements (route relations are out of scope)', () => {
    // relation/5001 is a bus route relation — must be dropped
    const result = simplifyRoads(fixture);
    const ids = result.features.map((f) => f.id);
    expect(ids).not.toContain('relation/5001');
  });

  it('applies the tag whitelist and strips non-whitelisted tags', () => {
    // way/4001 has amenity=drop_this_tag which is NOT in the roads whitelist
    const result = simplifyRoads(fixture);
    const f = result.features.find((feat) => feat.id === 'way/4001');
    expect(f).toBeDefined();
    const props = f!.properties!;
    expect(props['highway']).toBe('primary');
    expect(props['name']).toBe('Avenida Principal');
    expect(props['lanes']).toBe('2');
    expect(props['oneway']).toBe('yes');
    expect(props['maxspeed']).toBe('50');
    expect(props['surface']).toBe('asphalt');
    expect(props['amenity']).toBeUndefined();
  });

  it('keeps motorway_link ways as LineString features', () => {
    // way/4004 has highway=motorway_link with bridge and layer tags
    const result = simplifyRoads(fixture);
    const f = result.features.find((feat) => feat.id === 'way/4004');
    expect(f).toBeDefined();
    expect(f!.geometry.type).toBe('LineString');
    const props = f!.properties!;
    expect(props['highway']).toBe('motorway_link');
    expect(props['bridge']).toBe('yes');
    expect(props['layer']).toBe('1');
  });

  it('returns an empty FeatureCollection for empty Overpass input', () => {
    const emptyInput = { elements: [] };
    const result = simplifyRoads(emptyInput);
    expect(result.type).toBe('FeatureCollection');
    expect(result.features).toHaveLength(0);
  });
});
