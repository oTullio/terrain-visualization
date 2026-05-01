/**
 * AreaVolumeTool — sidebar panel rendered when `activeTool === 'area-volume'`.
 *
 * The Cesium-side rendering and terrain sampling live in AreaVolumeLayer.
 * This panel is read-mostly: it consumes `samples` + reference settings to
 * derive area + cut/fill numbers (the volume math is pure, so the panel
 * recomputes on every reference-mode change without re-sampling terrain).
 *
 * UI states
 * ---------
 *   - polygon.length === 0   → "Click to add polygon vertex…"
 *   - polygon.length === 1   → "Click to add second vertex"
 *   - polygon.length === 2   → "Add at least one more vertex, then double-click to close"
 *   - finalized + computing  → "Computing…" plus reference-mode picker
 *   - finalized + ready      → results card + reference-mode picker + Reset
 *   - status === 'error'     → red error line + Reset
 */
import { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import type { AreaVolumeReferenceMode } from '../../store/useAppStore.js';
import {
  planimetricAreaM2,
  surfaceAreaM2,
  cutFillVolumeM3,
  computeReferenceM,
} from './areaVolumeMath.js';

const REF_MODES: { id: AreaVolumeReferenceMode; label: string }[] = [
  { id: 'lowest', label: 'Lowest' },
  { id: 'mean', label: 'Mean' },
  { id: 'custom', label: 'Custom' },
];

function fmtArea(m2: number): string {
  if (m2 >= 1e6) return `${(m2 / 1e6).toFixed(2)} km²`;
  return `${m2.toFixed(0)} m²`;
}

function fmtVolume(m3: number): string {
  if (Math.abs(m3) >= 1e9) return `${(m3 / 1e9).toFixed(2)} km³`;
  if (Math.abs(m3) >= 1e6) return `${(m3 / 1e6).toFixed(2)} Mm³`;
  return `${m3.toFixed(0)} m³`;
}

function fmtMetres(m: number): string {
  return `${m.toFixed(1)} m`;
}

export default function AreaVolumeTool() {
  const polygon = useAppStore((s) => s.areaVolume.polygon);
  const finalized = useAppStore((s) => s.areaVolume.finalized);
  const samples = useAppStore((s) => s.areaVolume.samples);
  const status = useAppStore((s) => s.areaVolume.status);
  const errorMessage = useAppStore((s) => s.areaVolume.errorMessage);
  const referenceMode = useAppStore((s) => s.areaVolume.referenceMode);
  const customReferenceM = useAppStore((s) => s.areaVolume.customReferenceM);
  const setReferenceMode = useAppStore((s) => s.setAreaVolumeReferenceMode);
  const setCustomReference = useAppStore((s) => s.setAreaVolumeCustomReference);
  const reset = useAppStore((s) => s.resetAreaVolume);

  // Re-derive area + cut/fill from cached heights whenever samples or the
  // reference settings change (no terrain re-sample needed).
  const derived = useMemo(() => {
    if (!samples || !finalized) return null;
    const planim = planimetricAreaM2(polygon);
    const surface = surfaceAreaM2(samples, samples.cellSizeMx, samples.cellSizeMy);
    // Collect valid (in-polygon) heights for the reference computation.
    const inPolyHeights: number[] = [];
    for (const h of samples.heights) {
      if (!Number.isNaN(h)) inPolyHeights.push(h);
    }
    const refM = computeReferenceM(inPolyHeights, referenceMode, customReferenceM);
    const cf = cutFillVolumeM3(samples, samples.cellAreaM2, refM);
    return { planim, surface, refM, ...cf };
  }, [samples, finalized, polygon, referenceMode, customReferenceM]);

  // ---- prompts (pre-finalize) ----
  if (!finalized) {
    let prompt = 'Click to add polygon vertex; double-click to finish.';
    if (polygon.length === 1) prompt = 'Click to add second vertex.';
    else if (polygon.length === 2) prompt = 'Add at least one more vertex, then double-click to close.';
    return (
      <div className="space-y-2">
        <p data-testid="av-prompt" className="text-xs text-gray-400 leading-relaxed">{prompt}</p>
        {polygon.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600"
          >
            Reset
          </button>
        )}
      </div>
    );
  }

  // ---- finalized ----
  return (
    <div className="space-y-2">
      {/* Reference-plane picker (segmented control). */}
      <div
        role="radiogroup"
        aria-label="Reference plane mode"
        className="flex items-center gap-0.5 bg-gray-800 rounded-md p-0.5 border border-gray-700"
      >
        {REF_MODES.map(({ id, label }) => {
          const active = referenceMode === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setReferenceMode(id)}
              className={[
                'flex-1 px-2 py-1 rounded text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
                active
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      {referenceMode === 'custom' && (
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <span>Custom (m):</span>
          <input
            type="number"
            inputMode="numeric"
            value={customReferenceM}
            onChange={(e) => setCustomReference(Number(e.target.value))}
            className="flex-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-100 font-mono"
          />
        </label>
      )}

      {/* Body */}
      {status === 'error' ? (
        <p role="alert" className="text-xs text-red-400">
          {errorMessage ?? 'Computation failed'}
        </p>
      ) : status === 'computing' || !derived ? (
        <p className="text-xs text-gray-400">Computing area / volume…</p>
      ) : (
        <dl
          data-testid="av-results"
          className="text-xs text-gray-200 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5"
        >
          <dt className="text-gray-400">Planimetric</dt>
          <dd className="font-mono">{fmtArea(derived.planim)}</dd>
          <dt className="text-gray-400">Surface</dt>
          <dd className="font-mono">{fmtArea(derived.surface)}</dd>
          <dt className="text-gray-400">Reference</dt>
          <dd className="font-mono">{fmtMetres(derived.refM)}</dd>
          <dt className="text-gray-400">Cut</dt>
          <dd className="font-mono">{fmtVolume(derived.cut)}</dd>
          <dt className="text-gray-400">Fill</dt>
          <dd className="font-mono">{fmtVolume(derived.fill)}</dd>
          <dt className="text-gray-400">Net</dt>
          <dd
            className={[
              'font-mono',
              derived.net > 0 ? 'text-emerald-300' : derived.net < 0 ? 'text-amber-300' : '',
            ].join(' ')}
          >
            {fmtVolume(derived.net)}
          </dd>
        </dl>
      )}

      <button
        type="button"
        onClick={reset}
        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600"
      >
        Reset
      </button>
    </div>
  );
}
