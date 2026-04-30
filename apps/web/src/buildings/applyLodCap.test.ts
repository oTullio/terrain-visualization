import { describe, it, expect } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import { applyLodCap } from './applyLodCap.js';

/** A roughly-square polygon at lng/lat (0,0) with the requested edge length in degrees. */
function squareOfSize(sizeDeg: number, id: number): Feature<Polygon> {
  const h = sizeDeg / 2;
  return {
    type: 'Feature',
    properties: { id },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-h, -h],
          [h, -h],
          [h, h],
          [-h, h],
          [-h, -h],
        ],
      ],
    },
  };
}

describe('applyLodCap', () => {
  it('returns input unchanged when below the cap', () => {
    const features = [squareOfSize(0.001, 1), squareOfSize(0.002, 2), squareOfSize(0.003, 3)];
    const result = applyLodCap(features, { maxFeatures: 10, rankBy: 'area' });
    expect(result.kept).toHaveLength(3);
    expect(result.dropped).toBe(0);
  });

  it('caps at maxFeatures and reports dropped count', () => {
    const features = Array.from({ length: 100 }, (_, i) => squareOfSize(0.0001 * (i + 1), i));
    const result = applyLodCap(features, { maxFeatures: 25, rankBy: 'area' });
    expect(result.kept).toHaveLength(25);
    expect(result.dropped).toBe(75);
  });

  it('keeps the largest features (sort by area DESC)', () => {
    const features = Array.from({ length: 10 }, (_, i) =>
      // Larger ids → larger sizes
      squareOfSize(0.0001 * (i + 1), i),
    );
    const result = applyLodCap(features, { maxFeatures: 3, rankBy: 'area' });
    const ids = result.kept.map((f) => f.properties?.id as number);
    // Top 3 largest are ids 9, 8, 7
    expect(ids).toEqual([9, 8, 7]);
  });

  it('is deterministic across runs', () => {
    const features = Array.from({ length: 50 }, (_, i) => squareOfSize(0.0001 * (i + 1), i));
    const a = applyLodCap(features, { maxFeatures: 10, rankBy: 'area' });
    const b = applyLodCap(features, { maxFeatures: 10, rankBy: 'area' });
    expect(a.kept.map((f) => f.properties?.id)).toEqual(
      b.kept.map((f) => f.properties?.id),
    );
  });

  it('handles empty input', () => {
    const result = applyLodCap([], { maxFeatures: 100, rankBy: 'area' });
    expect(result.kept).toEqual([]);
    expect(result.dropped).toBe(0);
  });

  it('handles maxFeatures === 0', () => {
    const features = [squareOfSize(0.001, 1), squareOfSize(0.002, 2)];
    const result = applyLodCap(features, { maxFeatures: 0, rankBy: 'area' });
    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toBe(2);
  });

  it('caps 10000 → 5000 with the right counts', () => {
    const features = Array.from({ length: 10000 }, (_, i) =>
      squareOfSize(0.00001 * ((i % 50) + 1), i),
    );
    const result = applyLodCap(features, { maxFeatures: 5000, rankBy: 'area' });
    expect(result.kept).toHaveLength(5000);
    expect(result.dropped).toBe(5000);
  });
});
