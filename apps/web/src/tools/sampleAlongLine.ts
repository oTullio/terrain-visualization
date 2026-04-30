/**
 * sampleAlongLine — sample the terrain elevation along a straight line
 * connecting two lat/lng points.
 *
 * Returns an array of `samples` evenly-spaced points (including both
 * endpoints), each with `lng`, `lat`, terrain `height` (metres), and
 * cumulative geodesic `distance` from the start.
 *
 * v1 simplifications:
 *
 *   - **Linear interpolation** in lat/lng (NOT great-circle). For short
 *     distances (< 50 km) the planimetric approximation error is < 0.1%.
 *     The plan is to revisit if a user-visible bug ever surfaces — until
 *     then, simplicity wins.
 *
 *   - **Distance is geodesic**, computed via Cesium's
 *     `EllipsoidGeodesic` (great-circle on the WGS-84 ellipsoid). We use
 *     Cesium's geodesic rather than `@turf/distance` (km-based, would need
 *     a units conversion) to keep the dependency surface minimal — this
 *     module is already pulling in `cesium`.
 */
import * as Cesium from 'cesium';

export interface AlongLineSample {
  lng: number;
  lat: number;
  height: number;
  /** Cumulative geodesic distance from `a`, in metres. */
  distance: number;
}

export interface LngLat {
  lng: number;
  lat: number;
}

/** Default sample count (including both endpoints). */
export const DEFAULT_SAMPLES = 100;

export async function sampleAlongLine(
  terrainProvider: Cesium.TerrainProvider,
  a: LngLat,
  b: LngLat,
  samples: number = DEFAULT_SAMPLES,
): Promise<AlongLineSample[]> {
  if (samples < 2) {
    throw new Error(`sampleAlongLine: samples must be >= 2, got ${samples}`);
  }

  // Build evenly-spaced cartographics in lat/lng (radians).
  const aLngRad = Cesium.Math.toRadians(a.lng);
  const aLatRad = Cesium.Math.toRadians(a.lat);
  const bLngRad = Cesium.Math.toRadians(b.lng);
  const bLatRad = Cesium.Math.toRadians(b.lat);

  const cartos: Cesium.Cartographic[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const lng = aLngRad + (bLngRad - aLngRad) * t;
    const lat = aLatRad + (bLatRad - aLatRad) * t;
    cartos.push(new Cesium.Cartographic(lng, lat, 0));
  }

  // Sample the most-detailed terrain heights for every position.
  // sampleTerrainMostDetailed mutates the cartographics' `height` in place
  // and returns the same array.
  const sampled = await Cesium.sampleTerrainMostDetailed(terrainProvider, cartos);

  // Compute cumulative geodesic distance using Cesium's EllipsoidGeodesic.
  // Single instance reused across segments via setEndPoints.
  const geodesic = new Cesium.EllipsoidGeodesic();

  const out: AlongLineSample[] = [];
  let cumulative = 0;
  for (let i = 0; i < sampled.length; i++) {
    const c = sampled[i]!;
    if (i > 0) {
      const prev = sampled[i - 1]!;
      // Use a 2D (lng/lat) cartographic — height does not affect surface distance.
      geodesic.setEndPoints(
        new Cesium.Cartographic(prev.longitude, prev.latitude, 0),
        new Cesium.Cartographic(c.longitude, c.latitude, 0),
      );
      const seg = geodesic.surfaceDistance;
      // Defensive: if the two endpoints are identical Cesium returns NaN.
      cumulative += Number.isFinite(seg) ? seg : 0;
    }
    out.push({
      lng: Cesium.Math.toDegrees(c.longitude),
      lat: Cesium.Math.toDegrees(c.latitude),
      height: c.height,
      distance: cumulative,
    });
  }

  return out;
}
