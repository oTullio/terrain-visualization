/**
 * Road style lookup — maps OSM `highway` tag values to Cesium color + width.
 *
 * Color palette:
 *   motorway        → orange-red   (prominent arterial)
 *   trunk           → orange       (near-motorway)
 *   primary         → yellow-orange
 *   secondary       → yellow
 *   tertiary        → off-white
 *   unclassified    → light grey
 *   residential     → light grey   (same as unclassified)
 *   service         → grey
 *   living_street   → grey         (same as service)
 *   pedestrian      → light grey   (slightly narrower)
 *   *_link variants → same colour as parent class, width × 0.8
 *   fallback        → medium grey, width 2
 *
 * All Cesium.Color instances are created once at module scope (memoized via
 * top-level constants) — no per-render allocation. This mirrors the pattern
 * established in BuildingsLayer and WaterLayer.
 *
 * Pure function — no Cesium lifecycle side-effects. Safe to import in tests.
 */
import * as Cesium from 'cesium';

// ---------------------------------------------------------------------------
// Module-level color constants
// ---------------------------------------------------------------------------

const COLOR_MOTORWAY = Cesium.Color.fromCssColorString('#e8613a'); // orange-red
const COLOR_TRUNK = Cesium.Color.fromCssColorString('#e8963a');    // orange
const COLOR_PRIMARY = Cesium.Color.fromCssColorString('#e8c43a');  // yellow-orange
const COLOR_SECONDARY = Cesium.Color.fromCssColorString('#e8e33a'); // yellow
const COLOR_TERTIARY = Cesium.Color.fromCssColorString('#d4d4c0'); // off-white
const COLOR_LOCAL = Cesium.Color.fromCssColorString('#b0b0b0');    // light grey (unclassified/residential)
const COLOR_SERVICE = Cesium.Color.fromCssColorString('#909090');  // grey (service/living_street)
const COLOR_PEDESTRIAN = Cesium.Color.fromCssColorString('#c0c0b8'); // light grey (pedestrian)
const COLOR_FALLBACK = Cesium.Color.fromCssColorString('#808080'); // medium grey

// ---------------------------------------------------------------------------
// Style type
// ---------------------------------------------------------------------------

export interface RoadStyle {
  /** Cesium color for the polyline material. */
  color: Cesium.Color;
  /** Polyline width in screen pixels. */
  width: number;
}

// ---------------------------------------------------------------------------
// Style map
// ---------------------------------------------------------------------------

type StyleEntry = RoadStyle;

const BASE_STYLES: Record<string, StyleEntry> = {
  motorway:      { color: COLOR_MOTORWAY,   width: 6   },
  trunk:         { color: COLOR_TRUNK,      width: 5   },
  primary:       { color: COLOR_PRIMARY,    width: 4   },
  secondary:     { color: COLOR_SECONDARY,  width: 3.5 },
  tertiary:      { color: COLOR_TERTIARY,   width: 3   },
  unclassified:  { color: COLOR_LOCAL,      width: 2.5 },
  residential:   { color: COLOR_LOCAL,      width: 2.5 },
  service:       { color: COLOR_SERVICE,    width: 2   },
  living_street: { color: COLOR_SERVICE,    width: 2   },
  pedestrian:    { color: COLOR_PEDESTRIAN, width: 1.5 },
};

/** Link variants — same colour as the parent class, width × 0.8. */
const LINK_WIDTH_FACTOR = 0.8;

const LINK_STYLES: Record<string, StyleEntry> = {
  motorway_link:  { color: COLOR_MOTORWAY,  width: BASE_STYLES['motorway']!.width  * LINK_WIDTH_FACTOR },
  trunk_link:     { color: COLOR_TRUNK,     width: BASE_STYLES['trunk']!.width     * LINK_WIDTH_FACTOR },
  primary_link:   { color: COLOR_PRIMARY,   width: BASE_STYLES['primary']!.width   * LINK_WIDTH_FACTOR },
  secondary_link: { color: COLOR_SECONDARY, width: BASE_STYLES['secondary']!.width * LINK_WIDTH_FACTOR },
  tertiary_link:  { color: COLOR_TERTIARY,  width: BASE_STYLES['tertiary']!.width  * LINK_WIDTH_FACTOR },
};

const FALLBACK_STYLE: StyleEntry = { color: COLOR_FALLBACK, width: 2 };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the Cesium color + polyline width for a given `highway` tag value.
 *
 * @param highwayValue - The OSM `highway` tag (e.g. `'primary'`, `'residential'`).
 *   May be `undefined` or `null` — the fallback style is returned in that case.
 */
export function getRoadStyle(highwayValue: string | undefined | null): RoadStyle {
  if (!highwayValue) return FALLBACK_STYLE;
  return BASE_STYLES[highwayValue] ?? LINK_STYLES[highwayValue] ?? FALLBACK_STYLE;
}
