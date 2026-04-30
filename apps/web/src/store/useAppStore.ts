import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { BoundingBox } from '@terrain/shared';
import type GeoJSON from 'geojson';

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

export interface ToolState {
  /** The currently active tool, or null if no tool is active. */
  activeTool: ToolId | null;
}

export interface ToolActions {
  setActiveTool: (tool: ToolId | null) => void;
}

// ---------------------------------------------------------------------------
// Buildings status slice
// ---------------------------------------------------------------------------

export type BuildingsStatusKind = 'idle' | 'loading' | 'ready' | 'error';

export interface BuildingsStatusState {
  buildingsStatus: {
    status: BuildingsStatusKind;
    /** Total features returned by the API (before clipping/cap). */
    total: number;
    /** Features actually rendered after clipping + LOD cap. */
    kept: number;
    /** Features dropped by the LOD cap. */
    dropped: number;
    /** User-facing error message (set when status === 'error'). */
    error: string | null;
  };
}

export interface BuildingsStatusActions {
  setBuildingsLoading: () => void;
  setBuildingsReady: (counts: { total: number; kept: number; dropped: number }) => void;
  setBuildingsError: (message: string) => void;
  clearBuildingsStatus: () => void;
}

const INITIAL_BUILDINGS_STATUS: BuildingsStatusState['buildingsStatus'] = {
  status: 'idle',
  total: 0,
  kept: 0,
  dropped: 0,
  error: null,
};

// ---------------------------------------------------------------------------
// Combined store
// ---------------------------------------------------------------------------

export type AppState = SelectionState &
  SelectionActions &
  LayerState &
  LayerActions &
  ToolState &
  ToolActions &
  BuildingsStatusState &
  BuildingsStatusActions;

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
      setActiveTool: (tool) => set({ activeTool: tool }, false, 'tools/setActive'),

      // --- Buildings status ---
      buildingsStatus: { ...INITIAL_BUILDINGS_STATUS },
      setBuildingsLoading: () =>
        set(
          {
            buildingsStatus: {
              status: 'loading',
              total: 0,
              kept: 0,
              dropped: 0,
              error: null,
            },
          },
          false,
          'buildings/loading',
        ),
      setBuildingsReady: ({ total, kept, dropped }) =>
        set(
          {
            buildingsStatus: { status: 'ready', total, kept, dropped, error: null },
          },
          false,
          'buildings/ready',
        ),
      setBuildingsError: (message) =>
        set(
          {
            buildingsStatus: {
              status: 'error',
              total: 0,
              kept: 0,
              dropped: 0,
              error: message,
            },
          },
          false,
          'buildings/error',
        ),
      clearBuildingsStatus: () =>
        set(
          { buildingsStatus: { ...INITIAL_BUILDINGS_STATUS } },
          false,
          'buildings/clear',
        ),
    }),
    { name: 'terrain-app-store' },
  ),
);
