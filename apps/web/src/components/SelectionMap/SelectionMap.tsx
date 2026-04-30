/**
 * SelectionMap — Phase B1
 *
 * Renders a MapLibre GL JS 2D map with rectangle and polygon drawing tools.
 * The user draws a shape, sees a live area readout with a 100 km² cap warning,
 * and can confirm the selection (writing to Zustand) or reset it.
 *
 * Drawing is implemented with raw MapLibre mouse events + a GeoJSON source.
 * No external drawing library is used — the approach is ~100 lines of event
 * handling and is easier to control.
 *
 * Tailwind classes only — no CSS Modules.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type GeoJSON from 'geojson';
import {
  bboxFromPolygon,
  geodesicAreaSqKm,
  MAX_SELECTION_SQ_KM,
  isWithinCap,
} from '@terrain/shared';
import { useAppStore } from '../../store/useAppStore.js';
import type { SelectionShape } from '../../store/useAppStore.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DrawState {
  mode: SelectionShape;
  /** true = actively dragging/clicking to add vertices */
  drawing: boolean;
  /** Vertices collected so far ([lng, lat] pairs) */
  vertices: [number, number][];
  /** Mouse position during drag/hover (not yet confirmed) */
  cursor: [number, number] | null;
}

const DEMOTILES_STYLE = 'https://demotiles.maplibre.org/style.json';

// GeoJSON source IDs used in the map
const SOURCE_DRAW = 'draw-preview';
const LAYER_FILL = 'draw-fill';
const LAYER_LINE = 'draw-line';
const LAYER_VERTEX = 'draw-vertex';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lngLatToCoord(ll: maplibregl.LngLat): [number, number] {
  return [ll.lng, ll.lat];
}

/** Build a GeoJSON polygon (or line) from current draw state for preview. */
function buildPreviewGeometry(
  vertices: [number, number][],
  cursor: [number, number] | null,
  mode: SelectionShape,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  // Build ring from vertices + cursor
  const pts = cursor ? [...vertices, cursor] : [...vertices];

  if (pts.length < 2) {
    // Not enough points to draw anything
    return { type: 'FeatureCollection', features };
  }

  if (mode === 'rectangle') {
    // Two-corner rectangle: pts[0] = start corner, pts[last] = current corner
    const start = pts[0]!;
    const end = pts[pts.length - 1]!;
    const ring: [number, number][] = [
      [start[0], start[1]],
      [end[0], start[1]],
      [end[0], end[1]],
      [start[0], end[1]],
      [start[0], start[1]],
    ];
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
    // Vertex dots
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPoint', coordinates: ring.slice(0, 4) },
    });
  } else {
    // Polygon mode: lines connecting vertices + cursor
    if (pts.length >= 3) {
      const ring = [...pts, pts[0]!]; // close the ring
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }
    // Show the line in progress
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: pts },
    });
    // Vertex dots
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPoint', coordinates: pts },
    });
  }

  return { type: 'FeatureCollection', features };
}

