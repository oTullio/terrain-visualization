/**
 * ReducedSceneToggle — header-area toggle for the mobile reduced-scene
 * escape hatch (plan section 5 risk #7).
 *
 * When ON: BuildingsLayer + RoadsLayer + SlopeAspectLayer + ViewshedLayer
 * skip rendering. WaterLayer + SurfaceDrapeLayer remain active (they are
 * comparatively cheap on mobile connections).
 *
 * Defaults to ON on mobile-sized viewports at first paint (set in the
 * Zustand store initialiser). After that it is user-controlled.
 *
 * Designed to sit in the app header, near SurfaceDrapeToggle.
 */
import { useAppStore } from '../store/useAppStore.js';

export default function ReducedSceneToggle() {
  const reducedScene = useAppStore((s) => s.reducedScene);
  const setReducedScene = useAppStore((s) => s.setReducedScene);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={reducedScene}
      onClick={() => setReducedScene(!reducedScene)}
      title={reducedScene ? 'Reduced scene ON — buildings & roads hidden' : 'Full scene — buildings & roads visible'}
      className={[
        'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
        reducedScene
          ? 'bg-amber-700/60 text-amber-200 hover:bg-amber-700/80'
          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700',
      ].join(' ')}
    >
      {/* Small indicator dot */}
      <span
        aria-hidden="true"
        className={[
          'w-1.5 h-1.5 rounded-full',
          reducedScene ? 'bg-amber-300' : 'bg-gray-600',
        ].join(' ')}
      />
      Reduced scene
    </button>
  );
}
