/**
 * LayersStatus — top-right overlay showing status for all active data layers.
 *
 * Replaces the single-layer BuildingsStatus component. Each layer with a
 * non-idle status appears as a stacked row. Roads will join automatically
 * in Phase C3 once /api/roads is wired up.
 *
 * Visibility rules (per row):
 *   - idle      → hidden (no "Buildings: idle" clutter)
 *   - loading   → show spinner + "Loading <name>…"
 *   - ready, dropped === 0 → hidden (all features visible, nothing to report)
 *   - ready, dropped > 0  → show amber cap notice
 *   - error     → show red alert with verbatim message + Dismiss button
 *
 * Container is `pointer-events-none` so it never blocks Cesium input;
 * each card flips `pointer-events-auto` so its buttons remain clickable.
 */
import { useAppStore } from '../store/useAppStore.js';
import type { LayerId, LayerStatus } from '../store/useAppStore.js';

// Layers to display, in render order. Roads is listed but will show nothing
// until Phase C3 wires up the status updates.
const DISPLAY_LAYERS: { id: LayerId; label: string }[] = [
  { id: 'buildings', label: 'Buildings' },
  { id: 'water', label: 'Water' },
  { id: 'roads', label: 'Roads' },
];

interface LayerRowProps {
  label: string;
  layerId: LayerId;
  status: LayerStatus;
  onDismiss: () => void;
}

function LayerRow({ label, layerId: _layerId, status, onDismiss }: LayerRowProps) {
  if (status.status === 'idle') return null;
  if (status.status === 'ready' && status.dropped === 0) return null;

  return (
    <>
      {status.status === 'loading' && (
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-md bg-gray-900/90 border border-gray-700 shadow text-sm text-gray-100">
          <span
            aria-label={`Loading ${label}`}
            className="inline-block w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"
          />
          <span>Loading {label.toLowerCase()}…</span>
        </div>
      )}

      {status.status === 'ready' && status.dropped > 0 && (
        <div className="pointer-events-auto px-3 py-2 rounded-md bg-amber-900/90 border border-amber-700 shadow text-sm text-amber-50">
          {label}: showing {status.kept.toLocaleString()} of {status.total.toLocaleString()}{' '}
          (largest first)
        </div>
      )}

      {status.status === 'error' && (
        <div
          role="alert"
          className="pointer-events-auto px-3 py-2 rounded-md bg-red-950/95 border border-red-700 shadow text-sm text-red-50"
        >
          <p>
            <span className="font-semibold">{label}:</span>{' '}
            {status.message ?? `Couldn't load ${label.toLowerCase()} — please try again.`}
          </p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs px-2 py-1 rounded bg-red-800/70 hover:bg-red-800 border border-red-600 text-red-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function LayersStatus() {
  const layerStatus = useAppStore((s) => s.layerStatus);
  const setLayerStatus = useAppStore((s) => s.setLayerStatus);

  // Check whether any layer has something to show (avoid empty container)
  const hasAnything = DISPLAY_LAYERS.some(({ id }) => {
    const s = layerStatus[id];
    if (s.status === 'idle') return false;
    if (s.status === 'ready' && s.dropped === 0) return false;
    return true;
  });

  if (!hasAnything) return null;

  return (
    <div className="absolute top-3 right-3 z-30 max-w-xs pointer-events-none flex flex-col gap-2">
      {DISPLAY_LAYERS.map(({ id, label }) => (
        <LayerRow
          key={id}
          label={label}
          layerId={id}
          status={layerStatus[id]}
          onDismiss={() => setLayerStatus(id, { status: 'idle' })}
        />
      ))}
    </div>
  );
}
