/**
 * ExportPanel — two header buttons that download the current 3D scene as
 * a PNG screenshot or a binary glTF (.glb).
 *
 * # Wiring pattern
 *
 * The panel needs the live Cesium `viewer`, which is only available inside
 * `<Viewer>` via `useCesium()`. But its DOM belongs in the app header,
 * which lives outside `<Viewer>`. We use the same trick as ToolPanelMount:
 * render this component inside `<Viewer>`, capture the `viewer` ref via
 * `useCesium()`, and `createPortal` the UI into the `#export-panel-slot`
 * element rendered by App.tsx in the header.
 *
 * # UX
 *
 * - "PNG" button: kicks off `captureViewerPng` → `downloadBlob`. While
 *   in flight, both buttons are disabled and the label flips to "…".
 * - "glTF" button: same flow with `exportSceneGltf`. Has a 10-second
 *   timeout — Three's GLTFExporter is fast on small scenes but a huge
 *   building set could plausibly take a moment. On timeout we abort the
 *   wait (the underlying export keeps running in the background but is
 *   discarded; this is acceptable — it's a pure JS computation, no fetch).
 * - On error we show a small red status pill below the buttons. On
 *   success we show a green "Saved" pill that auto-clears in 3 seconds.
 *
 * # Filename
 *
 * Files are named `terrain-screenshot-<iso>.png` / `terrain-scene-<iso>.glb`
 * where `<iso>` is the current timestamp with `:` replaced by `-` (the
 * Windows / OS X file dialogs reject `:`).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCesium } from 'resium';
import { captureViewerPng } from '../export/exportPng.js';
import { exportSceneGltf } from '../export/exportGltf.js';
import { downloadBlob } from '../export/downloadBlob.js';

const GLTF_TIMEOUT_MS = 10_000;
const SUCCESS_TOAST_MS = 3_000;

type Status = { kind: 'idle' } | { kind: 'busy'; what: 'png' | 'gltf' } | { kind: 'ok'; what: 'png' | 'gltf' } | { kind: 'err'; message: string };

function isoForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

export default function ExportPanel() {
  const { viewer } = useCesium();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSlot(document.getElementById('export-panel-slot'));
  }, []);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  function flashSuccess(what: 'png' | 'gltf') {
    setStatus({ kind: 'ok', what });
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => {
      setStatus({ kind: 'idle' });
    }, SUCCESS_TOAST_MS);
  }

  async function onPng() {
    if (!viewer) {
      setStatus({ kind: 'err', message: 'Viewer not ready.' });
      return;
    }
    setStatus({ kind: 'busy', what: 'png' });
    try {
      const blob = await captureViewerPng(viewer);
      downloadBlob(blob, `terrain-screenshot-${isoForFilename()}.png`);
      flashSuccess('png');
    } catch (err) {
      setStatus({
        kind: 'err',
        message: err instanceof Error ? err.message : 'PNG export failed.',
      });
    }
  }

  async function onGltf() {
    if (!viewer) {
      setStatus({ kind: 'err', message: 'Viewer not ready.' });
      return;
    }
    setStatus({ kind: 'busy', what: 'gltf' });
    try {
      const blob = await withTimeout(
        exportSceneGltf(viewer),
        GLTF_TIMEOUT_MS,
        'glTF export',
      );
      downloadBlob(blob, `terrain-scene-${isoForFilename()}.glb`);
      flashSuccess('gltf');
    } catch (err) {
      setStatus({
        kind: 'err',
        message: err instanceof Error ? err.message : 'glTF export failed.',
      });
    }
  }

  if (!slot) return null;

  const busy = status.kind === 'busy';

  const ui = (
    <div className="flex items-center gap-2" data-testid="export-panel">
      <div className="flex items-center gap-0.5 bg-gray-800 rounded-md p-0.5 border border-gray-700">
        <button
          type="button"
          onClick={onPng}
          disabled={busy}
          aria-label="Export PNG screenshot"
          className={[
            'px-2.5 py-1 rounded text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
            busy
              ? 'text-gray-500 cursor-not-allowed'
              : 'text-gray-300 hover:text-white hover:bg-gray-700',
          ].join(' ')}
        >
          {status.kind === 'busy' && status.what === 'png' ? 'Capturing…' : 'PNG'}
        </button>
        <button
          type="button"
          onClick={onGltf}
          disabled={busy}
          aria-label="Export glTF model"
          className={[
            'px-2.5 py-1 rounded text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
            busy
              ? 'text-gray-500 cursor-not-allowed'
              : 'text-gray-300 hover:text-white hover:bg-gray-700',
          ].join(' ')}
        >
          {status.kind === 'busy' && status.what === 'gltf' ? 'Exporting…' : 'glTF'}
        </button>
      </div>
      {status.kind === 'ok' && (
        <span
          role="status"
          className="text-xs text-emerald-400"
        >
          Saved
        </span>
      )}
      {status.kind === 'err' && (
        <span
          role="alert"
          className="text-xs text-red-400 max-w-[14rem] truncate"
          title={status.message}
        >
          {status.message}
        </span>
      )}
    </div>
  );

  return createPortal(ui, slot);
}
