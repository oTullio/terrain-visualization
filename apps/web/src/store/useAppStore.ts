import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { BoundingBox } from '@terrain/shared';
import type GeoJSON from 'geojson';

// ---------------------------------------------------------------------------
// Surface drape slice
// ---------------------------------------------------------------------------

/** The three switchable surface drape modes. */
export type SurfaceDrape = 'satellite' | 'hillshade' | 'topographic';

export interface SurfaceDrapeState {
  surfaceDrape: SurfaceDrape;
}

export interface SurfaceDrapeActions {
  setSurfaceDrape: (mode: SurfaceDrape) => void;
}

// ---------------------------------------------------------------------------
// Selection slice
// ---------------------------------------------------------------------------

export type SelectionShape = 'rectangle' | 'polygon';

export interface SelectionState {
  /** The active bounding box, or null if nothing is selected. */
  bbox: BoundingBox | null;
  /**
   * The confirmed selection polygon (rectangle or freehand polygon),
   * or null if nothing is confirmed yet.
   * Phase B2 will use this for client-side clipping of rendered features.
   */
  selectionPolygon: GeoJSON.Polygon | null;
  /** The shape mode used for selection. */
  shape: SelectionShape;
  /** Whether the selection panel is open. */
  isOpen: boolean;
}

export interface SelectionActions {
  /**
   * Atomically write both the polygon and its derived bounding box.
   * Use this after the user confirms a selection in the SelectionMap.
   */
  setSelection: (selection: { polygon: GeoJSON.Polygon; bbox: BoundingBox }) => void;
  setShape: (shape: SelectionShape) => void;
  setSelectionOpen: (open: boolean) => void;
  clearSelection: () => void;
}

// ---------------------------------------------------------------------------
// Layers slice
// ---------------------------------------------------------------------------

export type LayerId = 'terrain' | 'buildings' | 'water' | 'roads';

/** All known LayerIds, used to initialise the layerStatus record. */
export const LAYER_IDS: LayerId[] = ['terrain', 'buildings', 'water', 'roads'];

export interface LayerState {
  /** Which layers are visible. */
  visible: Record<LayerId, boolean>;
}

export interface LayerActions {
  setLayerVisible: (layer: LayerId, visible: boolean) => void;
  toggleLayer: (layer: LayerId) => void;
}

// ---------------------------------------------------------------------------
// Tools slice
// ---------------------------------------------------------------------------

export type ToolId = 'distance' | 'elevation-profile' | 'viewshed' | 'slope-aspect' | 'area-volume';

/** A point picked from the 3D scene. */
export interface PickedPoint {
  lng: number;
  lat: number;
  height: number;
}

/** A sample along a line between two picked points. */
export interface ElevationSample {
  lng: number;
  lat: number;
  height: number;
  /** Cumulative geodesic distance from the start point, in metres. */
  distance: number;
}

/** Slope/aspect tool state (D2). */
export type SlopeAspectMode = 'slope' | 'aspect';

/**
 * Reactive status for the slope/aspect overlay. Distinct from LayerStatus
 * because the units are different (cell counts, resolution, not feature
 * cap counts).
 */
export type SlopeAspectStatus =
  | { status: 'idle' }
  | { status: 'loading'; cols: number; rows: number }
  | { status: 'ready'; cols: number; rows: number; resolutionM: number }
  | { status: 'error'; message: string };

/** Area/volume tool state (D3). */
export type AreaVolumeReferenceMode = 'lowest' | 'mean' | 'custom';
export type AreaVolumeStatus =
  | 'idle'
  | 'picking'
  | 'computing'
  | 'ready'
  | 'error';

/** Viewshed tool state (D4). Sampled-ray LOS technique (NOT shadow-map). */
export type ViewshedStatus =
  | 'idle'
  | 'picking'
  | 'computing'
  | 'ready'
  | 'error';

/**
 * Dimensions of a computed viewshed grid.
 *
 * `cells` is a Uint8Array of length `cols * rows` in row-major order
 * (row 0 = south), with values:
 *   0 → out-of-range (transparent)
 *   1 → not visible (red)
 *   2 → visible    (green)
 */
export interface ViewshedGridDims {
  cols: number;
  rows: number;
  bbox: BoundingBox;
}

