/**
 * Pure geometry helpers for drawing preview.
 *
 * These functions are free of side effects and have no MapLibre dependency,
 * making them straightforward to unit-test.
 */

import type GeoJSON from 'geojson';
import type { SelectionShape } from '../../store/useAppStore.js';

// ---------------------------------------------------------------------------
// buildPreviewGeometry
// ---------------------------------------------------------------------------

/**
 * Builds a GeoJSON FeatureCollection representing the live drawing preview.
 *
 * @param vertices  - Confirmed vertices collected so far.
 * @param cursor    - Current mouse position (not yet confirmed), or null.
 * @param mode      - Drawing mode ('rectangle' | 'polygon').
 */
export function buildPreviewGeometry(
  vertices: [number, number][],
  cursor: [number, number] | null,
  mode: SelectionShape,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  // Combine confirmed vertices with live cursor position.
  const pts = cursor ? [...vertices, cursor] : [...vertices];

  if (pts.length < 2) {
    return { type: 'FeatureCollection', features };
  }

  if (mode === 'rectangle') {
    // Two-corner rectangle: pts[0] = start corner, pts[last] = current corner.
    const start = pts[0]!;
    const end = pts[pts.length - 1]!;
    const ring: [number, number][] = [
      [start[0], start[1]],
      [end[0], start[1]],
      [end[0], end[1]],
      [start[0], end[1]],
      [start[0], start[1]], // closed ring
    ];
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
    // Vertex dots at the four corners.
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPoint', coordinates: ring.slice(0, 4) },
    });
  } else {
    // Polygon mode: lines + optional filled polygon + vertex dots.
    if (pts.length >= 3) {
      const ring = [...pts, pts[0]!]; // close the ring
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }
    // Show in-progress line.
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: pts },
    });
    // Vertex dots.
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPoint', coordinates: pts },
    });
  }

  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// finalPolygon
// ---------------------------------------------------------------------------

/**
 * Derives the confirmed polygon geometry from the collected vertices.
 *
 * Returns null if there are not enough vertices to form a valid polygon for
 * the given mode.
 */
export function finalPolygon(
  vertices: [number, number][],
  mode: SelectionShape,
): GeoJSON.Polygon | null {
  if (mode === 'rectangle' && vertices.length >= 2) {
    const start = vertices[0]!;
    const end = vertices[vertices.length - 1]!;
    return {
      type: 'Polygon',
      coordinates: [
        [
          [start[0], start[1]],
          [end[0], start[1]],
          [end[0], end[1]],
          [start[0], end[1]],
          [start[0], start[1]],
        ],
      ],
    };
  }
  if (mode === 'polygon' && vertices.length >= 3) {
    return {
      type: 'Polygon',
      coordinates: [[...vertices, vertices[0]!]],
    };
  }
  return null;
}
