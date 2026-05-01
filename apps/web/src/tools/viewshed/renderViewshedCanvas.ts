/**
 * renderViewshedCanvas — paints a viewshed cells Uint8Array onto an
 * HTMLCanvasElement, one pixel per grid cell.
 *
 * Cell encoding (matches viewshedMath.computeViewshedGrid):
 *   0 → fully transparent (out-of-range)
 *   1 → red    (#EF4444)  at alpha 0.4 (not visible)
 *   2 → green  (#10B981)  at alpha 0.4 (visible)
 *
 * The pure `buildViewshedRgba` helper is exported separately so tests can
 * verify pixel output without needing a working canvas-2D context (jsdom
 * has none).
 *
 * Coordinate convention:
 *   - Source `cells` is row-major with row 0 = south (matches gridCoords).
 *   - Canvas pixels run y=0 at the TOP (= north), so we flip rows on the
 *     way out — same convention as renderSlopeCanvas.
 */

const ALPHA = 0.4;
const ALPHA_BYTE = Math.round(ALPHA * 255);

const RED: [number, number, number] = [0xef, 0x44, 0x44];
const GREEN: [number, number, number] = [0x10, 0xb9, 0x81];

/**
 * Builds the RGBA byte buffer for a viewshed raster.
 *
 * Output dimensions are cols × rows (one pixel per cell). Row 0 of the
 * output is north; row `rows - 1` is south.
 */
export function buildViewshedRgba(
  cells: Uint8Array,
  cols: number,
  rows: number,
): Uint8ClampedArray {
  if (cells.length !== cols * rows) {
    throw new Error(
      `buildViewshedRgba: cells.length (${cells.length}) !== cols*rows (${cols * rows})`,
    );
  }
  const buf = new Uint8ClampedArray(cols * rows * 4);

  for (let r = 0; r < rows; r++) {
    const yPixel = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const srcIdx = r * cols + c;
      const dstIdx = (yPixel * cols + c) * 4;
      const v = cells[srcIdx];
      if (v === 2) {
        buf[dstIdx + 0] = GREEN[0];
        buf[dstIdx + 1] = GREEN[1];
        buf[dstIdx + 2] = GREEN[2];
        buf[dstIdx + 3] = ALPHA_BYTE;
      } else if (v === 1) {
        buf[dstIdx + 0] = RED[0];
        buf[dstIdx + 1] = RED[1];
        buf[dstIdx + 2] = RED[2];
        buf[dstIdx + 3] = ALPHA_BYTE;
      }
      // v === 0 (out-of-range): leave the four bytes at zero — fully transparent.
    }
  }
  return buf;
}

/**
 * Synchronously paints `cells` onto a canvas of size cols × rows and returns
 * the canvas. Cesium's SingleTileImageryProvider stretches it across the
 * bbox at draw time.
 */
export function renderViewshedCanvas(
  cells: Uint8Array,
  cols: number,
  rows: number,
): HTMLCanvasElement {
  const buf = buildViewshedRgba(cells, cols, rows);

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  // jsdom has no real 2D canvas implementation. Tests verify the byte
  // output via buildViewshedRgba; production runs in a browser with a
  // working ctx.
  let ctx: ReturnType<HTMLCanvasElement['getContext']> = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    return canvas;
  }
  if (!ctx) return canvas;
  const imgData = ctx.createImageData(cols, rows);
  imgData.data.set(buf);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
