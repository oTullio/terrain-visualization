/**
 * Selection-area cap configuration and validation.
 *
 * The 100 km² cap is the SINGLE config constant mandated by the master plan.
 * Change it here and it propagates to the UI (warning) and to any server-side
 * validation (Phase B2+).
 */

import type GeoJSON from 'geojson';
import { geodesicAreaSqKm } from './bbox.js';

// ---------------------------------------------------------------------------
// Cap constant
// ---------------------------------------------------------------------------

/** Maximum allowed selection area in square kilometres. */
export const MAX_SELECTION_SQ_KM = 100;

// ---------------------------------------------------------------------------
// isWithinCap
// ---------------------------------------------------------------------------

/**
 * Checks whether a polygon's geodesic area is within the allowed cap.
 *
 * Returns `{ ok: true }` if the area is ≤ `MAX_SELECTION_SQ_KM`, or
 * `{ ok: false, areaSqKm, capSqKm }` when it exceeds the cap, so the caller
 * can display a meaningful error message ("Selection is X km² — max is Y km²").
 */
export function isWithinCap(
  polygon: GeoJSON.Polygon,
): { ok: true } | { ok: false; areaSqKm: number; capSqKm: number } {
  const areaSqKm = geodesicAreaSqKm(polygon);
  if (areaSqKm <= MAX_SELECTION_SQ_KM) {
    return { ok: true };
  }
  return { ok: false, areaSqKm, capSqKm: MAX_SELECTION_SQ_KM };
}
