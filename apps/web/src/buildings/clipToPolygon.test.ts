import { describe, it, expect } from 'vitest';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { clipFeaturesToPolygon } from './clipToPolygon.js';

/** Build a unit square polygon centered on (cx, cy). */
function squareAt(cx: number, cy: number, size = 0.001): Feature<Polygon> {
  const h = size / 2;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [cx - h, cy - h],
          [cx + h, cy - h],
          [cx + h, cy + h],
          [cx - h, cy + h],
          [cx - h, cy - h],
        ],
      ],
    },
  };
}

function fc(features: Feature<Polygon | MultiPolygon>[]): FeatureCollection<Polygon | MultiPolygon> {
  return { type: 'FeatureCollection', features };
}

const CLIP_POLYGON: Polygon = {
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
};

describe('clipFeaturesToPolygon', () => {
  it('returns the input unchanged when polygon is null', () => {
    const input = fc([squareAt(5, 5), squareAt(10, 10)]);
    const result = clipFeaturesToPolygon(input, null);
    expect(result).toBe(input);
  });

  it('returns an empty FC unchanged', () => {
    const input = fc([]);
    const result = clipFeaturesToPolygon(input, CLIP_POLYGON);
    expect(result.features).toEqual([]);
    expect(result.type).toBe('FeatureCollection');
  });

  it('keeps features whose centroid is inside the polygon', () => {
    const inside = [
      squareAt(0.1, 0.1),
      squareAt(0.5, 0.5),
      squareAt(0.9, 0.5),
      squareAt(0.3, 0.7),
    ];
    const outside = [
      squareAt(2, 2),
      squareAt(-1, 0.5),
      squareAt(0.5, -1),
      squareAt(5, 5),
    ];
    const result = clipFeaturesToPolygon(fc([...inside, ...outside]), CLIP_POLYGON);
    expect(result.features).toHaveLength(4);
  });

  it('returns a FeatureCollection (not the original) when filtering', () => {
    const input = fc([squareAt(0.5, 0.5), squareAt(5, 5)]);
    const result = clipFeaturesToPolygon(input, CLIP_POLYGON);
    expect(result).not.toBe(input);
    expect(result.type).toBe('FeatureCollection');
    expect(result.features).toHaveLength(1);
  });
});