/** Extract the polygon geometry from the drawn vertices for a given mode. */
function finalPolygon(
  vertices: [number, number][],
  mode: SelectionShape,
): GeoJSON.Polygon | null {
  if (mode === 'rectangle' && vertices.length >= 2) {
    const start = vertices[0]!;
    const end = vertices[vertices.length - 1]!;
    return {
      type: 'Polygon',
      coordinates: [
        [
          [start[0], start[1]],
          [end[0], start[1]],
          [end[0], end[1]],
          [start[0], end[1]],
          [start[0], start[1]],
        ],
      ],
    };
  }
  if (mode === 'polygon' && vertices.length >= 3) {
    return {
      type: 'Polygon',
      coordinates: [[...vertices, vertices[0]!]],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SelectionMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawStateRef = useRef<DrawState>({
    mode: 'rectangle',
    drawing: false,
    vertices: [],
    cursor: null,
  });

  const [mode, setMode] = useState<SelectionShape>('rectangle');
  const [previewPolygon, setPreviewPolygon] = useState<GeoJSON.Polygon | null>(null);
  const [confirmedPolygon, setConfirmedPolygon] = useState<GeoJSON.Polygon | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { setSelection, clearSelection } = useAppStore();

  // Derived values from preview polygon
  const previewArea = previewPolygon ? geodesicAreaSqKm(previewPolygon) : null;
  const capResult = previewPolygon ? isWithinCap(previewPolygon) : null;
  const isOverCap = capResult !== null && !capResult.ok;
  const canConfirm = previewPolygon !== null && !isOverCap;

  // -------------------------------------------------------------------------
  // Map initialisation
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: DEMOTILES_STYLE,
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      // --- GeoJSON source for drawing preview ---
      map.addSource(SOURCE_DRAW, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Fill layer (polygon area)
      map.addLayer({
        id: LAYER_FILL,
        type: 'fill',
        source: SOURCE_DRAW,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#3b82f6', // blue-500
          'fill-opacity': 0.25,
        },
      });

      // Outline layer (polygon/line border)
      map.addLayer({
        id: LAYER_LINE,
        type: 'line',
        source: SOURCE_DRAW,
        filter: ['any', ['==', '$type', 'Polygon'], ['==', '$type', 'LineString']],
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
          'line-dasharray': [2, 1],
        },
      });

      // Vertex dots
      map.addLayer({
        id: LAYER_VERTEX,
        type: 'circle',
        source: SOURCE_DRAW,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#3b82f6',
          'circle-stroke-width': 2,
        },
      });

      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Update the GeoJSON source whenever draw state changes
  // -------------------------------------------------------------------------

  const updatePreview = useCallback(
    (vertices: [number, number][], cursor: [number, number] | null, drawMode: SelectionShape) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;

      const geojson = buildPreviewGeometry(vertices, cursor, drawMode);
      const source = map.getSource(SOURCE_DRAW) as maplibregl.GeoJSONSource | undefined;
      source?.setData(geojson);

      // Keep previewPolygon state in sync (no cursor influence for the "confirmed" shape)
      const poly = finalPolygon(vertices, drawMode);
      setPreviewPolygon(poly);
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Drawing event handlers
  // -------------------------------------------------------------------------

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Keep draw state ref in sync with mode state
    drawStateRef.current.mode = mode;

    const getCanvas = () => map.getCanvas();

    // ----- RECTANGLE mode -----
    // mousedown: start drag, mouseup: finish
    // ----- POLYGON mode -----
    // click: add vertex, dblclick: finish

    function onMouseDown(e: maplibregl.MapMouseEvent) {
      const ds = drawStateRef.current;
      if (ds.mode !== 'rectangle') return;
      // Start drawing rectangle on left mousedown
      ds.drawing = true;
      ds.vertices = [lngLatToCoord(e.lngLat)];
      ds.cursor = lngLatToCoord(e.lngLat);
      getCanvas().style.cursor = 'crosshair';
      updatePreview(ds.vertices, ds.cursor, ds.mode);
      map?.dragPan.disable();
    }

    function onMouseMove(e: maplibregl.MapMouseEvent) {
      const ds = drawStateRef.current;
      if (!ds.drawing) return;
      ds.cursor = lngLatToCoord(e.lngLat);
      updatePreview(ds.vertices, ds.cursor, ds.mode);
    }

    function onMouseUp(e: maplibregl.MapMouseEvent) {
      const ds = drawStateRef.current;
      if (!ds.drawing) return;
      ds.drawing = false;
      ds.cursor = null;
      // Add the end vertex
      ds.vertices = [...ds.vertices, lngLatToCoord(e.lngLat)];
      updatePreview(ds.vertices, null, ds.mode);
      getCanvas().style.cursor = '';
      map?.dragPan.enable();
    }

    function onPolygonClick(e: maplibregl.MapMouseEvent) {
      const ds = drawStateRef.current;
      if (ds.mode !== 'polygon') return;
      // Add vertex
      ds.vertices = [...ds.vertices, lngLatToCoord(e.lngLat)];
      ds.drawing = true;
      updatePreview(ds.vertices, ds.cursor, ds.mode);
    }

    function onPolygonMouseMove(e: maplibregl.MapMouseEvent) {
      const ds = drawStateRef.current;
      if (ds.mode !== 'polygon' || !ds.drawing) return;
      ds.cursor = lngLatToCoord(e.lngLat);
      updatePreview(ds.vertices, ds.cursor, ds.mode);
    }

    function onPolygonDblClick(e: maplibregl.MapMouseEvent) {
      e.preventDefault(); // prevent zoom
      const ds = drawStateRef.current;
      if (ds.mode !== 'polygon') return;
      // Remove the last duplicate point added by the second click
      if (ds.vertices.length > 1) {
        ds.vertices = ds.vertices.slice(0, -1);
      }
      ds.drawing = false;
      ds.cursor = null;
      updatePreview(ds.vertices, null, ds.mode);
      getCanvas().style.cursor = '';
    }

    function onMouseEnter() {
      const ds = drawStateRef.current;
      if (ds.mode === 'polygon' && ds.drawing) return;
      if (ds.mode === 'rectangle') {
        getCanvas().style.cursor = 'crosshair';
      } else {
        getCanvas().style.cursor = 'crosshair';
      }
    }

    function onMouseLeave() {
      const ds = drawStateRef.current;
      if (!ds.drawing) getCanvas().style.cursor = '';
    }

    // Attach events
    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('click', onPolygonClick);
    map.on('mousemove', onPolygonMouseMove);
    map.on('dblclick', onPolygonDblClick);
    map.on('mouseenter', onMouseEnter);
    map.on('mouseleave', onMouseLeave);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('click', onPolygonClick);
      map.off('mousemove', onPolygonMouseMove);
      map.off('dblclick', onPolygonDblClick);
      map.off('mouseenter', onMouseEnter);
      map.off('mouseleave', onMouseLeave);
      map.dragPan.enable();
    };
  }, [mapReady, mode, updatePreview]);

  // -------------------------------------------------------------------------
  // Mode change — reset drawing state
  // -------------------------------------------------------------------------

  const handleModeChange = useCallback(
    (newMode: SelectionShape) => {
      const ds = drawStateRef.current;
      ds.mode = newMode;
      ds.drawing = false;
      ds.vertices = [];
      ds.cursor = null;
      setMode(newMode);
      setPreviewPolygon(null);
      setConfirmedPolygon(null);

      // Clear map preview
      const map = mapRef.current;
      if (map && map.isStyleLoaded()) {
        const source = map.getSource(SOURCE_DRAW) as maplibregl.GeoJSONSource | undefined;
        source?.setData({ type: 'FeatureCollection', features: [] });
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Confirm selection
  // -------------------------------------------------------------------------

  const handleConfirm = useCallback(() => {
    if (!previewPolygon || isOverCap) return;
    const bbox = bboxFromPolygon(previewPolygon);
    setSelection({ polygon: previewPolygon, bbox });
    setConfirmedPolygon(previewPolygon);
  }, [previewPolygon, isOverCap, setSelection]);

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  const handleReset = useCallback(() => {
    const ds = drawStateRef.current;
    ds.drawing = false;
    ds.vertices = [];
    ds.cursor = null;
    setPreviewPolygon(null);
    setConfirmedPolygon(null);
    clearSelection();

    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      const source = map.getSource(SOURCE_DRAW) as maplibregl.GeoJSONSource | undefined;
      source?.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [clearSelection]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex-wrap">
        {/* Mode buttons */}
        <span className="text-xs text-gray-400 font-semibold uppercase tracking-widest mr-1">
          Draw:
        </span>
        <button
          type="button"
          onClick={() => handleModeChange('rectangle')}
          className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
            mode === 'rectangle'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Rectangle
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('polygon')}
          className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
            mode === 'polygon'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Polygon
        </button>

        {/* Instructions */}
        <span className="text-xs text-gray-500 ml-2">
          {mode === 'rectangle'
            ? 'Click and drag to draw a rectangle'
            : 'Click to add points, double-click to finish'}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Area readout */}
        {previewArea !== null && (
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded ${
              isOverCap
                ? 'bg-red-900 text-red-300 border border-red-600'
                : 'bg-gray-700 text-green-300'
            }`}
          >
            {previewArea.toFixed(2)} km²
          </span>
        )}

        {/* Over-cap warning */}
        {isOverCap && (
          <span className="text-xs text-red-400 font-medium">
            Selection too large — max {MAX_SELECTION_SQ_KM} km²
          </span>
        )}

        {/* Action buttons */}
        {previewPolygon && (
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1 text-xs rounded font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            Reset
          </button>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
            canConfirm
              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Confirm selection
        </button>
      </div>

      {/* Confirmed badge */}
      {confirmedPolygon && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-900/50 border-b border-emerald-700 shrink-0">
          <span className="text-xs text-emerald-400 font-medium">
            Selection confirmed — stored in Zustand (Phase B2 will fetch buildings)
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-emerald-500 underline hover:text-emerald-300"
          >
            Clear
          </button>
        </div>
      )}

      {/* Map container */}
      <div ref={mapContainer} className="flex-1 min-h-0" />
    </div>
  );
}
