/**
 * Tests for simplify.ts — Overpass JSON → GeoJSON, tiny-feature filter,
 * coordinate snapping, and tag whitelist.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import type GeoJSON from 'geojson';
import { simplifyBuildings } from './simplify.js';

const require = createRequire(import.meta.url);
const fixture = require('./__fixtures__/overpassSample.json') as unknown;

describe('simplifyBuildings', () => {
  it('returns a GeoJSON FeatureCollection', () => {
    const result = simplifyBuildings(fixture);
    expect(result.type).toBe('FeatureCollection');
    expect(Array.isArray(result.features)).toBe(true);
  });

  it('filters out tiny polygons (area <= 4 m²)', () => {
    // way 1002 in the fixture is a 0.00001° × 0.00001° square — effectively < 1 m²
    // way 1001 and 1003 are ~100 m × ~100 m squares, well above 4 m²
    const result = simplifyBuildings(fixture);
    // IDs 1001 and 1003 should survive; 1002 should be filtered
    const ids = result.features.map((f) => f.id);
    expect(ids).toContain('way/1001');
    expect(ids).toContain('way/1003');
    expect(ids).not.toContain('way/1002');
  });

  it('snaps coordinates to 6 decimal places', () => {
    const result = simplifyBuildings(fixture);
    const feature = result.features.find((f) => f.id === 'way/1001');
    expect(feature).toBeDefined();
    const coords = (feature!.geometry as GeoJSON.Polygon).coordinates[0]!;
    for (const [lng, lat] of coords) {
      // Both should have at most 6 decimal places
      const lngStr = String(lng);
      const latStr = String(lat);
      const lngDecimals = lngStr.includes('.') ? lngStr.split('.')[1]!.length : 0;
      const latDecimals = latStr.includes('.') ? latStr.split('.')[1]!.length : 0;
      expect(lngDecimals).toBeLessThanOrEqual(6);
      expect(latDecimals).toBeLessThanOrEqual(6);
    }
  });

  it('preserves whitelisted tags and drops non-whitelisted tags', () => {
    const result = simplifyBuildings(fixture);
    const feature = result.features.find((f) => f.id === 'way/1001');
    expect(feature).toBeDefined();
    const props = feature!.properties!;

    // Whitelisted tags that are in the fixture
    expect(props['building']).toBe('yes');
    expect(props['height']).toBe('12');
    expect(props['building:levels']).toBe('4');
    expect(props['name']).toBe('Test Building A');

    // Non-whitelisted tags must be absent
    expect(props['amenity']).toBeUndefined();
    expect(props['addr:street']).toBeUndefined();
  });

  it('preserves building:part tag', () => {
    const result = simplifyBuildings(fixture);
    const feature = result.features.find((f) => f.id === 'way/1003');
    expect(feature).toBeDefined();
    const props = feature!.properties!;
    expect(props['building:part']).toBe('yes');
    expect(props['min_height']).toBe('10');
    expect(props['roof:shape']).toBe('flat');
  });

  it('returns an empty FeatureCollection for empty Overpass input', () => {
    const emptyInput = { elements: [] };
    const result = simplifyBuildings(emptyInput);
    expect(result.type).toBe('FeatureCollection');
    expect(result.features).toHaveLength(0);
  });
});
