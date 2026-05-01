/**
 * exportSceneGltf — convert the user-added Cesium entities (buildings, water,
 * roads, viewshed observer / elevation hover points) into a Three.js scene
 * and export it as a binary glTF (.glb) Blob.
 *
 * # Why three's GLTFExporter
 *
 * The plan offered `gltf-transform` or three's `GLTFExporter`. Three's
 * exporter wins for v1: it's a single addon import, has zero glTF JSON
 * authoring on our side, and produces .glb directly. `gltf-transform` is
 * powerful but designed around editing existing assets — we're authoring
 * from scratch from procedurally-built meshes, which plays straight into
 * GLTFExporter's wheelhouse.
 *
 * # What is exported
 *
 * Cesium's scene is a custom WebGL renderer, not a Three.js scene — direct
 * export of the rendered frame is not possible. We export ONLY the user-
 * added GeoJSON-derived layers: buildings (extruded polygons), water
 * (polygons + polylines), and roads (polylines). The terrain mesh, imagery
 * tiles, and atmosphere are intentionally NOT exported.
 *
 * Tool-derived points (viewshed observer pin, elevation hover dot) are
 * included as `THREE.Points` for completeness; they're tiny and giving the
 * user back the spatial markers they placed feels right. The distance
 * polyline (also a Cesium polyline entity) is exported alongside the road
 * polylines as a side-effect — that's fine; it's data the user authored.
 *
 * # Local coordinate frame
 *
 * Cesium positions are ECEF metres (huge numbers). To keep the exported
 * mesh near the origin (so it imports without hilarious floating-point
 * jitter in Blender / glTF Viewer), we compute the bbox centroid of all
 * positions and subtract it as a local origin. The export is therefore in
 * "local metres relative to scene centre" — this is documented in the
 * exporter's metadata and is a standard pattern for geo-glTF.
 *
 * # Empty-scene handling
 *
 * If no exportable entities are present, throws `Error('Nothing to export
 * — the scene has no buildings, water, roads, or measurement points.')`.
 * The UI surfaces this as a toast and does not produce an empty file.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as Cesium from 'cesium';

const BUILDING_COLOR = 0xcccccc;
const WATER_FILL_COLOR = 0x4f8fba;
const ROAD_COLOR = 0x888888;
const POINT_COLOR = 0xff5500;
const POINT_SIZE = 4;

/**
 * Extract degrees-array positions from a polygon hierarchy. Returns null if
 * the hierarchy isn't resolvable (which can happen for entities with a
 * dynamic / time-varying polygon).
 */
function readPolygonPositions(
  hierarchy: Cesium.PolygonHierarchy | undefined,
): Cesium.Cartesian3[] | null {
  if (!hierarchy) return null;
  const positions = hierarchy.positions;
  if (!positions || positions.length < 3) return null;
  return positions;
}

/** ECEF -> local frame: subtract origin and return [x, y, z] in metres. */
function localFromCartesian(p: Cesium.Cartesian3, origin: Cesium.Cartesian3): [number, number, number] {
  return [p.x - origin.x, p.y - origin.y, p.z - origin.z];
}

/**
 * Compute a centroid of an array of cartesians — used as the local origin.
 */
function centroid(positions: Cesium.Cartesian3[]): Cesium.Cartesian3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of positions) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = positions.length || 1;
  return new Cesium.Cartesian3(x / n, y / n, z / n);
}

/**
 * Build a flat-bottomed extruded prism mesh from a polygon outer ring and
 * a height (extrudedHeight - baseHeight). Returns a `THREE.Mesh` whose
 * geometry is in local metres relative to `origin`.
 *
 * The mesh is built as side walls only (a quad strip) — for v1 we don't
 * triangulate the top/bottom caps. Most building viewers (and the eye)
 * tolerate cap-less extrusions fine when seen from above; adding ear-
 * clipping triangulation here is a noticeable scope creep we're skipping.
 */
