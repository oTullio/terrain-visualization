/**
 * Level-of-detail cap for building features.
 *
 * Sorts features by footprint area (m², via @turf/area) in DESC order and
 * keeps the top `maxFeatures`. The remainder is reported as `dropped` so
 * the UI can surface a "showing X of Y" notice.
 *
 * Why area? Large buildings dominate the visual silhouette of an area; if
 * we have to drop something, the user is least likely to notice missing
 * sheds and outbuildings.
 *
 * Determinism: ties on area are broken by original index so successive
 * calls with the same input produce the same output.
 */
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import area from '@turf/area';

export interface LodCapOptions {
  maxFeatures: number;
  rankBy: 'area';
}

export interface LodCapResult {
  kept: Feature<Polygon | MultiPolygon>[];
  dropped: number;
}

export function applyLodCap(
  features: Feature<Polygon | MultiPolygon>[],
  opts: LodCapOptions,
): LodCapResult {
  const { maxFeatures } = opts;
  if (features.length <= maxFeatures) {
    return { kept: features.slice(), dropped: 0 };
  }
  if (maxFeatures <= 0) {
    return { kept: [], dropped: features.length };
  }

  // Decorate-sort-undecorate so ranking is stable and ties resolve by index.
  const ranked = features.map((f, i) => ({ f, i, a: safeArea(f) }));
  ranked.sort((x, y) => {
    if (y.a !== x.a) return y.a - x.a;
    return x.i - y.i;
  });
  const kept = ranked.slice(0, maxFeatures).map((r) => r.f);
  return { kept, dropped: features.length - maxFeatures };
}

function safeArea(f: Feature<Polygon | MultiPolygon>): number {
  try {
    const a = area(f);
    return Number.isFinite(a) ? a : 0;
  } catch {
    return 0;
  }
}
