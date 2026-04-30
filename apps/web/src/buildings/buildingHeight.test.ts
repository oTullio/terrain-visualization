import { describe, it, expect } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import {
  buildingHeight,
  parseMetres,
  DEFAULT_HEIGHT_M,
  METRES_PER_LEVEL,
  MAX_HEIGHT_M,
  MIN_HEIGHT_M,
} from './buildingHeight.js';

function feature(properties: Record<string, unknown>): Feature<Polygon> {
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    },
  };
}

describe('parseMetres', () => {
  it('parses bare numbers', () => {
    expect(parseMetres(12)).toBe(12);
    expect(parseMetres(12.5)).toBe(12.5);
    expect(parseMetres('12')).toBe(12);
    expect(parseMetres('35.5')).toBe(35.5);
  });

  it('strips trailing units like " m"', () => {
    expect(parseMetres('12 m')).toBe(12);
    expect(parseMetres('  35.5 m  ')).toBe(35.5);
  });

  it('extracts the first number from messy strings', () => {
    expect(parseMetres('approx. 8')).toBe(8);
  });

  it('rejects non-numeric, infinite, NaN, and negative values', () => {
    expect(parseMetres('tall')).toBeNull();
    expect(parseMetres('')).toBeNull();
    expect(parseMetres(null)).toBeNull();
    expect(parseMetres(undefined)).toBeNull();
    expect(parseMetres(NaN)).toBeNull();
    expect(parseMetres(Infinity)).toBeNull();
    expect(parseMetres(-1)).toBeNull();
  });
});

describe('buildingHeight', () => {
  it('uses properties.height when present and positive', () => {
    expect(buildingHeight(feature({ height: 18 }))).toEqual({ height: 18, baseHeight: 0 });
  });

  it('parses string height values like "12 m"', () => {
    expect(buildingHeight(feature({ height: '12 m' }))).toEqual({
      height: 12,
      baseHeight: 0,
    });
  });

  it('falls back to building:levels × 3 m when height is missing', () => {
    expect(buildingHeight(feature({ 'building:levels': 4 }))).toEqual({
      height: 4 * METRES_PER_LEVEL,
      baseHeight: 0,
    });
  });

  it('uses default when height and levels are both missing', () => {
    expect(buildingHeight(feature({}))).toEqual({
      height: DEFAULT_HEIGHT_M,
      baseHeight: 0,
    });
  });

  it('applies min_height as baseHeight when valid', () => {
    expect(buildingHeight(feature({ height: 30, min_height: 10 }))).toEqual({
      height: 30,
      baseHeight: 10,
    });
  });

  it('ignores min_height that is >= height (malformed)', () => {
    expect(buildingHeight(feature({ height: 10, min_height: 15 }))).toEqual({
      height: 10,
      baseHeight: 0,
    });
  });

  it('caps obscenely large heights at MAX_HEIGHT_M', () => {
    expect(buildingHeight(feature({ height: 10000 })).height).toBe(MAX_HEIGHT_M);
  });

  it('clamps height=0 / negative-only data up to the default and then to MIN_HEIGHT_M', () => {
    // height=0 is treated as "no useful tag" so we fall to default
    expect(buildingHeight(feature({ height: 0 })).height).toBe(DEFAULT_HEIGHT_M);
  });

  it('handles "approx. 8" gracefully', () => {
    expect(buildingHeight(feature({ height: 'approx. 8' }))).toEqual({
      height: 8,
      baseHeight: 0,
    });
  });

  it('handles missing properties object', () => {
    const f: Feature<Polygon> = {
      type: 'Feature',
      properties: null,
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    };
    expect(buildingHeight(f)).toEqual({ height: DEFAULT_HEIGHT_M, baseHeight: 0 });
  });

  it('never returns NaN, Infinity, or negative numbers', () => {
    const cases = [
      feature({ height: 'tall' }),
      feature({ height: -5 }),
      feature({ height: NaN }),
      feature({ height: Infinity }),
      feature({ 'building:levels': -2 }),
    ];
    for (const f of cases) {
      const { height, baseHeight } = buildingHeight(f);
      expect(Number.isFinite(height)).toBe(true);
      expect(Number.isFinite(baseHeight)).toBe(true);
      expect(height).toBeGreaterThanOrEqual(MIN_HEIGHT_M);
      expect(baseHeight).toBeGreaterThanOrEqual(0);
    }
  });
});