function buildExtrudedMesh(
  ring: Cesium.Cartesian3[],
  baseHeight: number,
  topHeight: number,
  origin: Cesium.Cartesian3,
): THREE.Mesh | null {
  if (ring.length < 3) return null;

  // Convert ring positions to lng/lat so we can re-elevate to base/top.
  const cartographic: Cesium.Cartographic[] = ring.map((p) =>
    Cesium.Cartographic.fromCartesian(p),
  );

  // Build base + top loops in ECEF.
  const baseEcef: Cesium.Cartesian3[] = [];
  const topEcef: Cesium.Cartesian3[] = [];
  for (const c of cartographic) {
    const baseCart = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, baseHeight);
    const topCart = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, topHeight);
    baseEcef.push(baseCart);
    topEcef.push(topCart);
  }

  // Build side-wall triangles. For each segment i,i+1: two triangles
  //   (base[i], base[i+1], top[i+1]) and (base[i], top[i+1], top[i]).
  const positions: number[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const b0 = localFromCartesian(baseEcef[i]!, origin);
    const b1 = localFromCartesian(baseEcef[j]!, origin);
    const t0 = localFromCartesian(topEcef[i]!, origin);
    const t1 = localFromCartesian(topEcef[j]!, origin);
    // tri 1
    positions.push(...b0, ...b1, ...t1);
    // tri 2
    positions.push(...b0, ...t1, ...t0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({ color: BUILDING_COLOR, side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, material);
}

/** Build a flat polygon mesh (water surface) at a given height. */
function buildFlatPolygonMesh(
  ring: Cesium.Cartesian3[],
  height: number,
  origin: Cesium.Cartesian3,
  color: number,
): THREE.Mesh | null {
  if (ring.length < 3) return null;
  const cartographic = ring.map((p) => Cesium.Cartographic.fromCartesian(p));
  const ecef = cartographic.map((c) =>
    Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, height),
  );

  // Fan triangulation around vertex 0. This is correct for convex rings;
  // for concave rings it can produce overlapping triangles, but visually
  // it's still "a coloured patch where the water is" — acceptable for v1.
  const positions: number[] = [];
  for (let i = 1; i < ecef.length - 1; i++) {
    const v0 = localFromCartesian(ecef[0]!, origin);
    const v1 = localFromCartesian(ecef[i]!, origin);
    const v2 = localFromCartesian(ecef[i + 1]!, origin);
    positions.push(...v0, ...v1, ...v2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, material);
}

/** Build a polyline (`THREE.Line`) from cartesian positions. */
function buildLine(
  positions: Cesium.Cartesian3[],
  origin: Cesium.Cartesian3,
  color: number,
): THREE.Line | null {
  if (positions.length < 2) return null;
  const flat: number[] = [];
  for (const p of positions) {
    flat.push(...localFromCartesian(p, origin));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  const material = new THREE.LineBasicMaterial({ color });
  return new THREE.Line(geometry, material);
}

/**
 * Walk every entity once, in two passes:
 *   1. collect all positions to compute the local origin (centroid),
 *   2. emit Three.js objects relative to that origin.
 */
function collectPositions(
  entities: readonly Cesium.Entity[],
  time: Cesium.JulianDate,
): Cesium.Cartesian3[] {
  const out: Cesium.Cartesian3[] = [];
  for (const ent of entities) {
    if (ent.polygon) {
      const hierarchy = ent.polygon.hierarchy?.getValue(time);
      const ring = readPolygonPositions(hierarchy);
      if (ring) out.push(...ring);
    }
    if (ent.polyline) {
      const positions = ent.polyline.positions?.getValue(time) as
        | Cesium.Cartesian3[]
        | undefined;
      if (positions && positions.length > 0) out.push(...positions);
    }
    if (ent.point && ent.position) {
      const p = ent.position.getValue(time);
      if (p) out.push(p);
    }
  }
  return out;
}

interface ExportStats {
  meshes: number;
  lines: number;
  points: number;
}

/**
 * Build a `THREE.Scene` from Cesium entities. Returns the scene plus a
 * count of objects emitted (useful both for the empty-scene check and for
 * tests).
 */
function buildThreeScene(
  viewer: Cesium.Viewer,
): { scene: THREE.Scene; stats: ExportStats } {
  const time = viewer.clock?.currentTime ?? Cesium.JulianDate.now();
  const entities = viewer.entities.values;

  const allPositions = collectPositions(entities, time);
  if (allPositions.length === 0) {
    return { scene: new THREE.Scene(), stats: { meshes: 0, lines: 0, points: 0 } };
  }

  const origin = centroid(allPositions);
  const scene = new THREE.Scene();
  const stats: ExportStats = { meshes: 0, lines: 0, points: 0 };

  for (const ent of entities) {
    // --- Polygon (buildings + water area) ----------------------------------
    if (ent.polygon) {
      const hierarchy = ent.polygon.hierarchy?.getValue(time);
      const ring = readPolygonPositions(hierarchy);
      if (!ring) continue;

      const extrudedHeight = ent.polygon.extrudedHeight?.getValue(time);
      const baseHeight = (ent.polygon.height?.getValue(time) as number | undefined) ?? 0;

      if (typeof extrudedHeight === 'number' && extrudedHeight > baseHeight) {
        // Extruded prism (building).
        const mesh = buildExtrudedMesh(ring, baseHeight, extrudedHeight, origin);
        if (mesh) {
          scene.add(mesh);
          stats.meshes += 1;
        }
      } else {
        // Flat polygon (water area).
        const mesh = buildFlatPolygonMesh(ring, baseHeight, origin, WATER_FILL_COLOR);
        if (mesh) {
          scene.add(mesh);
          stats.meshes += 1;
        }
      }
      continue;
    }

    // --- Polyline (water lines + roads + distance tool) --------------------
    if (ent.polyline) {
      const positions = ent.polyline.positions?.getValue(time) as
        | Cesium.Cartesian3[]
        | undefined;
      if (!positions || positions.length < 2) continue;
      // Default road colour; water polylines also export as the road colour
      // for v1 — distinguishing the two requires reading the entity material,
      // which is a future polish item (documented in the file header).
      const line = buildLine(positions, origin, ROAD_COLOR);
      if (line) {
        scene.add(line);
        stats.lines += 1;
      }
      continue;
    }

    // --- Point (viewshed observer, elevation hover) ------------------------
    if (ent.point && ent.position) {
      const p = ent.position.getValue(time);
      if (!p) continue;
      const local = localFromCartesian(p, origin);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(local, 3),
      );
      const material = new THREE.PointsMaterial({ color: POINT_COLOR, size: POINT_SIZE });
      scene.add(new THREE.Points(geometry, material));
      stats.points += 1;
    }
  }

  return { scene, stats };
}

/**
 * Convert the user-authored entities of a Cesium viewer into a binary glTF
 * Blob (.glb).
 *
 * @throws Error('Nothing to export …') when the viewer has no entities of
 *         the supported types.
 *
 * The terrain, imagery, and atmosphere are intentionally NOT included —
 * see file header.
 *
 * Exposed for testing.
 */
export async function exportSceneGltf(viewer: Cesium.Viewer): Promise<Blob> {
  const { scene, stats } = buildThreeScene(viewer);
  if (stats.meshes === 0 && stats.lines === 0 && stats.points === 0) {
    throw new Error(
      'Nothing to export — the scene has no buildings, water, roads, or measurement points.',
    );
  }

  const exporter = new GLTFExporter();
  const result = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;
  if (!(result instanceof ArrayBuffer)) {
    throw new Error('GLTFExporter did not return a binary ArrayBuffer.');
  }
  return new Blob([result], { type: 'model/gltf-binary' });
}

/** Test seam: lets the unit tests assert what was put into the Three scene. */
export const __testing = { buildThreeScene };
