/**
 * BuildingsStatus — top-right overlay for the Cesium pane.
 *
 * Reads the `buildingsStatus` slice and shows:
 *   - "Loading buildings…" with a spinner when `status === 'loading'`.
 *   - "Showing N of M buildings (largest first)" when `status === 'ready'
 *     && dropped > 0`. Suppressed when nothing was dropped.
 *   - The error `userMessage` with a Dismiss button when `status === 'error'`.
 *
 * Container is `pointer-events-none` so it never blocks Cesium input;
 * each card flips `pointer-events-auto` so its buttons remain clickable.
 */
import { useAppStore } from '../store/useAppStore.js';

export default function BuildingsStatus() {
  const status = useAppStore((s) => s.buildingsStatus);
  const clearStatus = useAppStore((s) => s.clearBuildingsStatus);

  // Idle and ready-with-no-cap → no UI.
  if (status.status === 'idle') return null;
  if (status.status === 'ready' && status.dropped === 0) return null;

  return (
    <div className="absolute top-3 right-3 z-20 max-w-xs pointer-events-none">
      {status.status === 'loading' && (
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-md bg-gray-900/90 border border-gray-700 shadow text-sm text-gray-100">
          <span
            aria-label="Loading"
            className="inline-block w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"
          />
          <span>Loading buildings…</span>
        </div>
      )}

      {status.status === 'ready' && status.dropped > 0 && (
        <div className="pointer-events-auto px-3 py-2 rounded-md bg-amber-900/90 border border-amber-700 shadow text-sm text-amber-50">
          Showing {status.kept.toLocaleString()} of {status.total.toLocaleString()}{' '}
          buildings (largest first)
        </div>
      )}

      {status.status === 'error' && (
        <div
          role="alert"
          className="pointer-events-auto px-3 py-2 rounded-md bg-red-950/95 border border-red-700 shadow text-sm text-red-50"
        >
          <p>{status.error ?? "Couldn't load buildings — please try again."}</p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={clearStatus}
              className="text-xs px-2 py-1 rounded bg-red-800/70 hover:bg-red-800 border border-red-600 text-red-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
