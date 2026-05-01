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
 * The slot element is created by ToolsPanel in the same React commit as
 * the activeTool change. We use useLayoutEffect (which fires synchronously
 * after DOM mutations but before paint) to find the slot — guaranteeing it
 * exists before the portal would mount. useEffect would also work in
 * Chrome+React 19 today, but useLayoutEffect locks the ordering invariant
 * regardless of future React scheduler changes.
 */
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/useAppStore.js';
import DistanceTool from './distance/DistanceTool.js';
import ElevationProfileTool from './elevationProfile/ElevationProfileTool.js';
import SlopeAspectTool from './slopeAspect/SlopeAspectTool.js';
import SlopeAspectLayer from './slopeAspect/SlopeAspectLayer.js';

export default function ToolPanelMount() {
  const activeTool = useAppStore((s) => s.activeTool);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (activeTool === null) {
      setSlot(null);
      return;
    }
    setSlot(document.getElementById('tools-panel-slot'));
  }, [activeTool]);

  // The slope-aspect overlay imagery layer is mounted UNCONDITIONALLY
  // (always rendered alongside whichever panel is active) so its own
  // effect can react to activeTool / bbox / mode changes — including
  // adding the overlay when the tool first activates and removing it on
  // deactivation. Its own logic guards against doing work when inactive.
  const slopeAspectLayer = <SlopeAspectLayer />;

  if (!slot || activeTool === null) return slopeAspectLayer;

  if (activeTool === 'distance') {
    return (
      <>
        {slopeAspectLayer}
        {createPortal(<DistanceTool />, slot)}
      </>
    );
  }
  if (activeTool === 'elevation-profile') {
    return (
      <>
        {slopeAspectLayer}
        {createPortal(<ElevationProfileTool />, slot)}
      </>
    );
  }
  if (activeTool === 'slope-aspect') {
    return (
      <>
        {slopeAspectLayer}
        {createPortal(<SlopeAspectTool />, slot)}
      </>
    );
  }
  return slopeAspectLayer;
}
