/**
 * Tests for bbox.ts — written BEFORE the implementation (TDD).
 */
import { describe, it, expect } from 'vitest';
import type GeoJSON from 'geojson';
import {
  bboxFromPolygon,
  splitAtAntimeridian,
  geodesicAreaSqKm,
  bboxToPolygon,
} from './bbox.js';
import type { BoundingBox } from '../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a simple rectangular GeoJSON Polygon from corner coords. */
function rectPolygon(west: number, south: number, east: number, north: number): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

// ---------------------------------------------------------------------------
// bboxFromPolygon
// ---------------------------------------------------------------------------

describe('bboxFromPolygon', () => {
  it('returns correct bbox for a simple polygon', () => {
    const poly = rectPolygon(10, 20, 30, 40);
    const bbox = bboxFromPolygon(poly);
    expect(bbox.west).toBeCloseTo(10);
    expect(bbox.south).toBeCloseTo(20);
    expect(bbox.east).toBeCloseTo(30);
    expect(bbox.north).toBeCloseTo(40);
  });

  it('returns correct bbox for a high-latitude polygon near North Pole', () => {
    const poly = rectPolygon(-5, 85, 5, 89);
    const bbox = bboxFromPolygon(poly);
    expect(bbox.west).toBeCloseTo(-5);
    expect(bbox.south).toBeCloseTo(85);
    expect(bbox.east).toBeCloseTo(5);
    expect(bbox.north).toBeCloseTo(89);
  });

  it('detects antimeridian crossing and returns west > east', () => {
    // Island chain spanning the antimeridian: e.g. from +170 to -170 (going east).
    // We represent this as a polygon whose longitudes jump from +179 to -179.
    const crossingPoly: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [170, -20],
          [179, -20],
          [-179, -20], // jumps from +179 to -179 — crossing antimeridian
          [-170, -20],
          [-170, -10],
          [-179, -10],
          [179, -10],
          [170, -10],
          [170, -20],
        ],
      ],
    };
    const bbox = bboxFromPolygon(crossingPoly);
    // Antimeridian-crossing bbox: west > east by convention
    expect(bbox.west).toBeGreaterThan(bbox.east);
    expect(bbox.west).toBeCloseTo(170);
    expect(bbox.east).toBeCloseTo(-170);
    expect(bbox.south).toBeCloseTo(-20);
    expect(bbox.north).toBeCloseTo(-10);
  });

  it('detects antimeridian crossing in the reverse direction (-179 → +179)', () => {
    // Polygon whose vertices go from -179 to +179 (crossing antimeridian eastward).
    const reverseCrossPoly: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-170, -20],
          [-179, -20],
          [179, -20], // jumps from -179 to +179 — crossing antimeridian in reverse
          [170, -20],
          [170, -10],
          [179, -10],
          [-179, -10],
          [-170, -10],
          [-170, -20],
        ],
      ],
    };
    const bbox = bboxFromPolygon(reverseCrossPoly);
    // Antimeridian-crossing bbox: west > east by convention
    expect(bbox.west).toBeGreaterThan(bbox.east);
    expect(bbox.west).toBeCloseTo(170);
    expect(bbox.east).toBeCloseTo(-170);
    expect(bbox.south).toBeCloseTo(-20);
    expect(bbox.north).toBeCloseTo(-10);
  });

  it('handles a non-rectangular polygon correctly', () => {
    // Triangle: (0,0), (10,0), (5,10)
    const tri: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[[0, 0], [10, 0], [5, 10], [0, 0]]],
    };
    const bbox = bboxFromPolygon(tri);
    expect(bbox.west).toBeCloseTo(0);
    expect(bbox.south).toBeCloseTo(0);
    expect(bbox.east).toBeCloseTo(10);
    expect(bbox.north).toBeCloseTo(10);
  });
});

// ---------------------------------------------------------------------------
// splitAtAntimeridian
// ---------------------------------------------------------------------------

