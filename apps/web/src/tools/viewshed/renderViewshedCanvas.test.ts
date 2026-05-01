/**
 * Tests for renderViewshedCanvas / buildViewshedRgba.
 *
 *   1. Cell-by-cell pixel correctness for {0,1,2} on a 2x2 grid.
 *   2. Throws when cells.length !== cols*rows.
 */
import { describe, it, expect } from 'vitest';
import { buildViewshedRgba, renderViewshedCanvas } from './renderViewshedCanvas.js';

describe('buildViewshedRgba', () => {
  it('paints out-of-range as fully transparent, visible green, not-visible red', () => {
    // 2x2 grid, row-major, row 0 = south.
    //   [SW=visible, SE=not-visible]
    //   [NW=out-of-range, NE=visible]
    const cells = new Uint8Array([2, 1, 0, 2]);
    const buf = buildViewshedRgba(cells, 2, 2);
    expect(buf.length).toBe(2 * 2 * 4);

    // Canvas y=0 is the top (north) — so output row 0 corresponds to source row 1.
    // Pixel (0, 0) [NW canvas corner] = source (col=0, row=1) = cells[1*2+0] = 0 (transparent).
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([0, 0, 0, 0]);
    // Pixel (1, 0) [NE canvas corner] = source (col=1, row=1) = cells[3] = 2 (green, alpha 0.4).
    expect(buf[4]).toBe(0x10);
    expect(buf[5]).toBe(0xb9);
    expect(buf[6]).toBe(0x81);
    expect(buf[7]).toBe(Math.round(0.4 * 255));
    // Pixel (0, 1) [SW canvas] = source (col=0, row=0) = cells[0] = 2 (green).
    expect(buf[8]).toBe(0x10);
    expect(buf[9]).toBe(0xb9);
    expect(buf[10]).toBe(0x81);
    expect(buf[11]).toBe(Math.round(0.4 * 255));
    // Pixel (1, 1) [SE canvas] = source (col=1, row=0) = cells[1] = 1 (red).
    expect(buf[12]).toBe(0xef);
    expect(buf[13]).toBe(0x44);
    expect(buf[14]).toBe(0x44);
    expect(buf[15]).toBe(Math.round(0.4 * 255));
  });

  it('throws when cells.length does not match cols*rows', () => {
    expect(() => buildViewshedRgba(new Uint8Array(3), 2, 2)).toThrow();
  });
});

describe('renderViewshedCanvas', () => {
  it('returns a canvas with the right dimensions', () => {
    const cells = new Uint8Array([0, 1, 2, 0, 1, 2]);
    const canvas = renderViewshedCanvas(cells, 3, 2);
    expect(canvas.width).toBe(3);
    expect(canvas.height).toBe(2);
  });
});
