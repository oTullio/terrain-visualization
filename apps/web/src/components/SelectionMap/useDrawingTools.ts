/**
 * useDrawingTools — owns all drawing event listeners for rectangle and polygon
 * selection modes.
 *
 * Fix 5: A SINGLE `mousemove` handler is registered. It switches on
 * `drawStateRef.current.mode` internally, so there is never a duplicate
 * mousemove binding.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import type GeoJSON from 'geojson';
import type { SelectionShape } from '../../store/useAppStore.js';
import { buildPreviewGeometry, finalPolygon } from './previewGeometry.js';
import { SOURCE_DRAW } from './useMapLibreMap.js';

interface DrawState {
  mode: SelectionShape;
  drawing: boolean;
  vertices: [number, number][];
  cursor: [number, number] | null;
}

function lngLatToCoord(ll: maplibregl.LngLat): [number, number] {
  return [ll.lng, ll.lat];
}

export interface DrawingToolsResult {
  previewPolygon: GeoJSON.Polygon | null;
  finalPolygonOrNull: GeoJSON.Polygon | null;
  reset: () => void;
}

export function useDrawingTools(
  mapRef: RefObject<maplibregl.Map | null>,
  ready: boolean,
  mode: SelectionShape,
): DrawingToolsResult {
  const drawStateRef = useRef<DrawState>({
    mode,
    drawing: false,
    vertices: [],
    cursor: null,
  });

  const [previewPolygon, setPreviewPolygon] = useState<GeoJSON.Polygon | null>(null);

  // ---------------------------------------------------------------------------
  // Internal helper: push updated geometry to the map source + sync state
  // ---------------------------------------------------------------------------

  const updatePreview = useCallback(
    (vertices: [number, number][], cursor: [number, number] | null, drawMode: SelectionShape) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;

      const geojson = buildPreviewGeometry(vertices, cursor, drawMode);
      const source = map.getSource(SOURCE_DRAW) as maplibregl.GeoJSONSource | undefined;
      source?.setData(geojson);

      // Update previewPolygon state (cursor excluded — this is the "committed" shape).
      setPreviewPolygon(finalPolygon(vertices, drawMode));
    },
    [mapRef],
  );

  // ---------------------------------------------------------------------------
  // Keep drawStateRef.mode in sync with the mode prop
  // ---------------------------------------------------------------------------

  useEffect(() => {
    drawStateRef.current.mode = mode;
  }, [mode]);

  // ---------------------------------------------------------------------------
  // Mount / unmount event listeners when map is ready
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const getCanvas = () => map.getCanvas();

    // ----- mousedown: start rectangle drag -----
    function onMouseDown(e: maplibregl.MapMouseEvent) {
      const ds = drawStateRef.current;
      if (ds.mode !== 'rectangle') return;
      ds.drawing = true;
      ds.vertices = [lngLatToCoord(e.lngLat)];
      ds.cursor = lngLatToCoord(e.lngLat);
      getCanvas().style.cursor = 'crosshair';
      updatePreview(ds.vertices, ds.cursor, ds.mode);
      map!.dragPan.disable();
    }

    // ----- SINGLE mousemove handler — switches on mode internally (Fix 5) -----
    function onMouseMove(e: maplibregl.MapMouseEvent) {
      const ds = drawStateRef.current;
      if (ds.mode === 'rectangle') {
        if (!ds.drawing) return;
        ds.cursor = lngLatToCoord(e.lngLat);
        updatePreview(ds.vertices, ds.cursor, ds.mode);
      } else {
        // polygon mode
        if (!ds.drawing) return;
        ds.cursor = lngLatToCoord(e.lngLat);
        updatePreview(ds.vertices, ds.cursor, ds.mode);
      }
    }

    // ----- mouseup: finish rectangle -----
    function onMouseUp(e: maplibregl.MapMouseEvent) {
      const ds = drawStateRef.current;
      if (!ds.drawing || ds.mode !== 'rectangle') return;
      ds.drawing = false;
      ds.cursor = null;
      ds.vertices = [...ds.vertices, lngLatToCoord(e.lngLat)];
      updatePreview(ds.vertices, null, ds.mode);
      getCanvas().style.cursor = '';
      map!.dragPan.enable();
    }

    // ----- click: add polygon vertex -----
    function onPolygonClick(e: maplibregl.MapMouseEvent) {
      const ds = drawStateRef.current;
      if (ds.mode !== 'polygon') return;
      ds.vertices = [...ds.vertices, lngLatToCoord(e.lngLat)];
      ds.drawing = true;
      updatePreview(ds.vertices, ds.cursor, ds.mode);
    }

    // ----- dblclick: finish polygon -----
    function onPolygonDblClick(e: maplibregl.MapMouseEvent) {
      e.preventDefault(); // prevent zoom
      const ds = drawStateRef.current;
      if (ds.mode !== 'polygon') return;
      // Remove the duplicate point added by the second click.
      if (ds.vertices.length > 1) {
        ds.vertices = ds.vertices.slice(0, -1);
      }
      ds.drawing = false;
      ds.cursor = null;
      updatePreview(ds.vertices, null, ds.mode);
      getCanvas().style.cursor = '';
    }

    // ----- mouseenter / mouseleave: cursor style -----
    function onMouseEnter() {
      const ds = drawStateRef.current;
      if (ds.mode === 'polygon' && ds.drawing) return;
      getCanvas().style.cursor = 'crosshair';
    }

    function onMouseLeave() {
      const ds = drawStateRef.current;
      if (!ds.drawing) getCanvas().style.cursor = '';
    }

    // Attach — only ONE mousemove handler is registered here (Fix 5).
    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('click', onPolygonClick);
    map.on('dblclick', onPolygonDblClick);
    map.on('mouseenter', onMouseEnter);
    map.on('mouseleave', onMouseLeave);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('click', onPolygonClick);
      map.off('dblclick', onPolygonDblClick);
      map.off('mouseenter', onMouseEnter);
      map.off('mouseleave', onMouseLeave);
      map.dragPan.enable();
    };
  }, [ready, mapRef, updatePreview]);

  // ---------------------------------------------------------------------------
  // reset — clears draw state and map source
  // ---------------------------------------------------------------------------

  const reset = useCallback(() => {
    const ds = drawStateRef.current;
    ds.drawing = false;
    ds.vertices = [];
    ds.cursor = null;
    setPreviewPolygon(null);

    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      const source = map.getSource(SOURCE_DRAW) as maplibregl.GeoJSONSource | undefined;
      source?.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [mapRef]);

  return {
    previewPolygon,
    finalPolygonOrNull: previewPolygon,
    reset,
  };
}
