/**
 * AboutPanel — modal dialog documenting the app's data sources, imagery
 * providers, and tech stack.
 *
 * Accessibility:
 *   - role="dialog" aria-modal="true" aria-labelledby
 *   - Focus trap: close button is focused on open; focus restored on close.
 *   - Esc closes the dialog.
 *   - Backdrop click closes the dialog.
 *
 * State: open/close is controlled via props from the parent (App.tsx).
 * No Zustand state — this is purely local UI state.
 *
 * Rendered via createPortal into document.body so it overlays everything.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IMAGERY_ATTRIBUTIONS } from '../terrain/imageryProviders.js';

interface Props {
  open: boolean;
  onClose: () => void;
}

const DATA_SOURCES = [
  {
    name: 'Cesium Ion / Cesium World Terrain',
    usedFor: '3D terrain elevation',
    license: 'Cesium Ion ToS',
    attribution: '© Cesium',
  },
  {
    name: 'Bing Maps Aerial (via Cesium Ion)',
    usedFor: 'Satellite imagery drape',
    license: 'Cesium Ion / Bing ToS',
    attribution: '© Microsoft / Bing Maps',
  },
  {
    name: 'ArcGIS World Hillshade',
    usedFor: 'Hillshade imagery drape',
    license: 'ArcGIS Online ToS',
    attribution: '© Esri, USGS, NOAA',
  },
  {
    name: 'OpenTopoMap',
    usedFor: 'Topographic imagery drape',
    license: 'CC-BY-SA',
    attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
  },
  {
    name: 'OpenStreetMap (via Overpass API)',
    usedFor: 'Buildings, water bodies, roads',
    license: 'ODbL',
    attribution: '© OpenStreetMap contributors',
  },
  {
    name: 'MapLibre demotiles',
    usedFor: '2D selection map basemap',
    license: 'OpenMapTiles / ODbL',
    attribution: '© MapLibre, © OpenStreetMap contributors',
  },
];

const TECH_STACK = [
  'React 19',
  'Vite',
  'Cesium / Resium',
  'MapLibre GL',
  'Zustand',
  'Tailwind CSS',
  'Recharts',
  'Three.js',
];

const IMAGERY_MODES: { id: 'satellite' | 'hillshade' | 'topographic'; label: string }[] = [
  { id: 'satellite', label: 'Satellite' },
  { id: 'hillshade', label: 'Hillshade' },
  { id: 'topographic', label: 'Topographic' },
];

export default function AboutPanel({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus management: save active element on open, restore on close.
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Defer focus to next tick so the portal has mounted.
      setTimeout(() => closeRef.current?.focus(), 0);
    } else {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  // Esc closes the dialog.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby="about-panel-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        className={[
          'relative z-10 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl',
          'w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <h2
            id="about-panel-title"
            className="text-lg font-semibold text-white"
          >
            About this app
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close About panel"
            className="text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded p-1"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 space-y-6 text-sm text-gray-300">

          {/* Project description */}
          <section aria-labelledby="about-desc-heading">
            <h3 id="about-desc-heading" className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
              About
            </h3>
            <p>
              Terrain Visualizer is an open-source web tool for exploring 3D terrain in any
              area of the world. Draw a selection rectangle or polygon on the 2D map, then
              inspect the resulting scene with buildings, water bodies, roads, and analytical
              overlays (elevation profile, slope/aspect, area/volume, viewshed) in the Cesium
              3D viewer.
            </p>
            <p className="mt-2">
              Built with freely available data sources and open-source libraries. Terrain data
              is served via Cesium Ion; vector data is fetched live from the Overpass API.
            </p>
          </section>

          {/* Data sources table */}
          <section aria-labelledby="about-sources-heading">
            <h3 id="about-sources-heading" className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
              Data sources
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" aria-label="Data sources">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="text-left py-1.5 pr-3 font-medium">Source</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Used for</th>
                    <th className="text-left py-1.5 pr-3 font-medium">License</th>
                    <th className="text-left py-1.5 font-medium">Attribution</th>
                  </tr>
                </thead>
                <tbody>
                  {DATA_SOURCES.map((src) => (
                    <tr key={src.name} className="border-b border-gray-800">
                      <td className="py-1.5 pr-3 text-gray-200 font-medium whitespace-nowrap">{src.name}</td>
                      <td className="py-1.5 pr-3 text-gray-400">{src.usedFor}</td>
                      <td className="py-1.5 pr-3 text-gray-400 whitespace-nowrap">{src.license}</td>
                      <td className="py-1.5 text-gray-400">{src.attribution}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Imagery providers */}
          <section aria-labelledby="about-imagery-heading">
            <h3 id="about-imagery-heading" className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
              Imagery providers
            </h3>
            <ul className="space-y-1">
              {IMAGERY_MODES.map(({ id, label }) => (
                <li key={id} className="text-xs">
                  <span className="font-medium text-gray-200">{label}:</span>{' '}
                  <span className="text-gray-400">{IMAGERY_ATTRIBUTIONS[id]}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Tech stack */}
          <section aria-labelledby="about-tech-heading">
            <h3 id="about-tech-heading" className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
              Tech stack
            </h3>
            <ul className="flex flex-wrap gap-2">
              {TECH_STACK.map((lib) => (
                <li
                  key={lib}
                  className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300"
                >
                  {lib}
                </li>
              ))}
            </ul>
          </section>

          {/* Cesium Ion note */}
          <section aria-labelledby="about-cesium-heading">
            <h3 id="about-cesium-heading" className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
              Cesium Ion
            </h3>
            <p className="text-xs">
              Terrain elevation and default satellite imagery are served by{' '}
              <span className="text-white font-medium">Cesium Ion</span>. Access is provided
              via a personal Cesium Ion account. Cesium&apos;s built-in credit overlay (bottom-left
              of the 3D view) surfaces additional per-tile attributions automatically.
            </p>
          </section>

        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
