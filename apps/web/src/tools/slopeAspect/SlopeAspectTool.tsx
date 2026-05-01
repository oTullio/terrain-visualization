/**
 * SlopeAspectTool — sidebar panel rendered when the slope/aspect tool is
 * active.  All scene-side work (sampling, computing, painting, draping the
 * imagery overlay) lives in `SlopeAspectLayer`; this component is read-only
 * for the overlay state and writes only the user's mode preference.
 *
 * Sections:
 *   - Mode toggle:   slope vs aspect (segmented control).
 *   - Status line:   loading / ready / error / idle.
 *   - Color legend:  slope ramp gradient OR 8-direction aspect compass key.
 *   - Reset button:  clears the active selection (which removes the overlay
 *                    via the layer's cleanup effect).
 */
import { useAppStore } from '../../store/useAppStore.js';
import type { SlopeAspectMode, SlopeAspectStatus } from '../../store/useAppStore.js';

const MODES: { id: SlopeAspectMode; label: string }[] = [
  { id: 'slope', label: 'Slope' },
  { id: 'aspect', label: 'Aspect' },
];

const COMPASS: { dir: string; deg: number; color: string }[] = [
  { dir: 'N', deg: 0, color: 'rgb(59,130,246)' },
  { dir: 'NE', deg: 45, color: 'rgb(34,211,238)' },
  { dir: 'E', deg: 90, color: 'rgb(34,197,94)' },
  { dir: 'SE', deg: 135, color: 'rgb(163,230,53)' },
  { dir: 'S', deg: 180, color: 'rgb(250,204,21)' },
  { dir: 'SW', deg: 225, color: 'rgb(249,115,22)' },
  { dir: 'W', deg: 270, color: 'rgb(239,68,68)' },
  { dir: 'NW', deg: 315, color: 'rgb(217,70,239)' },
];

function statusLine(s: SlopeAspectStatus, bboxPresent: boolean): string {
  if (!bboxPresent) return 'Select an area to compute slope / aspect.';
  switch (s.status) {
    case 'idle':
      return 'Idle';
    case 'loading':
      return `Sampling terrain (${s.cols} × ${s.rows} = ${(s.cols * s.rows).toLocaleString()} cells)…`;
    case 'ready':
      return `Ready (showing ${s.cols} × ${s.rows} cells at ~${s.resolutionM} m).`;
    case 'error':
      return `Error: ${s.message}`;
  }
}

export default function SlopeAspectTool() {
  const mode = useAppStore((s) => s.slopeAspect.mode);
  const setMode = useAppStore((s) => s.setSlopeAspectMode);
  const status = useAppStore((s) => s.slopeAspect.status);
  const bbox = useAppStore((s) => s.bbox);
  const clearSelection = useAppStore((s) => s.clearSelection);

  const isError = status.status === 'error';

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div
        role="radiogroup"
        aria-label="Slope or aspect mode"
        className="flex items-center gap-0.5 bg-gray-800 rounded-md p-0.5 border border-gray-700"
      >
        {MODES.map(({ id, label }) => {
          const isActive = mode === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setMode(id)}
              className={[
                'flex-1 px-2.5 py-1 rounded text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Status */}
      <p
        role={isError ? 'alert' : undefined}
        className={[
          'text-xs leading-relaxed',
          isError ? 'text-red-400' : 'text-gray-400',
        ].join(' ')}
      >
        {statusLine(status, bbox !== null)}
      </p>

      {/* Legend */}
      {mode === 'slope' ? <SlopeLegend /> : <AspectLegend />}

      {/* Reset clears the selection — the overlay layer cleans up its own
          imagery on bbox change. */}
      <button
        type="button"
        onClick={clearSelection}
        disabled={!bbox}
        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600 disabled:opacity-50 disabled:hover:bg-gray-700"
      >
        Reset
      </button>
    </div>
  );
}

function SlopeLegend() {
  // Horizontal gradient matching the slopeRgb stops in renderToCanvas.ts.
  const gradient =
    'linear-gradient(to right, rgb(31,158,137) 0%, rgb(253,231,37) 33%, rgb(251,155,6) 67%, rgb(179,0,0) 100%)';
  return (
    <div data-testid="slope-legend" className="space-y-0.5">
      <div
        aria-hidden
        className="h-2 rounded border border-gray-700"
        style={{ background: gradient }}
      />
      <div className="flex justify-between text-[10px] text-gray-400 font-mono">
        <span>0&deg;</span>
        <span>30&deg;</span>
        <span>60&deg;+</span>
      </div>
    </div>
  );
}

function AspectLegend() {
  return (
    <div data-testid="aspect-legend" className="grid grid-cols-4 gap-1">
      {COMPASS.map(({ dir, color }) => (
        <div
          key={dir}
          className="flex items-center gap-1 text-[10px] text-gray-300"
        >
          <span
            aria-hidden
            className="inline-block w-3 h-3 rounded border border-gray-700"
            style={{ background: color }}
          />
          <span className="font-mono">{dir}</span>
        </div>
      ))}
    </div>
  );
}
