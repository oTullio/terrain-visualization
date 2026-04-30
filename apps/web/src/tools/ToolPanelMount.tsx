/**
 * ToolPanelMount — invisible Resium child component that lives inside
 * `<Viewer>` (so its descendants can call `useCesium()`) and portals the
 * active tool's UI into the `#tools-panel-slot` element rendered by
 * `ToolsPanel`.
 *
 * Why the indirection? The tool-panel components need *both*:
 *   - access to the Cesium `viewer` (to read terrainProvider, mount
 *     polyline/dot entities) — which requires being inside `<Viewer>`,
 *   - and DOM placement in the sidebar — which lives outside `<Viewer>`.
 *
 * React portals bridge the two: the components *render* logically here
 * (so `useCesium()` works) but their JSX is appended to the sidebar slot
 * via `createPortal`.
 *
 * If the slot element isn't in the DOM yet (first render) we render
 * nothing; `ToolsPanel` only creates the slot when a tool is active, and
 * this component re-renders on `activeTool` change so it picks the slot
 * up on the very next tick.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/useAppStore.js';
import DistanceTool from './distance/DistanceTool.js';
import ElevationProfileTool from './elevationProfile/ElevationProfileTool.js';

export default function ToolPanelMount() {
  const activeTool = useAppStore((s) => s.activeTool);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (activeTool === null) {
      setSlot(null);
      return;
    }
    // The slot element is created by ToolsPanel during the same render
    // cycle as the activeTool change. Look it up after paint.
    const el = document.getElementById('tools-panel-slot');
    setSlot(el);
  }, [activeTool]);

  if (!slot || activeTool === null) return null;

  if (activeTool === 'distance') {
    return createPortal(<DistanceTool />, slot);
  }
  if (activeTool === 'elevation-profile') {
    return createPortal(<ElevationProfileTool />, slot);
  }
  return null;
}
