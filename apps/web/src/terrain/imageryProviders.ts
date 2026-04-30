/**
 * imageryProviders — factory for Cesium ImageryLayer instances per drape mode.
 *
 * ## Provider decisions (v1)
 *
 * | Mode          | Provider                                          | Notes                                                     |
 * |---------------|---------------------------------------------------|-----------------------------------------------------------|
 * | satellite     | Cesium Ion asset 2 (Bing Maps Aerial)             | Default that Cesium shows out of the box.                 |
 * | hillshade     | ESRI ArcGIS World Hillshade (arcgisonline.com)    | Public tile cache — no token required.                    |
 * | topographic   | OpenTopoMap (tile.opentopomap.org)                | v1 approximation of an "elevation ramp"; free, CC-BY-SA.  |
 *
 * ## API shape
 *
 * Both IonImageryProvider.fromAssetId and ArcGisMapServerImageryProvider.fromUrl
 * return Promises (async static factories in Cesium ≥1.104). To avoid exposing
 * Promise<ImageryLayer> to the caller and to keep SurfaceDrapeLayer simple, this
 * module returns an `ImageryLayer` (not a provider) — Cesium's
 * `ImageryLayer.fromProviderAsync(promise)` wraps the Promise transparently and
 * the layer can be added to the collection immediately, before the tile request
 * even resolves.
 *
 * UrlTemplateImageryProvider has a synchronous constructor, but we still wrap it
 * through the same `fromProviderAsync` path so all three modes are uniform.
 *
 * ## Attribution
 *
 * `IMAGERY_ATTRIBUTIONS` is exported for use in the Phase E3 About panel.
 * OpenTopoMap's attribution is also embedded in the provider's `credit` option
 * so Cesium's built-in on-screen attribution overlay picks it up automatically.
 */
import * as Cesium from 'cesium';
import type { SurfaceDrape } from '../store/useAppStore.js';

// ---------------------------------------------------------------------------
// Attribution strings (also used by Phase E3 About panel)
// ---------------------------------------------------------------------------

export const IMAGERY_ATTRIBUTIONS: Record<SurfaceDrape, string> = {
  satellite:
    '© Microsoft / Bing Maps — imagery provided via Cesium Ion (asset 2)',
  hillshade:
    'Hillshade: © Esri, USGS, NOAA — ArcGIS World Hillshade (arcgisonline.com)',
  topographic:
    'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns a `Cesium.ImageryLayer` configured for the requested drape mode.
 *
 * The layer is ready to pass to `viewer.imageryLayers.add()` immediately.
 * Tile loading happens asynchronously in the background (Cesium handles it).
 */
export function createImageryLayer(mode: SurfaceDrape): Cesium.ImageryLayer {
  switch (mode) {
    case 'satellite':
      return Cesium.ImageryLayer.fromProviderAsync(
        Cesium.IonImageryProvider.fromAssetId(2),
      );

    case 'hillshade':
      return Cesium.ImageryLayer.fromProviderAsync(
        Cesium.ArcGisMapServerImageryProvider.fromUrl(
          'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer',
        ),
      );

    case 'topographic': {
      // UrlTemplateImageryProvider has a synchronous constructor.
      // We still wrap in fromProviderAsync for a uniform API surface.
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
        maximumLevel: 17,
        credit: new Cesium.Credit(
          'Map data: &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
          false,
        ),
      });
      return Cesium.ImageryLayer.fromProviderAsync(Promise.resolve(provider));
    }

    default: {
      // Exhaustive check — TypeScript prevents this at compile time.
      const _exhaustive: never = mode;
      throw new Error(`Unknown drape mode: ${String(_exhaustive)}`);
    }
  }
}
