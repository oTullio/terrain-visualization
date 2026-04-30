/**
 * Unit tests for previewGeometry.ts pure helpers.
 */
import { describe, it, expect } from 'vitest';
import type GeoJSON from 'geojson';
import { buildPreviewGeometry, finalPolygon } from './previewGeometry.js';

// ---------------------------------------------------------------------------
// buildPreviewGeometry — rectangle
// ---------------------------------------------------------------------------

describe('buildPreviewGeometry (rectangle)', () => {
  it('returns empty FeatureCollection when fewer than 2 points', () => {
    const result = buildPreviewGeometry([[10, 20]], null, 'rectangle');
    expect(result.features).toHaveLength(0);
  });

  it('builds a 5-point closed ring from start and end corners', () => {
    const start: [number, number] = [10, 20];
    const end: [number, number] = [30, 40];
    const result = buildPreviewGeometry([start], end, 'rectangle');

    // Expect a Polygon feature and a MultiPoint feature.
    const polygon = result.features.find((f) => f.geometry.type === 'Polygon');
    expect(polygon).toBeDefined();

    const ring = (polygon!.geometry as GeoJSON.Polygon).coordinates[0]!;
    expect(ring).toHaveLength(5);

    // First and last point must be equal (closed ring).
    expect(ring[0]).toEqual(ring[4]);

    // Corners should be the four expected combinations of start/end lng/lat.
    expect(ring[0]).toEqual([start[0], start[1]]); // SW
    expect(ring[1]).toEqual([end[0], start[1]]);   // SE
    expect(ring[2]).toEqual([end[0], end[1]]);      // NE
    expect(ring[3]).toEqual([start[0], end[1]]);   // NW
  });

  it('includes a MultiPoint feature with exactly 4 vertex dots', () => {
    const result = buildPreviewGeometry([[0, 0]], [10, 10], 'rectangle');
    const multi = result.features.find((f) => f.geometry.type === 'MultiPoint');
    expect(multi).toBeDefined();
    expect((multi!.geometry as GeoJSON.MultiPoint).coordinates).toHaveLength(4);
  });

  it('correctly uses the last vertex as end when no cursor is provided', () => {
    // Simulates a confirmed rectangle (mouseup received, cursor = null).
    const vertices: [number, number][] = [[0, 0], [20, 30]];
    const result = buildPreviewGeometry(vertices, null, 'rectangle');
    const polygon = result.features.find((f) => f.geometry.type === 'Polygon');
    const ring = (polygon!.geometry as GeoJSON.Polygon).coordinates[0]!;
    // start = [0,0], end = [20,30]
    expect(ring[0]).toEqual([0, 0]);
    expect(ring[2]).toEqual([20, 30]);
  });
});

// ---------------------------------------------------------------------------
// buildPreviewGeometry — polygon
// ---------------------------------------------------------------------------

describe('buildPreviewGeometry (polygon)', () => {
  it('returns only LineString + MultiPoint when fewer than 3 points', () => {
    const result = buildPreviewGeometry([[0, 0], [10, 0]], null, 'polygon');
    const types = result.features.map((f) => f.geometry.type);
    expect(types).not.toContain('Polygon');
    expect(types).toContain('LineString');
    expect(types).toContain('MultiPoint');
  });

  it('closes the polygon ring by appending the first vertex for ≥3 vertices', () => {
    const verts: [number, number][] = [[0, 0], [10, 0], [5, 10]];
    const result = buildPreviewGeometry(verts, null, 'polygon');
    const polygon = result.features.find((f) => f.geometry.type === 'Polygon');
    expect(polygon).toBeDefined();
    const ring = (polygon!.geometry as GeoJSON.Polygon).coordinates[0]!;
    // Ring should have 4 points: the 3 vertices + closing first vertex.
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
});

// ---------------------------------------------------------------------------
// finalPolygon
// ---------------------------------------------------------------------------

describe('finalPolygon (rectangle)', () => {
  it('returns null if fewer than 2 vertices', () => {
    expect(finalPolygon([[0, 0]], 'rectangle')).toBeNull();
  });

  it('produces a closed 5-point ring from exactly 2 vertices', () => {
    const poly = finalPolygon([[0, 0], [10, 20]], 'rectangle');
    expect(poly).not.toBeNull();
    expect(poly!.type).toBe('Polygon');
    const ring = poly!.coordinates[0]!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]); // closed
    // Check all four corners are present.
    expect(ring[0]).toEqual([0, 0]);
    expect(ring[1]).toEqual([10, 0]);
    expect(ring[2]).toEqual([10, 20]);
    expect(ring[3]).toEqual([0, 20]);
  });
});

describe('finalPolygon (polygon)', () => {
  it('returns null if fewer than 3 vertices', () => {
    expect(finalPolygon([[0, 0], [10, 0]], 'polygon')).toBeNull();
  });

  it('closes the ring by appending first vertex for ≥3 vertices', () => {
    const verts: [number, number][] = [[0, 0], [10, 0], [5, 10]];
    const poly = finalPolygon(verts, 'polygon');
    expect(poly).not.toBeNull();
    expect(poly!.type).toBe('Polygon');
    const ring = poly!.coordinates[0]!;
    expect(ring).toHaveLength(4); // 3 vertices + closing first
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
});
