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

export interface ToolState {
  /** The currently active tool, or null if no tool is active. */
  activeTool: ToolId | null;
}

export interface ToolActions {
  setActiveTool: (tool: ToolId | null) => void;
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
      setActiveTool: (tool) => set({ activeTool: tool }, false, 'tools/setActive'),

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
