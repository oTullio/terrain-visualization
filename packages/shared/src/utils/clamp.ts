/**
 * Clamps a value between a minimum and maximum.
 * Utility used throughout the project (e.g. bounding-box area cap).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
