/**
 * Tests for overpass/convert.ts — generic Overpass → GeoJSON geometry helpers.
 */
import { describe, it, expect } from 'vitest';
import { snap6, geomToRing, ensureClosed, wayToPolygon, relationToMultiPolygon } from './convert.js';
import type { OverpassWayElement, OverpassRelationElement } from './convert.js';
import type GeoJSON from 'geojson';

// ---------------------------------------------------------------------------
// snap6
// ---------------------------------------------------------------------------

describe('snap6', () => {
  it('rounds to 6 decimal places', () => {
    expect(snap6(1.1234567)).toBe(1.123457);
    expect(snap6(1.1234564)).toBe(1.123456);
  });

  it('is a no-op for values already at 6dp', () => {
    expect(snap6(38.706123)).toBe(38.706123);
  });

  it('handles negative values', () => {
    expect(snap6(-9.1234567)).toBe(-9.123457);
  });
});

// ---------------------------------------------------------------------------
// geomToRing
// ---------------------------------------------------------------------------

describe('geomToRing', () => {
  it('converts lat/lon points to [lng, lat] GeoJSON positions with snapping', () => {
    const geom = [
      { lat: 38.7, lon: -9.1 },
      { lat: 38.8, lon: -9.0 },
    ];
    const ring = geomToRing(geom);
    expect(ring).toEqual([[-9.1, 38.7], [-9.0, 38.8]]);
  });

  it('snaps coordinates to 6dp', () => {
    const geom = [{ lat: 38.1234567, lon: -9.9876543 }];
    const ring = geomToRing(geom);
    expect(ring[0]).toEqual([-9.987654, 38.123457]);
  });
});

// ---------------------------------------------------------------------------
// ensureClosed
// ---------------------------------------------------------------------------

