/**
 * App shell.
 *
 * Layout:
 *
 *   Desktop (≥ md = 768 px):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  header (fixed, h-12)                  [toggles →]          │
 *   ├──────────────────────────┬─────────────────────────────────  │
 *   │ 2D SelectionMap          │  Cesium 3D Viewer                │
 *   │ (left half, w-1/2)       │  (right half, w-1/2)             │
 *   └──────────────────────────┴──────────────────────────────────┘
 *
 *   Mobile (< md):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  header (h-12)   [Selection btn] [toggles →]                │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  Cesium 3D Viewer (full width, full height)                 │
 *   │  ┌──────────────────────────────────┐                       │
 *   │  │ SelectionMap overlay (z-20)      │  (visible when open)  │
 *   │  └──────────────────────────────────┘                       │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Responsive behaviour implemented with Tailwind `md:` prefixes (option a
 * from the E5 plan) — no separate wrapper component needed.
 *
 * On mount, an optional `?bbox=west,south,east,north` URL query is
 * parsed and used to pre-fill the selection (rectangle polygon derived
 * from the bbox). This is the stress-test entrypoint — see
 * src/buildings/STRESS_TEST.md.
 *
 * Touch gestures: Cesium's ScreenSpaceCameraController and MapLibre's Map
 * constructor are left at their defaults — pinch-zoom, two-finger orbit,
 * and drag-pan all work on supported devices without any code changes here.
 * Do NOT set enableInputs = false or any rotate/tilt-disabling property.
 * Do NOT set interactive: false on the MapLibre instance.
 */
import { useEffect, useRef, useState } from 'react';
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
import ReducedSceneToggle from './components/ReducedSceneToggle.js';
import ExportPanel from './components/ExportPanel.js';
import MeasurementHandler from './tools/MeasurementHandler.js';
import ToolPanelMount from './tools/ToolPanelMount.js';
import AttributionOverlay from './components/AttributionOverlay.js';
import AboutButton from './components/AboutButton.js';
import AboutPanel from './components/AboutPanel.js';
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
  const [aboutOpen, setAboutOpen] = useState(false);

  /**
   * Mobile sidebar open/close state.
   * On desktop (≥ md) the sidebar is always visible in the 50/50 layout and
   * this state has no effect. On mobile the sidebar renders as a full-width
   * overlay when true.
   */
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /** Ref used to detect tap-outside on the mobile overlay. */
  const sidebarRef = useRef<HTMLDivElement>(null);

  // One-shot URL ?bbox= ingestion. Strictly mount-time so user-driven
  // selection changes aren't clobbered.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bbox = parseBboxQuery(window.location.search);
    if (!bbox) return;
    setSelection({ bbox, polygon: bboxToPolygon(bbox) });
  }, [setSelection]);

  // Close sidebar on Escape key.
  useEffect(() => {
    if (!sidebarOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSidebarOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  return (
    <div className="flex flex-col w-full h-full bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center px-4 h-12 bg-gray-900 border-b border-gray-800 shrink-0 z-10">
        <span className="text-sm font-semibold tracking-wide text-emerald-400">
          Terrain Visualizer
        </span>
        <span className="ml-3 text-xs text-gray-500 hidden md:inline">3D terrain visualizer</span>

        {/* Mobile-only: "Selection" toggle button (opens the sidebar overlay) */}
        <button
          type="button"
          aria-label="Show selection map"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
          className="ml-3 md:hidden px-2.5 py-1 rounded text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          Selection
        </button>

        <div className="ml-auto flex items-center gap-3">
          {/* Slot for ExportPanel — populated via portal from inside <Viewer>
              so the export buttons can use useCesium() while their DOM lives
              in the header. See components/ExportPanel.tsx. */}
          <div id="export-panel-slot" />
          <AboutButton onClick={() => setAboutOpen(true)} />
          <ReducedSceneToggle />
          <SurfaceDrapeToggle />
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">

        {/*
          Left panel — 2D SelectionMap.

          Desktop (md+): always visible as the left half (w-1/2).
          Mobile (<md):  hidden by default; becomes a full-width absolute
                         overlay when sidebarOpen === true.
        */}
        <div
          ref={sidebarRef}
          className={[
            // Mobile overlay positioning + visibility
            'absolute inset-0 z-20 flex flex-col bg-gray-950',
            // On mobile hide unless open; on desktop always show as the left half
            sidebarOpen ? 'flex' : 'hidden',
            // Desktop: reset to the static 50/50 layout
            'md:relative md:flex md:w-1/2 md:shrink-0 md:border-r md:border-gray-800 md:overflow-hidden',
          ].join(' ')}
        >
          {/* Panel header — mobile close button + desktop label */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Select Area
            </p>
            {/* Close button — visible only on mobile */}
            <button
              type="button"
              aria-label="Close selection map"
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded p-1"
            >
              ✕
            </button>
          </div>
          <SelectionMap />
        </div>

        {/*
          Mobile backdrop — tapping outside the sidebar closes it.
          Rendered as a sibling of the sidebar so clicks on the 3D viewer
          area (the uncovered strip) also close the panel.
          Hidden on desktop (the sidebar is always open there).
        */}
        {sidebarOpen && (
          <div
            aria-hidden="true"
            className="md:hidden absolute inset-0 z-10 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Right panel — Cesium 3D viewer. Full width on mobile; right half on desktop. */}
        <div className="relative flex-1 min-w-0">
          {/*
           * Touch gestures inherit from Cesium defaults — pinch zoom,
           * two-finger orbit, and drag pan all work on supported devices.
           * We do NOT set ScreenSpaceCameraController.enableInputs = false
           * or any rotate/tilt-disabling property on the <Viewer>.
           */}
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
            <ExportPanel />
          </Viewer>
          <LayersStatus />
          <AttributionOverlay />
          <ToolsPanel />
        </div>
      </div>
      <AboutPanel open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
