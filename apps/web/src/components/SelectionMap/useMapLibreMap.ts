/**
 * useMapLibreMap — owns MapLibre GL JS initialisation and teardown.
 *
 * Returns a stable ref to the map instance and a `ready` boolean that becomes
 * true once the style has loaded and drawing sources/layers have been added.
 */

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const DEMOTILES_STYLE = 'https://demotiles.maplibre.org/style.json';

// GeoJSON source / layer IDs — exported so sibling modules can reference them.
export const SOURCE_DRAW = 'draw-preview';
export const LAYER_FILL = 'draw-fill';
export const LAYER_LINE = 'draw-line';
export const LAYER_VERTEX = 'draw-vertex';

export function useMapLibreMap(containerRef: RefObject<HTMLDivElement | null>): {
  map: RefObject<maplibregl.Map | null>;
  ready: boolean;
} {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Touch gestures inherit from MapLibre defaults — pinch zoom, two-finger
    // pan, and drag pan all work on supported devices without any extra
    // configuration. We do NOT set `interactive: false` or any of the
    // individual touch-disabling options (touchZoomRotate, dragPan, etc.).
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEMOTILES_STYLE,
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      // Drawing preview source
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
          'fill-color': '#3b82f6',
          'fill-opacity': 0.25,
        },
      });

      // Outline layer
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

      setReady(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { map: mapRef, ready };
}
