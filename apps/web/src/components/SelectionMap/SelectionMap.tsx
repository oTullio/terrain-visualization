/**
 * SelectionMap — Phase B1
 *
 * Public component. Composes useMapLibreMap + useDrawingTools + SelectionToolbar.
 * Owns Zustand wiring and handleConfirm / handleReset only.
 *
 * Tailwind classes only — no CSS Modules.
 */

import { useRef, useState, useCallback } from 'react';
import { bboxFromPolygon, geodesicAreaSqKm, isWithinCap } from '@terrain/shared';
import { useAppStore } from '../../store/useAppStore.js';
import type { SelectionShape } from '../../store/useAppStore.js';
import { useMapLibreMap } from './useMapLibreMap.js';
import { useDrawingTools } from './useDrawingTools.js';
import SelectionToolbar from './SelectionToolbar.js';

export default function SelectionMap() {
  const mapContainer = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<SelectionShape>('rectangle');
  const [hasConfirmed, setHasConfirmed] = useState(false);

  const { setSelection, clearSelection } = useAppStore();

  // Map initialisation
  const { map: mapRef, ready } = useMapLibreMap(mapContainer);

  // Drawing tools (single mousemove — see useDrawingTools.ts)
  const { previewPolygon, reset: resetDrawing } = useDrawingTools(mapRef, ready, mode);

  // Derived values
  const previewArea = previewPolygon ? geodesicAreaSqKm(previewPolygon) : null;
  const capResult = previewPolygon ? isWithinCap(previewPolygon) : null;
  const isOverCap = capResult !== null && !capResult.ok;
  const canConfirm = previewPolygon !== null && !isOverCap;

  // -------------------------------------------------------------------------
  // Mode change
  // -------------------------------------------------------------------------

  const handleModeChange = useCallback((newMode: SelectionShape) => {
    setMode(newMode);
    resetDrawing();
    setHasConfirmed(false);
  }, [resetDrawing]);

  // -------------------------------------------------------------------------
  // Confirm selection
  // -------------------------------------------------------------------------

  const handleConfirm = useCallback(() => {
    if (!previewPolygon || isOverCap) return;
    const bbox = bboxFromPolygon(previewPolygon);
    setSelection({ polygon: previewPolygon, bbox });
    setHasConfirmed(true);
  }, [previewPolygon, isOverCap, setSelection]);

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  const handleReset = useCallback(() => {
    resetDrawing();
    setHasConfirmed(false);
    clearSelection();
  }, [resetDrawing, clearSelection]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      <SelectionToolbar
        mode={mode}
        onModeChange={handleModeChange}
        previewArea={previewArea}
        isOverCap={isOverCap}
        canConfirm={canConfirm}
        onConfirm={handleConfirm}
        onReset={handleReset}
        hasConfirmed={hasConfirmed}
      />

      {/* Map container */}
      <div ref={mapContainer} className="flex-1 min-h-0" />
    </div>
  );
}
