/**
 * SelectionToolbar — toolbar UI for the SelectionMap.
 *
 * Pure presentational component; all logic lives in SelectionMap.tsx.
 */

import { MAX_SELECTION_SQ_KM } from '@terrain/shared';
import type { SelectionShape } from '../../store/useAppStore.js';

export interface SelectionToolbarProps {
  mode: SelectionShape;
  onModeChange: (mode: SelectionShape) => void;
  previewArea: number | null;
  isOverCap: boolean;
  canConfirm: boolean;
  onConfirm: () => void;
  onReset: () => void;
  hasConfirmed: boolean;
}

export default function SelectionToolbar({
  mode,
  onModeChange,
  previewArea,
  isOverCap,
  canConfirm,
  onConfirm,
  onReset,
  hasConfirmed,
}: SelectionToolbarProps) {
  return (
    <>
      {/* Main toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex-wrap">
        {/* Mode buttons */}
        <span className="text-xs text-gray-400 font-semibold uppercase tracking-widest mr-1">
          Draw:
        </span>
        <button
          type="button"
          onClick={() => onModeChange('rectangle')}
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
          onClick={() => onModeChange('polygon')}
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

        {/* Reset button — only shown when there is something to reset */}
        {previewArea !== null && (
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-1 text-xs rounded font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            Reset
          </button>
        )}

        <button
          type="button"
          onClick={onConfirm}
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
      {hasConfirmed && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-900/50 border-b border-emerald-700 shrink-0">
          <span className="text-xs text-emerald-400 font-medium">
            Selection confirmed — stored in Zustand (Phase B2 will fetch buildings)
          </span>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-emerald-500 underline hover:text-emerald-300"
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
}
