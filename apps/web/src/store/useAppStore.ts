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
  SurfaceDrapeActions;

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
      clearActiveToolPoints: () =>
        set(
          (s) => {
            if (s.activeTool === 'distance') {
              return { distance: { points: [] } };
            }
            if (s.activeTool === 'elevation-profile') {
              return { elevationProfile: { points: [], samples: null } };
            }
            // No active tool: clear everything (Esc-while-idle is a no-op for the user
            // but ensures a clean slate if internal state somehow drifted).
            return {
              distance: { points: [] },
              elevationProfile: { points: [], samples: null },
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
    }),
    { name: 'terrain-app-store' },
  ),
);
