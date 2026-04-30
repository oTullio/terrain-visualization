/**
 * Generic tag-filtering utility for Overpass element tags.
 *
 * Each feature layer (buildings, water, roads) supplies its own whitelist set
 * and calls this function to strip irrelevant tags before GeoJSON serialisation.
 */

/**
 * Return a new object containing only the keys from `tags` that appear in
 * `whitelist`. Non-whitelisted keys are silently dropped.
 *
 * @param tags - Raw tags from an Overpass element, or `undefined`.
 * @param whitelist - Set of allowed tag keys.
 */
export function filterTags(
  tags: Record<string, string> | undefined,
  whitelist: ReadonlySet<string>,
): Record<string, string> {
  if (!tags) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (whitelist.has(k)) out[k] = v;
  }
  return out;
}
