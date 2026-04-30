/**
 * Tests for cap.ts — written BEFORE the implementation (TDD).
 */
import { describe, it, expect } from 'vitest';
import type GeoJSON from 'geojson';
import { MAX_SELECTION_SQ_KM, isWithinCap } from './cap.js';

/** Build a rectangular GeoJSON Polygon that has approximately the given area in km². */
function approxKmSquarePolygon(areaSqKm: number): GeoJSON.Polygon {
  // Place it at equator. 1° ≈ 111.32 km, so side = sqrt(areaSqKm) km.
  const side = Math.sqrt(areaSqKm);
  const delta = side / 111.32;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [delta, 0],
        [delta, delta],
        [0, delta],
        [0, 0],
      ],
    ],
  };
}

describe('MAX_SELECTION_SQ_KM', () => {
  it('is exactly 100', () => {
    expect(MAX_SELECTION_SQ_KM).toBe(100);
  });
});

describe('isWithinCap', () => {
  it('returns { ok: true } for a ~50 km² polygon', () => {
    const poly = approxKmSquarePolygon(50);
    const result = isWithinCap(poly);
    expect(result.ok).toBe(true);
  });

  it('returns { ok: false, areaSqKm, capSqKm } for a ~200 km² polygon', () => {
    const poly = approxKmSquarePolygon(200);
    const result = isWithinCap(poly);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Area should be approximately 200 km² (within ±10% due to approximation)
      expect(result.areaSqKm).toBeGreaterThan(170);
      expect(result.areaSqKm).toBeLessThan(230);
      expect(result.capSqKm).toBe(MAX_SELECTION_SQ_KM);
      expect(result.capSqKm).toBe(100);
    }
  });

  it('returns { ok: false } for a polygon exactly above cap', () => {
    // 101 km² polygon
    const poly = approxKmSquarePolygon(101);
    const result = isWithinCap(poly);
    expect(result.ok).toBe(false);
  });

  it('returns { ok: true } for a tiny polygon', () => {
    const poly = approxKmSquarePolygon(1);
    const result = isWithinCap(poly);
    expect(result.ok).toBe(true);
  });
});
