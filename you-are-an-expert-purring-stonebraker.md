# Handoff: 3D terrain visualisation web app

**For:** new Claude Code session, executing via `superpowers:subagent-driven-development`.
**Repo:** `/home/oliver/Documents/Github/terrain-visualization` (currently empty apart from README).
**Team:** two-person, self-directed project. No external instructor requirements.

---

## 1. Mission

Build and deploy a public web application that lets a user select an arbitrary area on a 2D world map (rectangle or polygon, capped at ~100 km²) and view it as an interactive 3D scene with terrain, water, buildings, and roads — plus five analytical tools (distance, elevation profile, viewshed, slope/aspect, area/volume) and PNG + glTF export. Deployed to Vercel.

## 2. Tech stack (locked)

- **Frontend:** React + TypeScript (strict) + Vite. CesiumJS via **Resium** (1.20+, React 19-compatible). Tailwind or CSS Modules — pick one in week 1 and don't mix. **Zustand** for state (adopt from day 1; will be needed for 5 tools + layers + selection).
- **Vite + Cesium integration:** use the **official [CesiumGS/cesium-vite-example](https://github.com/CesiumGS/cesium-vite-example) scaffold** (`vite-plugin-static-copy`). **Do NOT use `vite-plugin-cesium`** — it is unmaintained.
- **2D selection map:** MapLibre GL JS (cleanest fit; Leaflet also acceptable). Cesium 2D mode is third choice.
- **Backend:** Vercel serverless functions (Node.js + TypeScript) for Overpass proxying, caching, and (optionally) glTF export.
- **Cache:** **Upstash Redis via the Vercel Marketplace integration**. (Vercel KV was discontinued Dec 2024 — don't use it.)
- **Bundler/deploy:** Vite + Vercel.
- **Testing:** Vitest for units; one Playwright smoke test (selection → render → screenshot). GitHub Actions CI: typecheck + lint + test.
- **Lint/format:** ESLint + Prettier.

## 3. Repo layout

Monorepo:

```
apps/web/        # React + Vite frontend
apps/api/        # Vercel serverless functions
packages/shared/ # TS types + utilities (bbox math, Overpass QL builders)
```

Use pnpm or npm workspaces — pick whichever the next agent's environment supports cleanly.

## 4. Functional summary

| Area | Requirement |
|------|-------------|
| Selection | 2D map with rectangle and polygon tools. Bounding box drives fetch. **Polygon selections must clip rendered features client-side** to the polygon, not just the bbox. Cap = 100 km² geodesic, defined as a single config constant. |
| Terrain | Cesium World Terrain (via Ion). Document Copernicus GLO-30 as alternative. |
| Surface drape | User-switchable: satellite imagery / hillshade-from-DEM / colour ramp by elevation. |
| Water | Overpass: `waterway`, `natural=water`, `landuse=reservoir`, `natural=coastline`. HydroSHEDS optional fallback for major rivers. [openstreetmapdata.com](https://osmdata.openstreetmap.de/) coastlines only if a selection touches a coast. |
| Buildings | Extruded prisms from OSM footprints via `Cesium.GeoJsonDataSource` with `extrudedHeight`. Use `height` then `building:levels × 3 m` then sensible default. **Apply an LOD/cap** (see risks). |
| Roads | 2D ribbons clamped to ground, styled by `highway=` class. |
| Camera | Pan + zoom only. No fly-through, no first-person. |
| Tools | Distance (planimetric + 3D), elevation profile (Chart.js or Recharts, hover-linked to scene), viewshed (shadow-map technique; **timeboxed**), slope/aspect overlays, area + surface area + cut/fill volume. |
| Export | PNG screenshot. glTF or OBJ — **do client-side first** (`gltf-transform` or three's `GLTFExporter`); only move server-side if perf demands. |
| Responsiveness | Collapsible sidebar; touch gestures (pinch + two-finger orbit) must work. Test on a real mid-range mobile device. |
| Attribution | Cesium handles terrain/imagery automatically. OSM, HydroSHEDS, Copernicus need explicit credits in (a) a permanent live-UI overlay and (b) an About panel. **About panel is a v1 deliverable.** |

## 5. Architectural decisions & risks (read before coding)

1. **Overpass payloads can exceed Vercel's 4.5 MB body limit** for dense urban 100 km² selections. Bake in from day 1:
   - Split endpoints by feature class (`/api/buildings`, `/api/roads`, `/api/water`) — better cache granularity too.
   - Server-side simplification: drop tiny polygons, snap coords to ~1 m precision.
   - Surface 413/size errors as user-facing "area too dense" messages.
2. **Slope/aspect cannot use Cesium's quantized terrain directly.** Sample terrain on a regular grid via `sampleTerrainMostDetailed` and compute client-side. Document the resolution trade-off.
3. **Viewshed has no built-in primitive.** Cesium ships `ShadowMap` and Sandcastle "Shadows"/"Multiple Shadows" demos. Implement via point-light shadow → encode visibility → ground overlay. **Timebox; fallback = sampled-ray line-of-sight.**
4. **Building extrusion can OOM the browser at 100 km² urban scale.** Cap rendered buildings (top-N by footprint area, or LOD by camera distance). Server-side glTF/3D Tiles bake is a stretch goal, not v1. Test early on a known dense bbox (Manhattan 5×5 km).
5. **Bbox math:** use geodesic area for the 100 km² cap (not naïve Δlat·Δlng). Handle antimeridian crossings (split into two bboxes). Unit-test both.
6. **Polygon clipping:** explicit client-side polygon-within-bbox clip step before rendering for non-rectangular selections.
7. **Mobile reality:** Cesium is heavy. Add a "reduced scene" toggle (no buildings, simplified roads) as an escape hatch.

## 6. External resources & credentials

The user has a **5 GB/month Cesium Ion free tier** which is plenty for this project. No course-issued tokens needed.

### Accounts to set up before coding (user provides credentials)

| # | What | Env var | Cost |
|---|------|---------|------|
| 1 | **Cesium Ion** ([ion.cesium.com](https://ion.cesium.com)) | `VITE_CESIUM_ION_TOKEN` | Free Community plan |
| 2 | **Vercel** linked to GitHub | (set via Vercel dashboard) | Free Hobby tier |
| 3 | **Upstash Redis** via Vercel Marketplace | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Free tier (~10k commands/day) |
| 4 | **Imagery provider** — recommend **Bing via Cesium Ion** to avoid a second account; alternative is a MapTiler key | `VITE_MAPTILER_KEY` (only if MapTiler chosen) | Free |

### Documentation references (no acquisition cost)

- [CesiumJS API reference](https://cesium.com/learn/cesiumjs/ref-doc/)
- [CesiumJS Sandcastle](https://sandcastle.cesium.com/) — Shadows, Terrain, GeoJSON, Measurement samples are directly relevant
- [Resium docs](https://resium.reearth.io/)
- [Official cesium-vite-example](https://github.com/CesiumGS/cesium-vite-example)
- [Overpass QL reference](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)
- [Overpass turbo](https://overpass-turbo.eu/) — prototype queries here first
- [OSM tag wiki](https://wiki.openstreetmap.org/wiki/Map_features) — esp. [highway](https://wiki.openstreetmap.org/wiki/Key:highway), [building](https://wiki.openstreetmap.org/wiki/Key:building), [waterway](https://wiki.openstreetmap.org/wiki/Key:waterway), [natural=water](https://wiki.openstreetmap.org/wiki/Tag:natural=water)
- [Overpass API usage policy](https://operations.osmfoundation.org/policies/overpass/) — set conservative defaults
- [Vercel Functions docs](https://vercel.com/docs/functions) and [limits page](https://vercel.com/docs/functions/limitations)
- [Upstash Redis on Vercel](https://vercel.com/docs/redis)
- [Turf.js](https://turfjs.org/docs/) — bbox math, area, simplification, polygon-in-polygon
- [HydroSHEDS](https://www.hydrosheds.org/products/hydrosheds), [Copernicus DEM on AWS](https://registry.opendata.aws/copernicus-dem/), [openstreetmapdata.com coastlines](https://osmdata.openstreetmap.de/data/coastlines.html) — fallbacks only

## 7. Implementation order (revised from spec)

The spec's order is sound. **One adjustment:** stand up an empty Cesium scene **before** the 2D selection step, so the Vite/Cesium build, Ion token, and deploy-to-Vercel loop are validated on day 1 — that's where surprise time burns.

1. **Scaffold** monorepo (`apps/web` Vite+React+TS, `apps/api`, `packages/shared`). ESLint, Prettier, Vitest, GitHub Actions CI. Adopt Zustand. **Verify:** `npm run build` succeeds, CI green.
2. **Empty Cesium scene** via Resium + cesium-vite-example scaffold. Ion token wired from env. **Verify:** deployed to Vercel preview, terrain + imagery render.
3. **2D selection step** (MapLibre or chosen alternative). Rectangle + polygon tools. Geodesic-area cap with clear over-cap warning. Bbox math + antimeridian handling in `packages/shared` with unit tests. **Verify:** unit tests pass; manual draw + confirm flow works end-to-end.
4. **Overpass proxy + Upstash cache** (`/api/buildings` first). Bbox-hash cache key. Conservative timeout. Per-feature-class endpoint pattern established. **Verify:** Lisbon 2×2 km bbox returns < 4.5 MB and caches.
5. **Buildings layer** — extruded GeoJSON in Cesium. LOD/cap policy implemented. **Verify:** Manhattan 5×5 km test bbox renders without crashing the browser.
6. **Water layer** + **roads layer** — same pattern as buildings.
7. **Surface drape switcher** — satellite / hillshade / elevation ramp.
8. **Analytical tools** in this order: distance → elevation profile → slope/aspect → area/volume → **viewshed (timeboxed)**.
9. **Exports** — PNG first (trivial), then client-side glTF.
10. **About panel + attribution overlay + README + final mobile pass.**

## 8. Subagent-driven development plan

Use the `superpowers:subagent-driven-development` workflow. The next session should re-derive the exact decomposition, but here is a starting structure:

### Phase A — Foundations (sequential, single agent)

A single Sonnet agent in the main session:
- Steps 1 + 2 above (scaffold + empty Cesium scene). Cannot parallelise — everything depends on this.
- Establishes the Tailwind/CSS-Modules choice, Zustand store skeleton, ESLint/Prettier/Vitest/CI conventions.
- **Gate:** human review of scaffold + Vercel preview link before proceeding.

### Phase B — Selection + data pipeline (parallel pair)

Once Phase A merges, dispatch two agents in parallel:
- **Agent B1:** Step 3 (2D selection map + bbox math + tests in `packages/shared`).
- **Agent B2:** Step 4 (`/api/buildings` Overpass proxy + Upstash cache + Overpass QL builder in `packages/shared` with tests).

These touch disjoint files (frontend selection vs. serverless API + shared utils) and can land independently.

### Phase C — Layers (sequential by layer, but each layer can parallelise frontend/styling work)

- **Agent C1:** Step 5 (buildings extrusion + LOD policy + Manhattan stress test).
- **Agents C2 + C3 in parallel** after C1 merges: water layer and roads layer share the GeoJSON-loader pattern but touch different style files. Add `/api/water` and `/api/roads` endpoints.
- **Agent C4:** Step 7 (surface drape switcher).

### Phase D — Analytical tools (mostly parallel)

After Phase C:
- **Agent D1:** Distance + Elevation profile (share a "pick points" interaction primitive).
- **Agent D2:** Slope/Aspect overlay (DEM sampling utility — reusable).
- **Agent D3:** Area/Volume.
- **Agent D4:** Viewshed (timeboxed — kept in its own branch so a partial result doesn't block release).

### Phase E — Exports + polish (sequential)

- PNG export (trivial, bundle into D-phase merge).
- Client-side glTF export.
- About panel + attribution overlay.
- README (architecture, data sources, attribution, dev/build/deploy).
- Mobile pass on a real device.

### Coordination rules for the subagent runner

- Each agent gets a self-contained brief: file paths to touch, files to NOT touch, the verification command(s) it must run before reporting done.
- Use `superpowers:test-driven-development` for any module with non-trivial logic (bbox math, Overpass QL builder, slope/aspect computation, area/volume).
- Use `superpowers:verification-before-completion` — every "done" claim must be backed by a green verification command and (for UI work) a screenshot.
- Use `superpowers:requesting-code-review` between phases.

## 9. Two-person team split (suggested)

- **Person A:** data pipeline (selection map, Overpass proxy, cache, GeoJSON normalisation), bbox math, About panel, README.
- **Person B:** 3D scene, layer rendering, surface drape, analytical tools, exports.
- **Shared:** types + utils in `packages/shared`. Each person owns the tests for utilities they introduce.

## 10. Verification (whole-project)

- Selection → render → screenshot Playwright smoke test on a known bbox (central Lisbon 2×2 km) passes in CI.
- Cold-cache fetch for a 25 km² selection completes in <10 s (spec NFR).
- Worst-case bbox (dense urban 10×10 km) does not crash the browser; either renders within the LOD cap or surfaces a clear "area too dense" message.
- Manual mobile pass on a real device: pinch-zoom + two-finger orbit work.
- README documents setup, dev, build, deploy, and per-source attribution.
- About panel lists every data source's licence + attribution.
- Unit tests for bbox math (incl. antimeridian + high-latitude) and Overpass QL builder pass.
- Vercel public deployment URL exists and loads in <3 s on broadband.

## 11. Out of scope (do not build)

Auth, user accounts, saved projects, time-series data, indoor mapping, custom per-building 3D models, fly-through animation, first-person navigation.
