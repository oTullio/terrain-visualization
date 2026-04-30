/**
 * Centroid-based feature clipping against a freehand selection polygon.
 *
 * v1 approximation per the brief: a feature is kept iff its centroid is
 * inside the selection polygon. This is intentionally cheap and easy to
 * reason about — full polygon-polygon intersection is deferred. Buildings
 * straddling the boundary are kept-or-dropped based on their centre of
 * mass; for typical urban footprints (a few metres across) this is
 * indistinguishable from a true clip at viewport scale.
 *
 * No-op fast path: when `polygon === null` the input FeatureCollection is
 * returned by reference (rectangle selections, where the bbox already
 * defines the area, don't need clipping).
 */
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import centroid from '@turf/centroid';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

export function clipFeaturesToPolygon(
  fc: FeatureCollection<Polygon | MultiPolygon>,
  polygon: Polygon | null,
): FeatureCollection<Polygon | MultiPolygon> {
  if (polygon === null) return fc;

  const kept: Feature<Polygon | MultiPolygon>[] = [];
  for (const feature of fc.features) {
    const c = centroid(feature);
    if (booleanPointInPolygon(c, polygon)) {
      kept.push(feature);
    }
  }
  return { type: 'FeatureCollection', features: kept };
}
