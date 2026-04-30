/**
 * distanceMath — pure helpers for the Distance tool.
 *
 *   - `planimetricDistanceMeters` — geodesic surface distance between two
 *     lat/lng points (great-circle on the WGS-84 ellipsoid). "Planimetric"
 *     in the user-facing sense: it ignores terrain height.
 *
 *   - `surfaceDistanceMeters` — given an ordered array of samples
 *     (lng/lat/height), sum the 3D Euclidean distance between consecutive
 *     samples (Cartesian3.fromDegrees). This integrates terrain undulations,
 *     so on hilly terrain it will exceed the planimetric distance.
 *
 * Both functions are deterministic and synchronous; the heavy lifting
 * (terrain sampling) happens in `sampleAlongLine`.
 */
import * as Cesium from 'cesium';
import type { LngLat, AlongLineSample } from '../sampleAlongLine.js';

/** Planimetric (great-circle, ellipsoidal) distance between two lat/lng points, in metres. */
export function planimetricDistanceMeters(a: LngLat, b: LngLat): number {
  const start = new Cesium.Cartographic(
    Cesium.Math.toRadians(a.lng),
    Cesium.Math.toRadians(a.lat),
    0,
  );
  const end = new Cesium.Cartographic(
    Cesium.Math.toRadians(b.lng),
    Cesium.Math.toRadians(b.lat),
    0,
  );
  if (start.longitude === end.longitude && start.latitude === end.latitude) {
    return 0;
  }
  const geo = new Cesium.EllipsoidGeodesic(start, end);
  return geo.surfaceDistance;
}

/**
 * Sum of 3D Euclidean distances between consecutive samples — the
 * "drape-along-terrain" length of the line.
 *
 * For a flat surface the result equals the planimetric distance; for an
 * uphill traverse it grows with the slope.
 */
export function surfaceDistanceMeters(samples: AlongLineSample[]): number {
  if (samples.length < 2) return 0;

  // Convert each sample to Cartesian3 once.
  const carts: Cesium.Cartesian3[] = [];
  for (const s of samples) {
    carts.push(Cesium.Cartesian3.fromDegrees(s.lng, s.lat, s.height));
  }

  let total = 0;
  for (let i = 1; i < carts.length; i++) {
    total += Cesium.Cartesian3.distance(carts[i - 1]!, carts[i]!);
  }
  return total;
}
