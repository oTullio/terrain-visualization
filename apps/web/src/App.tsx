/**
 * App shell — Phase B1 layout.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │  header (fixed, h-12)                       │
 *   ├──────────────────────┬──────────────────────┤
 *   │ 2D SelectionMap      │  Cesium 3D Viewer    │
 *   │ (left half, w-1/2)   │  (right half, w-1/2) │
 *   │                      │                      │
 *   └──────────────────────┴──────────────────────┘
 *
 * Tailwind classes only — no CSS Modules.
 */
import { Viewer } from 'resium';
import { Terrain } from 'cesium';
import SelectionMap from './components/SelectionMap/SelectionMap.js';

export default function App() {
  return (
    <div className="flex flex-col w-full h-full bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center px-4 h-12 bg-gray-900 border-b border-gray-800 shrink-0 z-10">
        <span className="text-sm font-semibold tracking-wide text-emerald-400">
          Terrain Visualizer
        </span>
        <span className="ml-3 text-xs text-gray-500">Phase B1 — 2D selection + bbox math</span>
      </header>

      {/* Body: 2D selection map (left) + 3D Cesium viewer (right) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — 2D selection map */}
        <div className="w-1/2 shrink-0 flex flex-col border-r border-gray-800 overflow-hidden">
          {/* Panel header */}
          <div className="px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Select Area
            </p>
          </div>
          <SelectionMap />
        </div>

        {/* Right panel — Cesium 3D viewer */}
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
