/**
 * App shell.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  header (fixed, h-12)            [SurfaceDrapeToggle →]     │
 *   ├──────────────────────────┬────────────────────────────────  │
 *   │ 2D SelectionMap          │  Cesium 3D Viewer                │
 *   │ (left half, w-1/2)       │  (right half, w-1/2)             │
 *   │                          │  + SurfaceDrapeLayer (imagery)   │
 *   │                          │  + BuildingsLayer                │
 *   │                          │  + WaterLayer                    │
 *   │                          │  + RoadsLayer                    │
 *   │                          │  + LayersStatus                  │
 *   └──────────────────────────┴──────────────────────────────────┘
 *
 * On mount, an optional `?bbox=west,south,east,north` URL query is
 * parsed and used to pre-fill the selection (rectangle polygon derived
 * from the bbox). This is the stress-test entrypoint — see
 * src/buildings/STRESS_TEST.md.
 */
import { useEffect } from 'react';
import { Viewer } from 'resium';
import { Terrain } from 'cesium';
import SelectionMap from './components/SelectionMap/SelectionMap.js';
import BuildingsLayer from './buildings/BuildingsLayer.js';
import WaterLayer from './water/WaterLayer.js';
import RoadsLayer from './roads/RoadsLayer.js';
import LayersStatus from './components/LayersStatus.js';
import ToolsPanel from './components/ToolsPanel.js';
import SurfaceDrapeLayer from './terrain/SurfaceDrapeLayer.js';
import SurfaceDrapeToggle from './components/SurfaceDrapeToggle.js';
import MeasurementHandler from './tools/MeasurementHandler.js';
import ToolPanelMount from './tools/ToolPanelMount.js';
import { useAppStore } from './store/useAppStore.js';
import type { BoundingBox } from '@terrain/shared';
import type { Polygon } from 'geojson';

function parseBboxQuery(search: string): BoundingBox | null {
  const params = new URLSearchParams(search);
  const raw = params.get('bbox');
  if (!raw) return null;
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts as [number, number, number, number];
  if (south >= north) return null;
  if (south < -90 || north > 90 || west < -180 || east > 180) return null;
  return { west, south, east, north };
}

function bboxToPolygon(b: BoundingBox): Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [b.west, b.south],
        [b.east, b.south],
        [b.east, b.north],
        [b.west, b.north],
        [b.west, b.south],
      ],
    ],
  };
}

export default function App() {
  const setSelection = useAppStore((s) => s.setSelection);

  // One-shot URL ?bbox= ingestion. Strictly mount-time so user-driven
  // selection changes aren't clobbered.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bbox = parseBboxQuery(window.location.search);
    if (!bbox) return;
    setSelection({ bbox, polygon: bboxToPolygon(bbox) });
  }, [setSelection]);

  return (
    <div className="flex flex-col w-full h-full bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center px-4 h-12 bg-gray-900 border-b border-gray-800 shrink-0 z-10">
        <span className="text-sm font-semibold tracking-wide text-emerald-400">
          Terrain Visualizer
        </span>
        <span className="ml-3 text-xs text-gray-500">3D terrain visualizer</span>
        <div className="ml-auto">
          <SurfaceDrapeToggle />
        </div>
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
          >
            <SurfaceDrapeLayer />
            <BuildingsLayer />
            <WaterLayer />
            <RoadsLayer />
            <MeasurementHandler />
            <ToolPanelMount />
          </Viewer>
          <LayersStatus />
          <ToolsPanel />
        </div>
      </div>
    </div>
  );
}
