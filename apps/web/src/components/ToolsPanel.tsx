/**
 * ToolsPanel — sidebar overlay on the right of the Cesium viewport with
 * buttons for the available analytical tools and the active tool's panel
 * mounted underneath.
 *
 * Phase D1 ships with two tools: Distance and Elevation profile. Future
 * phases (D2 slope/aspect, D3 area/volume, D4 viewshed) will add more
 * buttons here — but this component intentionally does NOT pre-render
 * those buttons.
 *
 * Activation model:
 *   - Click an inactive tool button → activate it.
 *   - Click the *active* tool button → deactivate (return to "no tool").
 *   - Switching tools clears the previous tool's picked points (handled in
 *     the store's setActiveTool).
 *
 * Positioning: absolute, top-right, sits *below* LayersStatus by way of
 * `top-32`. LayersStatus uses `top-3`; cards stack downward, so 8rem of
 * vertical headroom is plenty for the typical idle case.
 *
 * IMPORTANT: this component does NOT have access to the Cesium viewer —
 * it lives outside `<Viewer>` so its panels can mount portal-free DOM
 * (Recharts SVG, etc.). The tool components themselves use `useCesium()`
 * via being wrapped in a Resium `<CesiumComponentRef>`-style child instead.
 *
 * That last note matters: DistanceTool and ElevationProfileTool both call
 * `useCesium()`, which requires being inside `<Viewer>`. To honour that
 * AND keep the panel in normal DOM, the tool *panels* are mounted inside
 * `<Viewer>` (returning null) so they can use the viewer; only their
 * *DOM* lives in this sidebar via React portals — see
 * `tools/ToolPanelMount.tsx`.
 */
import { useAppStore } from '../store/useAppStore.js';
import type { ToolId } from '../store/useAppStore.js';

interface ToolDef {
  id: ToolId;
  label: string;
}

// D1 shipped Distance + Elevation profile; D2 adds Slope / aspect; D3 adds
// Area / volume; D4 adds Viewshed.
const TOOLS: ToolDef[] = [
  { id: 'distance', label: 'Distance' },
  { id: 'elevation-profile', label: 'Elevation profile' },
  { id: 'slope-aspect', label: 'Slope / aspect' },
  { id: 'area-volume', label: 'Area / volume' },
  { id: 'viewshed', label: 'Viewshed' },
];

export default function ToolsPanel() {
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);

  return (
    <div className="absolute top-32 right-3 z-20 max-w-xs w-60 max-h-[60vh] overflow-y-auto pointer-events-auto bg-gray-900/90 border border-gray-700 rounded-md shadow-lg p-2 space-y-2">
      <div role="group" aria-label="Tools" className="flex flex-col gap-1">
        {TOOLS.map(({ id, label }) => {
          const isActive = activeTool === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveTool(isActive ? null : id)}
              className={[
                'w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100 border border-gray-700',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Active-tool panel content is rendered into this slot by the
          ToolPanelMount component (which lives inside <Viewer> so it can
          access useCesium). */}
      {activeTool !== null && (
        <div
          id="tools-panel-slot"
          data-testid="tools-panel-slot"
          className="border-t border-gray-700 pt-2"
        />
      )}
    </div>
  );
}
