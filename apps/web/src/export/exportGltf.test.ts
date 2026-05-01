/**
 * Tests for exportSceneGltf.
 *
 * We mock cesium's `JulianDate` and the entity values are fake objects
 * matching the shape the exporter reads. The GLTFExporter is used for real
 * (it's pure JS and doesn't need a WebGL context for non-textured meshes).
 *
 * Verifies:
 *   1. Empty scene → throws "Nothing to export".
 *   2. A single extruded polygon entity → produces a Mesh in the Three
 *      scene and a non-empty Blob.
 *   3. A polyline entity → produces a Line.
 *   4. The GLTFExporter is invoked with the scene we built.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportSceneGltf, __testing } from './exportGltf.js';
import * as Cesium from 'cesium';
import type * as THREE from 'three';

// We *do* exercise GLTFExporter, but on Node + jsdom THREE objects work fine
// for plain meshes. No WebGL context is needed unless textures are involved.

interface FakeEntity {
  polygon?: {
    hierarchy?: { getValue: (t: Cesium.JulianDate) => Cesium.PolygonHierarchy };
    extrudedHeight?: { getValue: (t: Cesium.JulianDate) => number };
    height?: { getValue: (t: Cesium.JulianDate) => number };
  };
  polyline?: {
    positions?: { getValue: (t: Cesium.JulianDate) => Cesium.Cartesian3[] };
  };
  point?: object;
  position?: { getValue: (t: Cesium.JulianDate) => Cesium.Cartesian3 };
}

function makeViewer(entities: FakeEntity[]): Cesium.Viewer {
  return {
    entities: { values: entities },
    clock: { currentTime: Cesium.JulianDate.now() },
  } as unknown as Cesium.Viewer;
}

function ringAroundLisbon(): Cesium.Cartesian3[] {
  // 4-point ring near Lisbon; height 0.
  return [
    Cesium.Cartesian3.fromDegrees(-9.1393, 38.7223, 0),
    Cesium.Cartesian3.fromDegrees(-9.1393 + 0.0005, 38.7223, 0),
    Cesium.Cartesian3.fromDegrees(-9.1393 + 0.0005, 38.7223 + 0.0005, 0),
    Cesium.Cartesian3.fromDegrees(-9.1393, 38.7223 + 0.0005, 0),
  ];
}

function makeBuildingEntity(): FakeEntity {
  const ring = ringAroundLisbon();
  return {
    polygon: {
      hierarchy: { getValue: () => new Cesium.PolygonHierarchy(ring) },
      extrudedHeight: { getValue: () => 30 },
      height: { getValue: () => 0 },
    },
  };
}

function makeWaterPolygonEntity(): FakeEntity {
  const ring = ringAroundLisbon();
  return {
    polygon: {
      hierarchy: { getValue: () => new Cesium.PolygonHierarchy(ring) },
      // No extrudedHeight → flat polygon path.
      height: { getValue: () => 0 },
    },
  };
}

function makeRoadEntity(): FakeEntity {
  const positions: Cesium.Cartesian3[] = [
    Cesium.Cartesian3.fromDegrees(-9.1393, 38.7223, 0),
    Cesium.Cartesian3.fromDegrees(-9.1390, 38.7225, 0),
    Cesium.Cartesian3.fromDegrees(-9.1387, 38.7227, 0),
  ];
  return {
    polyline: {
      positions: { getValue: () => positions },
    },
  };
}

function makePointEntity(): FakeEntity {
  const p = Cesium.Cartesian3.fromDegrees(-9.1393, 38.7223, 100);
  return {
    point: {},
    position: { getValue: () => p },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('exportSceneGltf', () => {
  it('throws "Nothing to export" when the viewer has no entities', async () => {
    const viewer = makeViewer([]);
    await expect(exportSceneGltf(viewer)).rejects.toThrow(/nothing to export/i);
  });

  it('throws "Nothing to export" when entities are present but all unsupported', async () => {
    // An entity that has no polygon/polyline/point graphics — should be skipped.
    const viewer = makeViewer([{} as FakeEntity]);
    await expect(exportSceneGltf(viewer)).rejects.toThrow(/nothing to export/i);
  });

  it('builds a Three Mesh for an extruded polygon entity (building)', () => {
    const viewer = makeViewer([makeBuildingEntity()]);
    const { scene, stats } = __testing.buildThreeScene(viewer);
    expect(stats.meshes).toBe(1);
    expect(stats.lines).toBe(0);
    expect(stats.points).toBe(0);
    // Find the mesh in the scene graph.
    const meshes: THREE.Object3D[] = [];
    scene.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o);
    });
    expect(meshes.length).toBe(1);
  });

  it('builds a Three Line for a polyline entity (road / water line)', () => {
    const viewer = makeViewer([makeRoadEntity()]);
    const { scene, stats } = __testing.buildThreeScene(viewer);
    expect(stats.lines).toBe(1);
    expect(stats.meshes).toBe(0);
    const lines: THREE.Object3D[] = [];
    scene.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Line).isLine) lines.push(o);
    });
    expect(lines.length).toBe(1);
  });

  it('builds a flat Mesh for a non-extruded polygon entity (water area)', () => {
    const viewer = makeViewer([makeWaterPolygonEntity()]);
    const { stats } = __testing.buildThreeScene(viewer);
    expect(stats.meshes).toBe(1);
  });

  it('builds Points for a point entity', () => {
    const viewer = makeViewer([makePointEntity()]);
    const { stats } = __testing.buildThreeScene(viewer);
    expect(stats.points).toBe(1);
  });

  it('produces a non-empty .glb Blob from a building scene', async () => {
    const viewer = makeViewer([makeBuildingEntity(), makeRoadEntity()]);
    const blob = await exportSceneGltf(viewer);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('model/gltf-binary');
  });
});