describe('splitAtAntimeridian', () => {
  it('returns [input] for a non-crossing bbox', () => {
    const bbox: BoundingBox = { west: 10, south: 20, east: 30, north: 40 };
    const result = splitAtAntimeridian(bbox);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(bbox);
  });

  it('splits a crossing bbox into two halves with correct east/west bounds', () => {
    // Crossing bbox: west=170, east=-170 → [170,180] and [-180,-170]
    const bbox: BoundingBox = { west: 170, south: -20, east: -170, north: -10 };
    const parts = splitAtAntimeridian(bbox);
    expect(parts).toHaveLength(2);

    // Western half: from bbox.west to 180
    const western = parts.find((b) => b.east === 180);
    expect(western).toBeDefined();
    expect(western!.west).toBeCloseTo(170);
    expect(western!.south).toBeCloseTo(-20);
    expect(western!.north).toBeCloseTo(-10);

    // Eastern half: from -180 to bbox.east
    const eastern = parts.find((b) => b.west === -180);
    expect(eastern).toBeDefined();
    expect(eastern!.east).toBeCloseTo(-170);
    expect(eastern!.south).toBeCloseTo(-20);
    expect(eastern!.north).toBeCloseTo(-10);
  });

  it('is idempotent: already-split sub-bboxes are not crossing', () => {
    const sub1: BoundingBox = { west: 170, south: -20, east: 180, north: -10 };
    const sub2: BoundingBox = { west: -180, south: -20, east: -170, north: -10 };

    // Neither sub-bbox is crossing (west < east), so splitAtAntimeridian returns each as-is.
    expect(splitAtAntimeridian(sub1)).toHaveLength(1);
    expect(splitAtAntimeridian(sub2)).toHaveLength(1);
  });

  it('returns [input] unchanged for a wide bbox with west < east (not a crossing)', () => {
    // west=-170, east=170: west < east so this is NOT a crossing bbox.
    // splitAtAntimeridian must return [input] unchanged.
    const bbox: BoundingBox = { west: -170, south: -20, east: 170, north: -10 };
    const result = splitAtAntimeridian(bbox);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(bbox);
  });
});

// ---------------------------------------------------------------------------
// geodesicAreaSqKm
// ---------------------------------------------------------------------------

describe('geodesicAreaSqKm', () => {
  /**
   * 1 km × 1 km square at the equator.
   * 1° of latitude ≈ 111.32 km, 1° of longitude at equator ≈ 111.32 km.
   * So Δlat ≈ Δlng ≈ 0.008993° for 1 km at equator.
   */
  it('returns ~1 km² for a ~1 km² square at the equator', () => {
    const delta = 1 / 111.32; // approx degrees per km at equator
    const poly = rectPolygon(0, 0, delta, delta);
    const area = geodesicAreaSqKm(poly);
    expect(area).toBeGreaterThan(0.9);
    expect(area).toBeLessThan(1.1);
  });

  it('returns ~1 km² for a ~1 km² square at 60° latitude (geodesic, not naïve)', () => {
    // At 60° lat, 1° longitude ≈ 55.66 km. So 1 km Δlng ≈ 0.01796°.
    // 1° latitude ≈ 111.32 km still. So 1 km Δlat ≈ 0.008993°.
    const deltaLat = 1 / 111.32;
    const deltaLng = 1 / (111.32 * Math.cos((60 * Math.PI) / 180));
    const poly = rectPolygon(0, 60, deltaLng, 60 + deltaLat);
    const area = geodesicAreaSqKm(poly);
    // Turf gives geodesic area — should be ~1 km²
    expect(area).toBeGreaterThan(0.85);
    expect(area).toBeLessThan(1.15);
  });

  it('returns ~4 km² for a ~2×2 km square near central Lisbon (within ±5%)', () => {
    // Lisbon approx: 38.72°N, -9.14°E
    // 1° lat ≈ 111.32 km; 1° lon at 38.72° ≈ 111.32 × cos(38.72°) ≈ 86.8 km
    // 2 km Δlat ≈ 0.01797°; 2 km Δlon ≈ 0.02304°
    const deltaLat = 2 / 111.32;
    const deltaLng = 2 / (111.32 * Math.cos((38.72 * Math.PI) / 180));
    const poly = rectPolygon(-9.14, 38.72, -9.14 + deltaLng, 38.72 + deltaLat);
    const area = geodesicAreaSqKm(poly);
    expect(area).toBeGreaterThan(4 * 0.95);
    expect(area).toBeLessThan(4 * 1.05);
  });
});

// ---------------------------------------------------------------------------
// bboxToPolygon
// ---------------------------------------------------------------------------

describe('bboxToPolygon', () => {
  it('produces a closed ring with 5 points', () => {
    const bbox: BoundingBox = { west: 10, south: 20, east: 30, north: 40 };
    const poly = bboxToPolygon(bbox);
    expect(poly.type).toBe('Polygon');
    expect(poly.coordinates).toHaveLength(1);
    const ring = poly.coordinates[0]!;
    expect(ring).toHaveLength(5);
    // First and last point must be equal (closed ring)
    expect(ring[0]).toEqual(ring[4]);
  });

  it('round-trips: bboxFromPolygon(bboxToPolygon(b)) ≈ b for non-crossing bboxes', () => {
    const original: BoundingBox = { west: -10, south: -5, east: 20, north: 15 };
    const poly = bboxToPolygon(original);
    const recovered = bboxFromPolygon(poly);
    expect(recovered.west).toBeCloseTo(original.west);
    expect(recovered.south).toBeCloseTo(original.south);
    expect(recovered.east).toBeCloseTo(original.east);
    expect(recovered.north).toBeCloseTo(original.north);
  });

  it('throws on antimeridian-crossing input', () => {
    const crossing: BoundingBox = { west: 170, south: -20, east: -170, north: -10 };
    expect(() => bboxToPolygon(crossing)).toThrow(/antimeridian/i);
  });
});
