/**
 * Tests for ExportPanel.
 *
 * Mocks `useCesium` to return a fake viewer, mocks the export helpers, and
 * mounts the component into a host with the `#export-panel-slot` element
 * so the portal has a target.
 *
 * Verifies:
 *   1. Renders both PNG and glTF buttons in the slot.
 *   2. Clicking PNG calls captureViewerPng + downloadBlob, then shows "Saved".
 *   3. Clicking glTF that throws shows the error in role="alert".
 *   4. While in flight, both buttons are disabled and the label flips.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

const fakeViewer = { id: 'fake-viewer' };

vi.mock('resium', () => ({
  useCesium: () => ({ viewer: fakeViewer }),
}));

const captureViewerPngMock = vi.fn();
const exportSceneGltfMock = vi.fn();
const downloadBlobMock = vi.fn();

vi.mock('../export/exportPng.js', () => ({
  captureViewerPng: (...args: unknown[]) => captureViewerPngMock(...args),
}));
vi.mock('../export/exportGltf.js', () => ({
  exportSceneGltf: (...args: unknown[]) => exportSceneGltfMock(...args),
}));
vi.mock('../export/downloadBlob.js', () => ({
  downloadBlob: (...args: unknown[]) => downloadBlobMock(...args),
}));

import ExportPanel from './ExportPanel.js';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="export-panel-slot"></div>';
});

describe('ExportPanel', () => {
  it('renders both export buttons in the slot', () => {
    render(<ExportPanel />);
    expect(
      screen.getByRole('button', { name: /export png screenshot/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /export gltf model/i }),
    ).toBeInTheDocument();
  });

  it('on PNG click, calls captureViewerPng + downloadBlob, then shows "Saved"', async () => {
    const fakeBlob = new Blob(['x'], { type: 'image/png' });
    captureViewerPngMock.mockResolvedValueOnce(fakeBlob);
    render(<ExportPanel />);
    const btn = screen.getByRole('button', { name: /export png screenshot/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(captureViewerPngMock).toHaveBeenCalledWith(fakeViewer);
    expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    const args = downloadBlobMock.mock.calls[0]!;
    expect(args[0]).toBe(fakeBlob);
    expect(args[1]).toMatch(/^terrain-screenshot-.*\.png$/);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
    });
  });

  it('on glTF failure, shows the error message in role="alert"', async () => {
    exportSceneGltfMock.mockRejectedValueOnce(
      new Error('Nothing to export — empty scene.'),
    );
    render(<ExportPanel />);
    const btn = screen.getByRole('button', { name: /export gltf model/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/nothing to export/i);
    });
    expect(downloadBlobMock).not.toHaveBeenCalled();
  });

  it('while a PNG export is in flight, both buttons are disabled and the label flips', async () => {
    let releaseCapture: (b: Blob) => void = () => {};
    captureViewerPngMock.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          releaseCapture = resolve;
        }),
    );
    render(<ExportPanel />);
    const png = screen.getByRole('button', { name: /export png screenshot/i });
    const gltf = screen.getByRole('button', { name: /export gltf model/i });

    fireEvent.click(png);
    // Now we're in the busy state.
    await waitFor(() => {
      expect(png).toBeDisabled();
      expect(gltf).toBeDisabled();
      expect(png).toHaveTextContent('Capturing…');
    });

    // Release the promise so React can flush the post-success state.
    await act(async () => {
      releaseCapture(new Blob(['x'], { type: 'image/png' }));
    });
  });
});