/**
 * Heights sampled inside the polygon. The heights array is dense over the
 * bbox grid (cols * rows) — entries inside the polygon are valid metres,
 * entries outside the polygon are NaN. Storing as a Float32Array keeps the
 * memory footprint compact for large bboxes.
 *
 * `cellsInside` is the count of valid (non-NaN) cells; `cellAreaM2` is the
 * planimetric area per cell (constant — see sampleInsidePolygon).
 */
export interface AreaVolumeSamples {
  heights: Float32Array;
  cols: number;
  rows: number;
  cellAreaM2: number;
  cellSizeMx: number;
  cellSizeMy: number;
  cellsInside: number;
}

export interface ToolState {
  /** The currently active tool, or null if no tool is active. */
  activeTool: ToolId | null;
  distance: { points: PickedPoint[] };
  elevationProfile: {
    points: PickedPoint[];
    samples: ElevationSample[] | null;
  };
  slopeAspect: {
    mode: SlopeAspectMode;
    status: SlopeAspectStatus;
  };
  areaVolume: {
    polygon: PickedPoint[];
    finalized: boolean;
    referenceMode: AreaVolumeReferenceMode;
    customReferenceM: number;
    samples: AreaVolumeSamples | null;
    status: AreaVolumeStatus;
    /**
     * Last error message when status === 'error'. We store `undefined`
     * explicitly (not "missing key") so type-narrowing across the slice
     * stays predictable under exactOptionalPropertyTypes.
     */
    errorMessage: string | undefined;
  };
  viewshed: {
    /** Observer position (lng, lat, terrain height at observer). */
    observer: PickedPoint | null;
    /** Eye height above terrain at the observer, in metres. */
    observerEyeHeightM: number;
    /** Maximum visibility range in metres. */
    maxRangeM: number;
    status: ViewshedStatus;
    errorMessage: string | undefined;
    /**
     * Visibility mask: row-major Uint8Array of length cols*rows.
     * 0 = out-of-range, 1 = not visible, 2 = visible.
     */
    cells: Uint8Array | null;
    gridDims: ViewshedGridDims | null;
  };
}

export interface ToolActions {
  /** Activate a tool (or `null` to deactivate). Clears the previous tool's points. */
  setActiveTool: (tool: ToolId | null) => void;
  /**
   * Append a point to the distance tool. The tool is bounded to 2 points;
   * a 3rd click resets to `[newPoint]` (start over).
   */
  addDistancePoint: (p: PickedPoint) => void;
  resetDistance: () => void;
  /**
   * Append a point to the elevation-profile tool. Bounded to 2 points;
   * a 3rd click resets to `[newPoint]`. Clears any cached samples.
   */
  addElevationProfilePoint: (p: PickedPoint) => void;
  setElevationSamples: (samples: ElevationSample[]) => void;
  resetElevationProfile: () => void;
  /** Toggle slope vs aspect display mode. */
  setSlopeAspectMode: (mode: SlopeAspectMode) => void;
  /** Update the slope/aspect computation status (loading/ready/error). */
  setSlopeAspectStatus: (status: SlopeAspectStatus) => void;
  /**
   * Append a vertex to the area/volume polygon. If the polygon was
   * already finalized, the new point starts a fresh polygon.
   */
  addAreaVolumePoint: (p: PickedPoint) => void;
  /** Mark the polygon as closed (double-click). No-op if < 3 vertices. */
  finalizeAreaVolumePolygon: () => void;
  setAreaVolumeReferenceMode: (mode: AreaVolumeReferenceMode) => void;
  setAreaVolumeCustomReference: (metres: number) => void;
  setAreaVolumeSamples: (samples: AreaVolumeSamples | null) => void;
  setAreaVolumeStatus: (status: AreaVolumeStatus, errorMessage?: string) => void;
  resetAreaVolume: () => void;
  /** Set the observer point (single-pick). Clears any previous result. */
  setViewshedObserver: (p: PickedPoint) => void;
  setViewshedEyeHeight: (m: number) => void;
  setViewshedMaxRange: (m: number) => void;
  setViewshedStatus: (status: ViewshedStatus, errorMessage?: string) => void;
  setViewshedResult: (result: { cells: Uint8Array; gridDims: ViewshedGridDims }) => void;
  /** Clear observer + computed result; preserves eye height + max range knobs. */
  resetViewshed: () => void;
  /**
   * Clears whichever tool is currently active. If no tool is active,
   * clears all tool state. Used by Esc cancel.
   */
  clearActiveToolPoints: () => void;
}

