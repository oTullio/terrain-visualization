/**
 * Merge N GeoJSON FeatureCollections into one, deduplicating features by id.
 *
 * Used when a bbox crosses the antimeridian and we fetch two Overpass halves
 * in parallel. A way or relation that straddles 180° can appear in both halves.
 * Overpass assigns stable global IDs to ways/relations (e.g. `way/12345`),
 * so we deduplicate by `feature.id`.
 *
 * Features that have no `id` (undefined / 0 / empty string) are always kept —
 * they cannot be reliably deduplicated.
 */
import type GeoJSON from 'geojson';

/**
 * Merge multiple FeatureCollections, deduplicating features by `feature.id`.
 *
 * - Features with a truthy `id` are keyed by that id; only the first
 *   occurrence is kept.
 * - Features without an id (undefined, 0, empty string) are preserved
 *   as-is without deduplication.
 *
 * @param collections - One or more FeatureCollections to merge.
 * @returns A single FeatureCollection.
 */
export function mergeAndDedupeById(
  ...collections: GeoJSON.FeatureCollection[]
): GeoJSON.FeatureCollection {
  const seen = new Set<string | number>();
  const features: GeoJSON.Feature[] = [];

  for (const collection of collections) {
    for (const feature of collection.features) {
      const id = feature.id;
      if (id === undefined || id === 0 || id === '') {
        // No id — preserve without dedup
        features.push(feature);
      } else {
        if (!seen.has(id)) {
          seen.add(id);
          features.push(feature);
        }
        // else: duplicate — skip
      }
    }
  }

  return { type: 'FeatureCollection', features };
}
