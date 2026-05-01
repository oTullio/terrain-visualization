/**
 * Tests for renderSlopeCanvas / buildSlopeAspectRgba.
 *
 * jsdom's `<canvas>` has no working `getContext('2d')`, so the byte-level
 * assertions go through `buildSlopeAspectRgba`, the pure helper that
 * `renderSlopeCanvas` delegates to. We additionally check that
 * `renderSlopeCanvas` returns a canvas with the expected width/height.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { renderSlopeCanvas, buildSlopeAspectRgba } from './renderToCanvas.js';

// Stub HTMLCanvasElement.prototype.getContext so jsdom doesn't log a
// "Not implemented" warning each time renderSlopeCanvas is called from a
// test. Returns null — the function gracefully no-ops the paint step.
beforeAll(() => {
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext =
      function getContext(): null {
        return null;
      } as unknown as HTMLCanvasElement['getContext'];
  }
});

describe('renderSlopeCanvas', () => {
  it('returns a canvas with width=cols and height=rows', () => {
    const cols = 8;
    const rows = 5;
    const slope = new Float32Array(cols * rows).fill(20);
    const canvas = renderSlopeCanvas(slope, cols, rows, { mode: 'slope' });
    expect(canvas.width).toBe(cols);
    expect(canvas.height).toBe(rows);
  });
});

describe('buildSlopeAspectRgba', () => {
  it('flat slope (all zeros) → fully transparent buffer in slope mode', () => {
    const cols = 4;
    const rows = 4;
    const slope = new Float32Array(cols * rows).fill(0);
    const buf = buildSlopeAspectRgba(slope, cols, rows, { mode: 'slope' });
    expect(buf.length).toBe(cols * rows * 4);
    for (let i = 3; i < buf.length; i += 4) {
      expect(buf[i]).toBe(0);
    }
  });

  it('non-flat slope mode → at least one pixel has non-zero alpha', () => {
    const cols = 4;
    const rows = 4;
    const slope = new Float32Array(cols * rows).fill(30);
    const buf = buildSlopeAspectRgba(slope, cols, rows, { mode: 'slope' });
    let anyAlpha = 0;
    for (let i = 3; i < buf.length; i += 4) {
      anyAlpha = Math.max(anyAlpha, buf[i]!);
    }
    expect(anyAlpha).toBeGreaterThan(0);
  });

  it('flat aspect (-1) → transparent in aspect mode', () => {
    const cols = 3;
    const rows = 3;
    const aspect = new Float32Array(cols * rows).fill(-1);
    const buf = buildSlopeAspectRgba(aspect, cols, rows, { mode: 'aspect' });
    for (let i = 3; i < buf.length; i += 4) {
      expect(buf[i]).toBe(0);
    }
  });

  it('aspect=90 (east) → green-ish pixel (G > R, G > B)', () => {
    const cols = 1;
    const rows = 1;
    const aspect = new Float32Array([90]);
    const buf = buildSlopeAspectRgba(aspect, cols, rows, { mode: 'aspect' });
    const r = buf[0]!;
    const g = buf[1]!;
    const b = buf[2]!;
    const a = buf[3]!;
    expect(a).toBeGreaterThan(0);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('45° slope yields an orange-ish pixel (R > G > B-ish, R high)', () => {
    // 45° is between the 40° (orange #fb9b06) and 60° (dark red #b30000)
    // stops — should land on a redder orange.
    const cols = 1;
    const rows = 1;
    const slope = new Float32Array([45]);
    const buf = buildSlopeAspectRgba(slope, cols, rows, { mode: 'slope' });
    const r = buf[0]!;
    const g = buf[1]!;
    const b = buf[2]!;
    expect(r).toBeGreaterThan(150);
    expect(r).toBeGreaterThan(g);
    expect(b).toBeLessThan(50);
  });
});