// ---------------------------------------------------------------------------
// Layer status slice (generalised from buildingsStatus)
// ---------------------------------------------------------------------------

export type LayerStatus =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; total: number; kept: number; dropped: number }
  | { status: 'error'; message: string };

export interface LayerStatusState {
  layerStatus: Record<LayerId, LayerStatus>;
}

export interface LayerStatusActions {
  setLayerStatus: (layer: LayerId, status: LayerStatus) => void;
}

const INITIAL_LAYER_STATUS: LayerStatus = { status: 'idle' };

// ---------------------------------------------------------------------------
// Reduced-scene slice (E5 mobile escape hatch — plan section 5 risk #7)
// ---------------------------------------------------------------------------

/**
 * When `reducedScene` is true the heavier Cesium layers (Buildings, Roads,
 * SlopeAspect, Viewshed) skip rendering. Water and SurfaceDrape remain
 * active — they are comparatively cheap. Defaults to ON when the viewport
 * is mobile-sized at first paint so the initial experience on a phone is
 * usable without waiting for heavy tile fetches.
 */
export interface ReducedSceneState {
  reducedScene: boolean;
}

export interface ReducedSceneActions {
  setReducedScene: (on: boolean) => void;
}

// ---------------------------------------------------------------------------
// Combined store
// ---------------------------------------------------------------------------

export type AppState = SelectionState &
  SelectionActions &
  LayerState &
  LayerActions &
  ToolState &
  ToolActions &
  LayerStatusState &
  LayerStatusActions &
  SurfaceDrapeState &
  SurfaceDrapeActions &
  ReducedSceneState &
  ReducedSceneActions;

const DEFAULT_LAYER_VISIBILITY: Record<LayerId, boolean> = {
  terrain: true,
  buildings: false,
  water: false,
  roads: false,
};

