import { Viewer } from 'resium';
import { Terrain } from 'cesium';

/**
 * App shell — Phase A placeholder.
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │  header (fixed, h-12)               │
 *   ├───────────┬─────────────────────────┤
 *   │ sidebar   │  Cesium Viewer          │
 *   │ (w-64)    │  (fills remaining area) │
 *   └───────────┴─────────────────────────┘
 *
 * Tailwind classes are used exclusively — no CSS Modules.
 */
export default function App() {
  return (
    <div className="flex flex-col w-full h-full bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center px-4 h-12 bg-gray-900 border-b border-gray-800 shrink-0 z-10">
        <span className="text-sm font-semibold tracking-wide text-emerald-400">
          Terrain Visualizer
        </span>
        <span className="ml-3 text-xs text-gray-500">Phase A — scaffold</span>
      </header>

      {/* Body: sidebar + viewer */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar shell */}
        <aside className="w-64 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col p-3 gap-2 z-10">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Layers</p>
          <div className="h-px bg-gray-800" />
          <p className="text-xs text-gray-600 italic">No layers yet — coming in Phase C</p>

          <p className="mt-4 text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Tools
          </p>
          <div className="h-px bg-gray-800" />
          <p className="text-xs text-gray-600 italic">No tools yet — coming in Phase D</p>
        </aside>

        {/* Cesium Viewer — fills all remaining space */}
        <div className="relative flex-1">
          <Viewer
            full
            terrain={Terrain.fromWorldTerrain()}
            style={{ position: 'absolute', inset: 0 }}
          />
        </div>
      </div>
    </div>
  );
}
