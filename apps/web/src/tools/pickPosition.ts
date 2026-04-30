/**
 * pickPosition — convert a 2D screen-space pixel into a 3D geographic point
 * (longitude / latitude / height) using the active Cesium scene.
 *
 * Two-tier strategy (Cesium 1.140):
 *   1. `scene.pickPosition(screen)` — works for tilesets, glTF models, and 3D
 *      entities. Returns a Cartesian3 of the *visible* fragment under the
 *      cursor. Most accurate when picking onto buildings or other 3D content.
 *   2. Fallback: cast a ray from the camera through `screen` and intersect it
 *      with the `globe` (terrain). `globe.pick(ray, scene)`. Used when (1)
 *      returns null — typically because the user clicked on bare terrain
 *      that is not in the depth buffer's pickable set.
 *
 * Returns degrees + metres, or null if both strategies miss (e.g. user
 * clicked off-globe at the horizon).
 */
import * as Cesium from 'cesium';

export interface PickedCartographic {
  lng: number;
  lat: number;
  height: number;
}

export function pickCartographicAt(
  viewer: Cesium.Viewer,
  screen: Cesium.Cartesian2,
): PickedCartographic | null {
  if (!viewer || viewer.isDestroyed()) return null;
  const scene = viewer.scene;

  // 1. Try scene.pickPosition (uses depth buffer; works on tilesets + entities).
  let cartesian: Cesium.Cartesian3 | undefined;
  try {
    cartesian = scene.pickPosition(screen);
  } catch {
    cartesian = undefined;
  }

  // 2. Fallback to globe.pick via a camera ray. Always defined when scene
  //    has a globe and the ray hits the ellipsoid.
  if (!cartesian || !Cesium.defined(cartesian)) {
    try {
      const ray = scene.camera.getPickRay(screen);
      if (ray) {
        const hit = scene.globe.pick(ray, scene);
        if (hit) cartesian = hit;
      }
    } catch {
      // ignore — both strategies failed
    }
  }

  if (!cartesian) return null;

  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  if (!carto) return null;

  return {
    lng: Cesium.Math.toDegrees(carto.longitude),
    lat: Cesium.Math.toDegrees(carto.latitude),
    height: carto.height,
  };
}
