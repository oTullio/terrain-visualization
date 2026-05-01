/**
 * Tests for downloadBlob.
 *
 * Verifies:
 *   1. An anchor with the correct download attribute and a blob: href is
 *      created, clicked, and removed from the DOM.
 *   2. URL.revokeObjectURL is called with the same URL produced by
 *      createObjectURL.
 *
 * jsdom does not implement URL.createObjectURL / revokeObjectURL by default
 * — we stub them directly on the URL global for the duration of the suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob } from './downloadBlob.js';

describe('downloadBlob', () => {
  let createMock: ReturnType<typeof vi.fn>;
  let revokeMock: ReturnType<typeof vi.fn>;
  let originalCreate: typeof URL.createObjectURL | undefined;
  let originalRevoke: typeof URL.revokeObjectURL | undefined;

  beforeEach(() => {
    originalCreate = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    createMock = vi.fn(() => 'blob:fake-url-123');
    revokeMock = vi.fn();
    URL.createObjectURL = createMock as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeMock as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    if (originalCreate) URL.createObjectURL = originalCreate;
    else delete (URL as unknown as Record<string, unknown>)['createObjectURL'];
    if (originalRevoke) URL.revokeObjectURL = originalRevoke;
    else delete (URL as unknown as Record<string, unknown>)['revokeObjectURL'];
    vi.restoreAllMocks();
  });

  it('creates an <a> with the correct download filename and a blob: href, clicks it, and removes it', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    let captured: HTMLElement | null = null;

    const origCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const el = origCreateElement(tag) as HTMLElement;
        if (tag === 'a') {
          captured = el as HTMLElement;
          // Stub click so jsdom doesn't try to navigate.
          (captured as HTMLElement).click = vi.fn();
        }
        return el as HTMLElement;
      });

    downloadBlob(blob, 'test-file.png');

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(captured).not.toBeNull();
    expect(captured!.getAttribute('download')).toBe('test-file.png');
    expect(captured!.getAttribute('href')).toBe('blob:fake-url-123');
    expect(captured!.click).toHaveBeenCalledTimes(1);
    expect(captured!.parentNode).toBeNull();
  });

  it('revokes the same URL it created', () => {
    const blob = new Blob(['x'], { type: 'application/octet-stream' });

    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag) as HTMLElement;
      if (tag === 'a') {
        (el as HTMLElement).click = vi.fn();
      }
      return el as HTMLElement;
    });

    downloadBlob(blob, 'x.bin');

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(revokeMock).toHaveBeenCalledWith('blob:fake-url-123');
  });
});
