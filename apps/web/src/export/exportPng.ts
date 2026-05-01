/**
 * captureViewerPng — capture the current Cesium viewer canvas as a PNG Blob.
 *
 * Why force a render first? Cesium's scene runs an explicit render loop and
 * may have skipped a frame at the moment we read the canvas. Calling
 * `scene.requestRender()` schedules a frame, then we yield a microtask
 * (`setTimeout(0)`) so the browser has a chance to paint before we read
 * pixels. Without this the captured PNG can be a frame stale (or, on
 * a fresh load, completely blank).
 *
 * The natural canvas size is used — no quality / resolution selector by
 * design (Phase E1 brief).
 */
import type * as Cesium from 'cesium';

/**
 * Captures the current Cesium viewer canvas as a PNG Blob.
 *
 * @param viewer the active Cesium Viewer instance.
 * @returns a Promise resolving to a Blob of type 'image/png'.
 * @throws Error if the viewer has no canvas, or if `canvas.toBlob` returns null.
 */
export async function captureViewerPng(viewer: Cesium.Viewer): Promise<Blob> {
  const canvas = viewer.canvas;
  if (!canvas) {
    throw new Error('Viewer has no canvas — cannot capture PNG.');
  }

  // Force a render pass so the canvas pixels are fresh.
  // (No-op if requestRenderMode is off; safe either way.)
  viewer.scene.requestRender();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvas.toBlob returned null — PNG capture failed.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}
