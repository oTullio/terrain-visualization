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
import AreaVolumeTool from './areaVolume/AreaVolumeTool.js';
import AreaVolumeLayer from './areaVolume/AreaVolumeLayer.js';

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

  // Layers that need to react to activeTool changes (turning themselves on
  // and off as the tool comes and goes) are mounted UNCONDITIONALLY here.
  // Their own effects early-return when their tool is inactive and clean
  // up any scene primitives they had added.
  const sceneLayers = (
    <>
      <SlopeAspectLayer />
      <AreaVolumeLayer />
    </>
  );

  if (!slot || activeTool === null) return sceneLayers;

  if (activeTool === 'distance') {
    return (
      <>
        {sceneLayers}
        {createPortal(<DistanceTool />, slot)}
      </>
    );
  }
  if (activeTool === 'elevation-profile') {
    return (
      <>
        {sceneLayers}
        {createPortal(<ElevationProfileTool />, slot)}
      </>
    );
  }
  if (activeTool === 'slope-aspect') {
    return (
      <>
        {sceneLayers}
        {createPortal(<SlopeAspectTool />, slot)}
      </>
    );
  }
  if (activeTool === 'area-volume') {
    return (
      <>
        {sceneLayers}
        {createPortal(<AreaVolumeTool />, slot)}
      </>
    );
  }
  return sceneLayers;
}
