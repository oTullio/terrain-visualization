/**
 * ViewshedTool — sidebar panel rendered when `activeTool === 'viewshed'`.
 *
 * The Cesium-side computation and overlay live in ViewshedLayer. This panel
 * shows:
 *   - Before observer: instruction prompt.
 *   - After observer: formatted position + status + legend + inputs.
 *
 * UI states
 * ---------
 *   - observer === null   → "Click on the scene to place observer"
 *   - status 'computing'  → "Computing visibility… (sampling N×M grid)"
 *   - status 'ready'      → "Visibility computed." + legend
 *   - status 'error'      → red error message
 *   - status 'idle'/'picking' with observer → "Place an observer point to begin."
 */
import { useAppStore } from '../../store/useAppStore.js';

/** Format a coordinate to four decimal places, with ° suffix. */
function fmtCoord(v: number): string {
  return `${v.toFixed(4)}°`;
}

/** Format a height to one decimal place, with m suffix. */
function fmtHeight(m: number): string {
  return `${m.toFixed(1)} m`;
}

interface LegendItem {
  color: string;
  label: string;
  checkerboard?: boolean;
}

const LEGEND_ITEMS: LegendItem[] = [
  { color: '#10B981', label: 'Visible' },
  { color: '#EF4444', label: 'Not visible' },
  { color: 'transparent', label: 'Out of range', checkerboard: true },
];

export default function ViewshedTool() {
  const observer = useAppStore((s) => s.viewshed.observer);
  const status = useAppStore((s) => s.viewshed.status);
  const errorMessage = useAppStore((s) => s.viewshed.errorMessage);
  const gridDims = useAppStore((s) => s.viewshed.gridDims);
  const eyeHeight = useAppStore((s) => s.viewshed.observerEyeHeightM);
  const maxRange = useAppStore((s) => s.viewshed.maxRangeM);
  const setEyeHeight = useAppStore((s) => s.setViewshedEyeHeight);
  const setMaxRange = useAppStore((s) => s.setViewshedMaxRange);
  const reset = useAppStore((s) => s.resetViewshed);

  const canReset = observer !== null || status !== 'idle';

  return (
    <div className="space-y-3">
      {/* ---- Observer position / instruction ---- */}
      {observer === null ? (
        <p data-testid="vs-instruction" className="text-xs text-gray-400 leading-relaxed">
          Click on the scene to place observer
        </p>
      ) : (
        <p data-testid="vs-observer" className="text-xs text-gray-200 font-mono leading-relaxed">
          {fmtCoord(observer.lng)}, {fmtCoord(observer.lat)}, {fmtHeight(observer.height)}
        </p>
      )}

      {/* ---- Inputs ---- */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor="vs-eye-height" className="text-xs text-gray-400 shrink-0 w-24">
            Eye height (m)
          </label>
          <input
            id="vs-eye-height"
            type="number"
            min={1}
            max={500}
            step={1}
            value={eyeHeight}
            onChange={(e) => setEyeHeight(Number(e.target.value))}
            className="flex-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-100 font-mono text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="vs-max-range" className="text-xs text-gray-400 shrink-0 w-24">
            Max range (m)
          </label>
          <input
            id="vs-max-range"
            type="number"
            min={100}
            max={10000}
            step={100}
            value={maxRange}
            onChange={(e) => setMaxRange(Number(e.target.value))}
            className="flex-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-100 font-mono text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          />
        </div>
      </div>

      {/* ---- Status area ---- */}
      <div data-testid="vs-status" className="text-xs leading-relaxed">
        {status === 'idle' && observer === null && (
          <p className="text-gray-400">Place an observer point to begin.</p>
        )}
        {(status === 'idle' || status === 'picking') && observer !== null && (
          <p className="text-gray-400">Place an observer point to begin.</p>
        )}
        {status === 'computing' && (
          <p className="text-gray-300">
            Computing visibility…
            {gridDims ? ` (sampling ${gridDims.cols}×${gridDims.rows} grid)` : ''}
          </p>
        )}
        {status === 'ready' && (
          <p className="text-emerald-400">Visibility computed.</p>
        )}
        {status === 'error' && (
          <p role="alert" className="text-red-400">
            {errorMessage ?? 'Viewshed computation failed.'}
          </p>
        )}
      </div>

      {/* ---- Legend (shown once a result exists or is computing) ---- */}
      {(status === 'ready' || status === 'computing' || status === 'error') && observer !== null && (
        <div data-testid="vs-legend" className="space-y-1">
          {LEGEND_ITEMS.map(({ color, label, checkerboard }) => (
            <div key={label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-3 h-3 rounded-sm border border-gray-600 shrink-0"
                style={
                  checkerboard
                    ? {
                        backgroundImage:
                          'linear-gradient(45deg,#6b7280 25%,transparent 25%),' +
                          'linear-gradient(-45deg,#6b7280 25%,transparent 25%),' +
                          'linear-gradient(45deg,transparent 75%,#6b7280 75%),' +
                          'linear-gradient(-45deg,transparent 75%,#6b7280 75%)',
                        backgroundSize: '6px 6px',
                        backgroundPosition: '0 0,0 3px,3px -3px,-3px 0px',
                      }
                    : { backgroundColor: color }
                }
              />
              <span className="text-xs text-gray-300">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---- Reset ---- */}
      <button
        type="button"
        onClick={reset}
        disabled={!canReset}
        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        Reset
      </button>
    </div>
  );
}