describe('ensureClosed', () => {
  it('adds closing point when ring is open', () => {
    const ring: GeoJSON.Position[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const result = ensureClosed(ring);
    expect(result[result.length - 1]).toEqual([0, 0]);
    expect(result).toHaveLength(5);
  });

  it('is idempotent when ring is already closed', () => {
    const ring: GeoJSON.Position[] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    const result = ensureClosed(ring);
    expect(result).toHaveLength(5);
    expect(result[result.length - 1]).toEqual([0, 0]);
  });

  it('mutates and returns the same array', () => {
    const ring: GeoJSON.Position[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const result = ensureClosed(ring);
    expect(result).toBe(ring);
  });
});

// ---------------------------------------------------------------------------
// wayToPolygon
// ---------------------------------------------------------------------------

// A ~100m × ~100m square around Lisbon (well above 4 m²)
const LISBON_SQUARE_GEOM = [
  { lat: 38.706, lon: -9.140 },
  { lat: 38.707, lon: -9.140 },
  { lat: 38.707, lon: -9.139 },
  { lat: 38.706, lon: -9.139 },
  // Note: not pre-closed; wayToPolygon should close it
];

describe('wayToPolygon', () => {
  const identity = (tags: Record<string, string> | undefined) => tags ?? {};

  it('converts a 4-vertex way to a closed Polygon Feature', () => {
    const el: OverpassWayElement = {
      type: 'way',
      id: 42,
      geometry: LISBON_SQUARE_GEOM,
      tags: { building: 'yes' },
    };
    const feature = wayToPolygon(el, identity);
    expect(feature).not.toBeNull();
    expect(feature!.type).toBe('Feature');
    expect(feature!.id).toBe('way/42');
    expect(feature!.geometry.type).toBe('Polygon');
    const coords = feature!.geometry.coordinates[0]!;
    // Ring should be closed (5 points for 4-vertex polygon)
    expect(coords).toHaveLength(5);
    expect(coords[0]).toEqual(coords[coords.length - 1]);
  });

  it('passes tags through the tagFilter', () => {
    const el: OverpassWayElement = {
      type: 'way',
      id: 1,
      geometry: LISBON_SQUARE_GEOM,
      tags: { building: 'yes', amenity: 'cafe' },
    };
    // Filter out amenity
    const feature = wayToPolygon(el, (tags) => {
      const { building } = tags ?? {};
      return building ? { building } : {};
    });
    expect(feature!.properties).toEqual({ building: 'yes' });
  });

  it('returns null for missing geometry', () => {
    const el: OverpassWayElement = { type: 'way', id: 1 };
    expect(wayToPolygon(el, identity)).toBeNull();
  });

  it('returns null for fewer than 4 geometry points', () => {
    const el: OverpassWayElement = {
      type: 'way',
      id: 1,
      geometry: [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, { lat: 0, lon: 1 }],
    };
    expect(wayToPolygon(el, identity)).toBeNull();
  });

  it('snaps coordinates to 6 decimal places', () => {
    const el: OverpassWayElement = {
      type: 'way',
      id: 99,
      geometry: [
        { lat: 38.1234567, lon: -9.9876543 },
        { lat: 38.1334567, lon: -9.9876543 },
        { lat: 38.1334567, lon: -9.9776543 },
        { lat: 38.1234567, lon: -9.9776543 },
      ],
    };
    const feature = wayToPolygon(el, identity);
    expect(feature).not.toBeNull();
    for (const [lng, lat] of feature!.geometry.coordinates[0]!) {
      const lngDp = String(lng).split('.')[1]?.length ?? 0;
      const latDp = String(lat).split('.')[1]?.length ?? 0;
      expect(lngDp).toBeLessThanOrEqual(6);
      expect(latDp).toBeLessThanOrEqual(6);
    }
  });
});

// ---------------------------------------------------------------------------
// relationToMultiPolygon
// ---------------------------------------------------------------------------

describe('relationToMultiPolygon', () => {
  const acceptAll = () => true;
  const identity = (tags: Record<string, string> | undefined) => tags ?? {};

  it('converts a relation with one outer ring to a Polygon Feature', () => {
    const el: OverpassRelationElement = {
      type: 'relation',
      id: 10,
      members: [
        {
          type: 'way',
          ref: 1,
          role: 'outer',
          geometry: LISBON_SQUARE_GEOM,
        },
      ],
      tags: { building: 'yes' },
    };
    const feature = relationToMultiPolygon(el, acceptAll, identity);
    expect(feature).not.toBeNull();
    expect(feature!.id).toBe('relation/10');
    expect(feature!.geometry.type).toBe('Polygon');
  });

  it('converts a relation with two outer rings to a MultiPolygon Feature', () => {
    const el: OverpassRelationElement = {
      type: 'relation',
      id: 20,
      members: [
        { type: 'way', ref: 1, role: 'outer', geometry: LISBON_SQUARE_GEOM },
        {
          type: 'way',
          ref: 2,
          role: 'outer',
          geometry: [
            { lat: 39.706, lon: -9.140 },
            { lat: 39.707, lon: -9.140 },
            { lat: 39.707, lon: -9.139 },
            { lat: 39.706, lon: -9.139 },
          ],
        },
      ],
      tags: {},
    };
    const feature = relationToMultiPolygon(el, acceptAll, identity);
    expect(feature).not.toBeNull();
    expect(feature!.geometry.type).toBe('MultiPolygon');
  });

  it('skips inner role members (holes are deferred)', () => {
    const el: OverpassRelationElement = {
      type: 'relation',
      id: 30,
      members: [
        { type: 'way', ref: 1, role: 'outer', geometry: LISBON_SQUARE_GEOM },
        {
          type: 'way',
          ref: 2,
          role: 'inner',
          geometry: [
            { lat: 38.7061, lon: -9.1399 },
            { lat: 38.7062, lon: -9.1399 },
            { lat: 38.7062, lon: -9.1398 },
            { lat: 38.7061, lon: -9.1398 },
          ],
        },
      ],
    };
    const feature = relationToMultiPolygon(el, acceptAll, identity);
    // Should still produce a Polygon (only outer ring)
    expect(feature!.geometry.type).toBe('Polygon');
  });

  it('returns null when no members pass the ringFilter', () => {
    const el: OverpassRelationElement = {
      type: 'relation',
      id: 40,
      members: [
        { type: 'way', ref: 1, role: 'outer', geometry: LISBON_SQUARE_GEOM },
      ],
    };
    const rejectAll = () => false;
    expect(relationToMultiPolygon(el, rejectAll, identity)).toBeNull();
  });

  it('returns null when there are no members', () => {
    const el: OverpassRelationElement = { type: 'relation', id: 50 };
    expect(relationToMultiPolygon(el, acceptAll, identity)).toBeNull();
  });
});
