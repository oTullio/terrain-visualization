/**
 * SurfaceDrapeToggle — radio-group control for switching the Cesium
 * base imagery between Satellite, Hillshade, and Topographic modes.
 *
 * Reads and writes `surfaceDrape` from the Zustand store.
 * Designed to sit in the app header (right side).
 *
 * Accessibility:
 *   - Outer element has role="radiogroup" with an aria-label.
 *   - Each button has role="radio" and aria-checked reflecting the active mode.
 *   - All buttons are keyboard-focusable (tabIndex on active; not needed on others
 *     since they're individual buttons, not a roving-tabindex group).
 */
import { useAppStore } from '../store/useAppStore.js';
import type { SurfaceDrape } from '../store/useAppStore.js';

const MODES: { id: SurfaceDrape; label: string }[] = [
  { id: 'satellite', label: 'Satellite' },
  { id: 'hillshade', label: 'Hillshade' },
  { id: 'topographic', label: 'Topographic' },
];

export default function SurfaceDrapeToggle() {
  const surfaceDrape = useAppStore((s) => s.surfaceDrape);
  const setSurfaceDrape = useAppStore((s) => s.setSurfaceDrape);

  return (
    <div
      role="radiogroup"
      aria-label="Surface drape mode"
      className="flex items-center gap-0.5 bg-gray-800 rounded-md p-0.5 border border-gray-700"
    >
      {MODES.map(({ id, label }) => {
        const isActive = surfaceDrape === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setSurfaceDrape(id)}
            className={[
              'px-2.5 py-1 rounded text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
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
  );
}
