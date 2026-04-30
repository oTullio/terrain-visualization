/**
 * MeasurementHandler — invisible Resium child that owns the
 * `Cesium.ScreenSpaceEventHandler` and a window keydown listener used by
 * the picking-based tools (Distance, Elevation profile).
 *
 * Lives inside the `<Viewer>` so it can grab the live `Viewer` via
 * `useCesium()`. Renders nothing.
 *
 * Behaviour:
 *   - On LEFT_CLICK: read `activeTool` from the store. If it's `'distance'`
 *     or `'elevation-profile'`, pick the cartographic position and dispatch
 *     `addDistancePoint` / `addElevationProfilePoint`.
 *   - On Escape (window keydown): dispatch `clearActiveToolPoints`. This
 *     cancels an in-progress measurement without exiting the tool.
 *
 * The handler reads the *current* store state at click time (via
 * `useAppStore.getState()`), so it never needs to re-bind when the active
 * tool changes — keeping the effect's dependency list tiny.
 */
import { useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useAppStore } from '../store/useAppStore.js';
import { pickCartographicAt } from './pickPosition.js';

export default function MeasurementHandler() {
  const { viewer } = useCesium();

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const state = useAppStore.getState();
      const tool = state.activeTool;
      if (tool !== 'distance' && tool !== 'elevation-profile') return;

      const picked = pickCartographicAt(viewer, movement.position);
      if (!picked) return;

      if (tool === 'distance') {
        state.addDistancePoint(picked);
      } else {
        state.addElevationProfilePoint(picked);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const state = useAppStore.getState();
        if (state.activeTool === null) return;
        state.clearActiveToolPoints();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      try {
        handler.destroy();
      } catch {
        // viewer was already torn down; nothing to clean up
      }
    };
  }, [viewer]);

  return null;
}
