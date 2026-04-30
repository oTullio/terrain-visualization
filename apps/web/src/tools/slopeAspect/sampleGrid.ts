/**
 * sampleHeightGrid — async wrapper around Cesium.sampleTerrainMostDetailed
 * that produces a flat Float32Array of heights for a regular lng/lat grid
 * over a bounding box.
 *
 * Returns row-major order: heights[r * cols + c] is the cell at column `c`,
 * row `r`. Row 0 is the southernmost row (matching `gridCoords`).
 *
 * Cesium 1.140 signature: `sampleTerrainMostDetailed(provider, positions[],
 * rejectOnTileFail?)`. There is no chunk-size parameter on this overload —
 * the function batches internally per-tile.
 *
 * Abort handling: if the supplied AbortSignal is aborted (either before the
 * call or while sampling is in flight) we throw `DOMException('Aborted',
 * 'AbortError')` so callers can use the standard Web API pattern.
 */
import * as Cesium from 'cesium';
import { gridCoords, type BoundingBox } from '@terrain/shared';

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

export async function sampleHeightGrid(
  terrainProvider: Cesium.TerrainProvider,
  bbox: BoundingBox,
  cols: number,
  rows: number,
  signal?: AbortSignal,
): Promise<Float32Array> {
  if (signal?.aborted) throw abortError();

  const coords = gridCoords(bbox, cols, rows);
  const cartos: Cesium.Cartographic[] = coords.map(({ lng, lat }) =>
    Cesium.Cartographic.fromDegrees(lng, lat),
  );

  // sampleTerrainMostDetailed mutates the cartographics' .height in place
  // and resolves with the same array reference.
  const sampled = await Cesium.sampleTerrainMostDetailed(terrainProvider, cartos);

  if (signal?.aborted) throw abortError();

  const out = new Float32Array(cols * rows);
  // gridCoords is already row-major; sampled is in the same order.
  for (let i = 0; i < sampled.length; i++) {
    const c = sampled[i];
    // If a tile failed, height may be undefined. Treat it as 0 so the
    // slope/aspect filter still yields a result for the rest of the grid.
    out[i] = c && Number.isFinite(c.height) ? c.height : 0;
  }
  return out;
}
