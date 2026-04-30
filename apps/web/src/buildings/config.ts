/**
 * Building-rendering tuning constants.
 *
 * `DEFAULT_LOD_CAP` is the maximum number of building entities we render
 * per selection. The number was chosen empirically:
 *   - At ~5000 extruded-polygon entities, Cesium's primitive rendering
 *     stays above 20 FPS on mid-range hardware.
 *   - Memory usage stays bounded (each entity carries hierarchy + height
 *     state, roughly a few hundred bytes after GPU upload).
 *   - For ~100 km² urban areas the densest neighbourhoods rarely exceed
 *     ~10k buildings; capping at 5k drops the long tail of small
 *     outbuildings while preserving the silhouette of the area.
 *
 * Tune via the `applyLodCap` call site, not by editing this constant
 * locally — the BuildingsStatus overlay reads from the resulting
 * `dropped` count.
 */
export const DEFAULT_LOD_CAP = 5000;
