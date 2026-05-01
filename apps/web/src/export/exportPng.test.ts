/**
 * Tests for captureViewerPng.
 *
 * Mocks a Cesium-shaped viewer with a canvas that has a `toBlob` method.
 * Verifies:
 *   1. Success path — returns the Blob produced by canvas.toBlob.
 *   2. Null-blob path — rejects with a clear error.
 *   3. No canvas on viewer — rejects with a clear error.
 *   4. Calls viewer.scene.requestRender() before reading pixels.
 */
import { describe, it, expect, vi } from 'vitest';
import { captureViewerPng } from './exportPng.js';
import type * as Cesium from 'cesium';

// A minimal Cesium-shaped viewer for the helper. We deliberately type-cast
// at the call site to avoid pulling in the whole Viewer interface here.
interface FakeViewer {
  canvas: HTMLCanvasElement | null;
  scene: { requestRender: () => void };
}

function makeFakeBlob(): Blob {
  return new Blob(['fake-png-bytes'], { type: 'image/png' });
}

function makeViewer(opts: {
  blob?: Blob | null;
  noCanvas?: boolean;
  requestRender?: () => void;
}): FakeViewer {
  const canvas = opts.noCanvas
    ? null
    : ({
        toBlob: (cb: (b: Blob | null) => void) => {
          // Match the real browser behaviour — toBlob is asynchronous.
          setTimeout(() => cb(opts.blob ?? null), 0);
        },
      } as unknown as HTMLCanvasElement);

  return {
    canvas,
    scene: { requestRender: opts.requestRender ?? vi.fn() },
  };
}

describe('captureViewerPng', () => {
  it('resolves with the Blob from canvas.toBlob on the success path', async () => {
    const blob = makeFakeBlob();
    const viewer = makeViewer({ blob });
    const out = await captureViewerPng(viewer as unknown as Cesium.Viewer);
    expect(out).toBe(blob);
  });

  it('rejects when canvas.toBlob returns null', async () => {
    const viewer = makeViewer({ blob: null });
    await expect(
      captureViewerPng(viewer as unknown as Cesium.Viewer),
    ).rejects.toThrow(/null/i);
  });

  it('rejects when the viewer has no canvas', async () => {
    const viewer = makeViewer({ noCanvas: true });
    await expect(
      captureViewerPng(viewer as unknown as Cesium.Viewer),
    ).rejects.toThrow(/no canvas/i);
  });

  it('calls scene.requestRender() before reading pixels', async () => {
    const requestRender = vi.fn();
    const viewer = makeViewer({ blob: makeFakeBlob(), requestRender });
    await captureViewerPng(viewer as unknown as Cesium.Viewer);
    expect(requestRender).toHaveBeenCalledTimes(1);
  });
});
