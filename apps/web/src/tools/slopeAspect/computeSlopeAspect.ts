/**
 * computeSlopeAspect — pure-synchronous Horn's-method slope/aspect filter.
 *
 * Inputs: a row-major Float32Array of heights with `cols * rows` entries,
 * and the per-cell metre dimensions (cellSizeMetersX east-west,
 * cellSizeMetersY north-south).
 *
 * Coordinate convention used internally:
 *   - row 0 is the SOUTHERNMOST row (matches `gridCoords` from @terrain/shared).
 *   - increasing row index ⇒ moving NORTH.
 *   - increasing col index ⇒ moving EAST.
 *
 * Outputs:
 *   - `slope` — degrees from horizontal, [0, 90].
 *   - `aspect` — compass degrees [0, 360) where 0=N, 90=E, 180=S, 270=W.
 *     Flat cells (slope = 0) have aspect = -1 as a "no aspect" sentinel.
 *
 * The aspect points DOWN-slope (the direction the surface faces). Derived
 * directly from the gradient (which points up-slope):
 *
 *   gradient = (∂z/∂x_east, ∂z/∂y_north)
 *   downSlopeVector = (-∂z/∂x_east, -∂z/∂y_north)
 *   compassDeg = atan2(downSlope.x_east, downSlope.y_north) * 180/π
 *
 * Boundary cells (those on the edge of the grid where a 3×3 window would
 * step out of bounds) fall back to a 1-direction forward/backward
 * difference: still finite, just less smoothed.
 *
 * References:
 *   - Horn, B.K.P. (1981) "Hill shading and the reflectance map".
 *   - ESRI: How Slope works
 *     https://pro.arcgis.com/en/pro-app/latest/tool-reference/spatial-analyst/how-slope-works.htm
 */

const RAD_TO_DEG = 180 / Math.PI;

export function computeSlopeAspect(
  heights: Float32Array,
  cols: number,
  rows: number,
  cellSizeMetersX: number,
  cellSizeMetersY: number,
): { slope: Float32Array; aspect: Float32Array } {
  if (heights.length !== cols * rows) {
    throw new Error(
      `computeSlopeAspect: heights.length (${heights.length}) !== cols*rows (${cols * rows})`,
    );
  }
  if (cols < 2 || rows < 2) {
    throw new Error('computeSlopeAspect: cols and rows must be >= 2');
  }
  if (cellSizeMetersX <= 0 || cellSizeMetersY <= 0) {
    throw new Error('computeSlopeAspect: cellSizeMeters{X,Y} must be > 0');
  }

  const slope = new Float32Array(cols * rows);
  const aspect = new Float32Array(cols * rows);

  // Helper: read height at (col, row), clamping to the nearest in-bounds
  // cell. Used by Horn's filter so the 3×3 window is always defined.
  const h = (c: number, r: number): number => {
    const cc = c < 0 ? 0 : c >= cols ? cols - 1 : c;
    const rr = r < 0 ? 0 : r >= rows ? rows - 1 : r;
    return heights[rr * cols + cc] ?? 0;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // 3×3 neighbourhood, named by compass.  Row index increases NORTHWARD.
      //   nw  n  ne          (r+1)
      //    w  ce  e          ( r )
      //   sw  s  se          (r-1)
      const nw = h(c - 1, r + 1);
      const n = h(c, r + 1);
      const ne = h(c + 1, r + 1);
      const w = h(c - 1, r);
      const e = h(c + 1, r);
      const sw = h(c - 1, r - 1);
      const s = h(c, r - 1);
      const se = h(c + 1, r - 1);

      // Horn's 8-neighbour kernel.
      // ∂z/∂x_east — height change moving east (positive col direction).
      // East column is (ne, e, se), west column is (nw, w, sw).
      // The standard divisor is 8 * cellSize.
      const dzdxEast =
        (ne + 2 * e + se - (nw + 2 * w + sw)) / (8 * cellSizeMetersX);

      // ∂z/∂y_north — height change moving north (positive row direction).
      // North row is (nw, n, ne), south row is (sw, s, se).
      const dzdyNorth =
        (nw + 2 * n + ne - (sw + 2 * s + se)) / (8 * cellSizeMetersY);

      const idx = r * cols + c;
      const mag = Math.sqrt(dzdxEast * dzdxEast + dzdyNorth * dzdyNorth);

      slope[idx] = Math.atan(mag) * RAD_TO_DEG;

      if (mag === 0) {
        aspect[idx] = -1;
      } else {
        // Down-slope direction in (east, north) components:
        const downEast = -dzdxEast;
        const downNorth = -dzdyNorth;
        // Compass bearing = atan2(eastComponent, northComponent),
        // then normalise to [0, 360).
        let deg = Math.atan2(downEast, downNorth) * RAD_TO_DEG;
        if (deg < 0) deg += 360;
        // Defensive: 360 → 0
        if (deg >= 360) deg -= 360;
        aspect[idx] = deg;
      }
    }
  }

  return { slope, aspect };
}
