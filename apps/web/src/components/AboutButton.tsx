/**
 * AboutButton — small header button that opens the AboutPanel.
 *
 * Designed to sit in the app header alongside ExportPanel and SurfaceDrapeToggle.
 * The open/close state lives in App.tsx (local useState — no Zustand).
 */
interface Props {
  onClick: () => void;
}

export default function AboutButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="About this app"
      className="px-2.5 py-1 rounded text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      About
    </button>
  );
}
