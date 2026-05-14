/**
 * Tests for overpass/mergeAndDedupeById.ts — antimeridian merge + deduplication.
 */
import { describe, it, expect } from 'vitest';
import { mergeAndDedupeById } from './mergeAndDedupeById.js';
import type GeoJSON from 'geojson';

function makeFeature(id: GeoJSON.Feature['id'], extra: Partial<GeoJSON.Feature> = {}): GeoJSON.Feature {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: {},
    ...extra,
  };
}

function makeCollection(...features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

describe('mergeAndDedupeById', () => {
  it('returns a FeatureCollection', () => {
    const result = mergeAndDedupeById(makeCollection());
    expect(result.type).toBe('FeatureCollection');
    expect(Array.isArray(result.features)).toBe(true);
  });

  it('deduplicates features with overlapping ids — keeps first occurrence', () => {
    const f1 = makeFeature('way/123');
    const f2 = makeFeature('way/456');
    const f3 = makeFeature('way/123'); // duplicate

    const a = makeCollection(f1, f2);
    const b = makeCollection(f3);

    const result = mergeAndDedupeById(a, b);
    const ids = result.features.map((f) => f.id);
    expect(ids).toEqual(['way/123', 'way/456']);
    expect(result.features).toHaveLength(2);
  });

  it('keeps all features when ids are disjoint', () => {
    const a = makeCollection(makeFeature('way/1'), makeFeature('way/2'));
    const b = makeCollection(makeFeature('way/3'), makeFeature('relation/4'));

    const result = mergeAndDedupeById(a, b);
    expect(result.features).toHaveLength(4);
  });

  it('preserves all features without an id (no accidental collapse)', () => {
    const noId1 = makeFeature(undefined);
    const noId2 = makeFeature(undefined);
    const noId3 = makeFeature(undefined);

    const a = makeCollection(noId1, noId2);
    const b = makeCollection(noId3);

    const result = mergeAndDedupeById(a, b);
    // All three id-less features must survive
    expect(result.features).toHaveLength(3);
  });

  it('handles mix of id and no-id features correctly', () => {
    const withId1 = makeFeature('way/10');
    const withId2 = makeFeature('way/10'); // duplicate
    const noId = makeFeature(undefined);

    const a = makeCollection(withId1, noId);
    const b = makeCollection(withId2);

    const result = mergeAndDedupeById(a, b);
    // way/10 appears once, no-id feature preserved
    expect(result.features).toHaveLength(2);
    const hasWay10 = result.features.some((f) => f.id === 'way/10');
    const hasUndefinedId = result.features.some((f) => f.id === undefined);
    expect(hasWay10).toBe(true);
    expect(hasUndefinedId).toBe(true);
  });

  it('merges more than two collections', () => {
    const a = makeCollection(makeFeature('way/1'));
    const b = makeCollection(makeFeature('way/1'), makeFeature('way/2'));
    const c = makeCollection(makeFeature('way/2'), makeFeature('way/3'));

    const result = mergeAndDedupeById(a, b, c);
    const ids = result.features.map((f) => f.id);
    expect(ids).toEqual(['way/1', 'way/2', 'way/3']);
  });

  it('returns empty FeatureCollection for empty input', () => {
    const result = mergeAndDedupeById(makeCollection(), makeCollection());
    expect(result.features).toHaveLength(0);
  });

  it('treats numeric id 0 as no-id — preserves both without dedup (0 is falsy)', () => {
    // id 0 is falsy — treated like a missing id, so both are kept
    const f0a = makeFeature(0);
    const f0b = makeFeature(0);
    const result = mergeAndDedupeById(makeCollection(f0a), makeCollection(f0b));
    expect(result.features).toHaveLength(2);
  });
});