export const useAppStore = create<AppState>()(
  devtools(
    (set) => ({
      // --- Selection ---
      bbox: null,
      selectionPolygon: null,
      shape: 'rectangle',
      isOpen: false,
      setSelection: ({ polygon, bbox }) =>
        set({ selectionPolygon: polygon, bbox }, false, 'selection/setSelection'),
      setShape: (shape) => set({ shape }, false, 'selection/setShape'),
      setSelectionOpen: (open) => set({ isOpen: open }, false, 'selection/setOpen'),
      clearSelection: () =>
        set({ bbox: null, selectionPolygon: null }, false, 'selection/clear'),

      // --- Layers ---
      visible: { ...DEFAULT_LAYER_VISIBILITY },
      setLayerVisible: (layer, visible) =>
        set(
          (s) => ({ visible: { ...s.visible, [layer]: visible } }),
          false,
          'layers/setVisible',
        ),
      toggleLayer: (layer) =>
        set(
          (s) => ({ visible: { ...s.visible, [layer]: !s.visible[layer] } }),
          false,
          'layers/toggle',
        ),

      // --- Tools ---
      activeTool: null,
      distance: { points: [] },
      elevationProfile: { points: [], samples: null },
      slopeAspect: { mode: 'slope', status: { status: 'idle' } },
      areaVolume: {
        polygon: [],
        finalized: false,
        referenceMode: 'lowest',
        customReferenceM: 0,
        samples: null,
        status: 'idle',
        errorMessage: undefined,
      },
      viewshed: {
        observer: null,
        observerEyeHeightM: 2,
        maxRangeM: 3000,
        status: 'idle',
        errorMessage: undefined,
        cells: null,
        gridDims: null,
      },
      setActiveTool: (tool) =>
        set(
          (s) => {
            // Clear the *previous* tool's picked points so switching tools
            // never leaves stale geometry on screen.
            const next: Partial<AppState> = { activeTool: tool };
            if (s.activeTool === 'distance') {
              next.distance = { points: [] };
            } else if (s.activeTool === 'elevation-profile') {
              next.elevationProfile = { points: [], samples: null };
            } else if (s.activeTool === 'slope-aspect') {
              // The overlay layer cleans itself up via its effect on
              // activeTool change; here we just reset the status to idle.
              next.slopeAspect = { ...s.slopeAspect, status: { status: 'idle' } };
            } else if (s.activeTool === 'area-volume') {
              // Reset polygon/sample state but keep the user's reference-mode
              // preference (it's a UI knob, not data).
              next.areaVolume = {
                ...s.areaVolume,
                polygon: [],
                finalized: false,
                samples: null,
                status: 'idle',
                errorMessage: undefined,
              };
            } else if (s.activeTool === 'viewshed') {
              // Reset observer + result but keep the user's eye-height and
              // max-range knobs (they're UI preferences, not data).
              next.viewshed = {
                ...s.viewshed,
                observer: null,
                cells: null,
                gridDims: null,
                status: 'idle',
                errorMessage: undefined,
              };
            }
            return next;
          },
          false,
          'tools/setActive',
        ),
      addDistancePoint: (p) =>
        set(
          (s) => {
            // Bounded to 2 points: the 3rd click starts a new measurement.
            const points = s.distance.points.length >= 2 ? [p] : [...s.distance.points, p];
            return { distance: { points } };
          },
          false,
          'tools/distance/addPoint',
        ),
      resetDistance: () =>
        set({ distance: { points: [] } }, false, 'tools/distance/reset'),
      addElevationProfilePoint: (p) =>
        set(
          (s) => {
            const points =
              s.elevationProfile.points.length >= 2 ? [p] : [...s.elevationProfile.points, p];
            // New point invalidates any cached samples.
            return { elevationProfile: { points, samples: null } };
          },
          false,
          'tools/elevationProfile/addPoint',
        ),
      setElevationSamples: (samples) =>
        set(
          (s) => ({ elevationProfile: { ...s.elevationProfile, samples } }),
          false,
          'tools/elevationProfile/setSamples',
        ),
      resetElevationProfile: () =>
        set(
          { elevationProfile: { points: [], samples: null } },
          false,
          'tools/elevationProfile/reset',
        ),
      setSlopeAspectMode: (mode) =>
        set(
          (s) => ({ slopeAspect: { ...s.slopeAspect, mode } }),
          false,
          'tools/slopeAspect/setMode',
        ),
      setSlopeAspectStatus: (status) =>
        set(
          (s) => ({ slopeAspect: { ...s.slopeAspect, status } }),
          false,
          'tools/slopeAspect/setStatus',
        ),
      addAreaVolumePoint: (p) =>
        set(
          (s) => {
            if (s.areaVolume.finalized) {
              // The previous polygon was closed; start a fresh one.
              return {
                areaVolume: {
                  ...s.areaVolume,
                  polygon: [p],
                  finalized: false,
                  samples: null,
                  status: 'picking',
                  errorMessage: undefined,
                },
              };
            }
            return {
              areaVolume: {
                ...s.areaVolume,
                polygon: [...s.areaVolume.polygon, p],
                status: 'picking',
                errorMessage: undefined,
              },
            };
          },
          false,
          'tools/areaVolume/addPoint',
        ),
      finalizeAreaVolumePolygon: () =>
        set(
          (s) => {
            if (s.areaVolume.polygon.length < 3) return {};
            return {
              areaVolume: {
                ...s.areaVolume,
                finalized: true,
                status: 'computing',
                errorMessage: undefined,
              },
            };
          },
          false,
          'tools/areaVolume/finalize',
        ),
      setAreaVolumeReferenceMode: (mode) =>
        set(
          (s) => ({ areaVolume: { ...s.areaVolume, referenceMode: mode } }),
          false,
          'tools/areaVolume/setRefMode',
        ),
      setAreaVolumeCustomReference: (metres) =>
        set(
          (s) => ({
            areaVolume: { ...s.areaVolume, customReferenceM: metres },
          }),
          false,
          'tools/areaVolume/setCustomRef',
        ),
      setAreaVolumeSamples: (samples) =>
        set(
          (s) => ({ areaVolume: { ...s.areaVolume, samples } }),
          false,
          'tools/areaVolume/setSamples',
        ),
      setAreaVolumeStatus: (status, errorMessage) =>
        set(
          (s) => ({
            areaVolume: { ...s.areaVolume, status, errorMessage },
          }),
          false,
          'tools/areaVolume/setStatus',
        ),
      resetAreaVolume: () =>
        set(
          (s) => ({
            areaVolume: {
              ...s.areaVolume,
              polygon: [],
              finalized: false,
              samples: null,
              status: 'idle',
              errorMessage: undefined,
            },
          }),
          false,
          'tools/areaVolume/reset',
        ),
      setViewshedObserver: (p) =>
        set(
          (s) => ({
            viewshed: {
              ...s.viewshed,
              observer: p,
              // New observer invalidates any previous result.
              cells: null,
              gridDims: null,
              status: 'computing',
              errorMessage: undefined,
            },
          }),
          false,
          'tools/viewshed/setObserver',
        ),
      setViewshedEyeHeight: (m) =>
        set(
          (s) => ({ viewshed: { ...s.viewshed, observerEyeHeightM: m } }),
          false,
          'tools/viewshed/setEyeHeight',
        ),
      setViewshedMaxRange: (m) =>
        set(
          (s) => ({ viewshed: { ...s.viewshed, maxRangeM: m } }),
          false,
          'tools/viewshed/setMaxRange',
        ),
      setViewshedStatus: (status, errorMessage) =>
        set(
          (s) => ({ viewshed: { ...s.viewshed, status, errorMessage } }),
          false,
          'tools/viewshed/setStatus',
        ),
      setViewshedResult: ({ cells, gridDims }) =>
        set(
          (s) => ({
            viewshed: {
              ...s.viewshed,
              cells,
              gridDims,
              status: 'ready',
              errorMessage: undefined,
            },
          }),
          false,
          'tools/viewshed/setResult',
        ),
      resetViewshed: () =>
        set(
          (s) => ({
            viewshed: {
              ...s.viewshed,
              observer: null,
              cells: null,
              gridDims: null,
              status: 'idle',
              errorMessage: undefined,
            },
          }),
          false,
          'tools/viewshed/reset',
        ),
      clearActiveToolPoints: () =>
        set(
          (s) => {
            if (s.activeTool === 'distance') {
              return { distance: { points: [] } };
            }
            if (s.activeTool === 'elevation-profile') {
              return { elevationProfile: { points: [], samples: null } };
            }
            if (s.activeTool === 'area-volume') {
              return {
                areaVolume: {
                  ...s.areaVolume,
                  polygon: [],
                  finalized: false,
                  samples: null,
                  status: 'idle',
                  errorMessage: undefined,
                },
              };
            }
            if (s.activeTool === 'viewshed') {
              return {
                viewshed: {
                  ...s.viewshed,
                  observer: null,
                  cells: null,
                  gridDims: null,
                  status: 'idle',
                  errorMessage: undefined,
                },
              };
            }
            // No active tool: clear everything (Esc-while-idle is a no-op for the user
            // but ensures a clean slate if internal state somehow drifted).
            return {
              distance: { points: [] },
              elevationProfile: { points: [], samples: null },
              areaVolume: {
                ...s.areaVolume,
                polygon: [],
                finalized: false,
                samples: null,
                status: 'idle',
                errorMessage: undefined,
              },
              viewshed: {
                ...s.viewshed,
                observer: null,
                cells: null,
                gridDims: null,
                status: 'idle',
                errorMessage: undefined,
              },
            };
          },
          false,
          'tools/clearActivePoints',
        ),

      // --- Layer status (keyed by LayerId) ---
      layerStatus: Object.fromEntries(
        LAYER_IDS.map((id) => [id, INITIAL_LAYER_STATUS]),
      ) as Record<LayerId, LayerStatus>,
      setLayerStatus: (layer, status) =>
        set(
          (s) => ({ layerStatus: { ...s.layerStatus, [layer]: status } }),
          false,
          `layers/${layer}/status`,
        ),

      // --- Surface drape ---
      surfaceDrape: 'satellite',
      setSurfaceDrape: (mode) => set({ surfaceDrape: mode }, false, 'drape/set'),

      // --- Reduced scene (mobile escape hatch) ---
      // Default ON on mobile viewports so the 3D scene is usable without
      // waiting for heavy building / road tile fetches over a mobile connection.
      reducedScene:
        typeof window !== 'undefined'
          ? window.matchMedia('(max-width: 768px)').matches
          : false,
      setReducedScene: (on) => set({ reducedScene: on }, false, 'reducedScene/set'),
    }),
    { name: 'terrain-app-store' },
  ),
);
