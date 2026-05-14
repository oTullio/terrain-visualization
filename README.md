# Terrain Visualizer

An open-source web tool for exploring 3D terrain anywhere in the world. Draw a selection
rectangle or freehand polygon on a 2D map, then inspect the resulting scene with extruded
buildings, water bodies, and roads rendered in the Cesium 3D viewer. Analytical overlays —
elevation profile, slope/aspect, area/volume, viewshed — are computed on the client from
Cesium World Terrain elevation data. All vector data is fetched live from the Overpass API
and cached server-side. No back-end server to maintain: the API layer is a set of Vercel
serverless functions.

---

## Features

- **Selection** — rectangle or freehand polygon drawn on a MapLibre 2D basemap; geodesic
  area capped at 100 km² to keep responses fast.
- **Layers** — 3D extruded buildings (OSM), water polygons + waterways (OSM), road network
  styled by highway class (OSM). Each layer toggleable independently.
- **Surface drape** — switch between Satellite (Bing Maps via Cesium Ion), Hillshade
  (ArcGIS World Hillshade), and Topographic (OpenTopoMap CC-BY-SA).
- **Distance tool** — planimetric distance and 3D surface distance between two picked points.
- **Elevation profile** — cross-section chart between two picked points with a hover-linked
  dot in the 3D scene. Rendered with Recharts.
- **Slope / aspect overlay** — analytical raster overlay computed from sampled terrain
  heights; switchable between slope (degrees) and aspect (compass direction) display modes.
- **Area / volume tool** — pick a polygon in 3D; reports planimetric area, 3D surface area,
  and cut/fill volume relative to a configurable reference elevation.
- **Viewshed** — sampled-ray line-of-sight analysis from an observer point, rendered as a
  green/red visibility mask overlaid on the terrain.
- **Exports** — PNG screenshot of the Cesium viewport; client-side glTF (.glb) export
  covering buildings, water, roads, and markers.
- **Attribution overlay + About panel** — per-tile Cesium credits plus a modal panel
  summarising all data sources and the tech stack.

---

## Architecture

### Monorepo layout

```
apps/web/         Vite + React + Resium frontend
  api/            Vercel serverless functions (Overpass proxy + cache) — /api/* routes
  server/         Server-side helpers for the functions (Overpass fetch, cache, simplify)
packages/shared/  TypeScript types + utilities (bbox math, Overpass QL, grid helpers)
```

The workspace is managed by **pnpm workspaces** (`pnpm-workspace.yaml`). Packages reference
each other as `@terrain/web` and `@terrain/shared`. The frontend and the serverless API
ship as one deployable unit — see [Deploy (Vercel)](#deploy-vercel).

### Data flow

```
user draws polygon
  → Zustand store (bbox + selectionPolygon)
    → /api/buildings, /api/water, /api/roads  (Vercel serverless functions)
        → Overpass API  (or Upstash Redis cache — 1-hour TTL — on HIT)
        → simplifier   (drop tiny features, snap coordinates, enforce 4 MB cap)
        → GeoJSON FeatureCollection response
      → client clips features to selection polygon
      → Cesium entities render extruded prisms / polylines / polygons
```

**Backend simplification steps (per endpoint):**
- Buildings: drops polygons below a minimum area threshold; snaps ring coordinates.
- Water: drops short waterway segments and tiny water bodies.
- Roads: filters by a highway-class whitelist (motorway → residential); drops very short
  segments; snaps coordinates.
- All three: if the raw Overpass response exceeds 4 MB the handler returns `413 AREA_TOO_DENSE`
  before simplification, guiding the user to reduce the selection area.

**Cesium imagery layer stack:** index 0 is always the active surface drape (satellite /
hillshade / topographic). Analytical overlays (slope/aspect, viewshed) are added at index ≥ 1
as `ImageryLayer` instances and removed when the tool is deactivated. This keeps the drape
stable while overlays come and go.

### API contract

All three endpoints share the same shape:

| Parameter | Type   | Description             |
|-----------|--------|-------------------------|
| `west`    | number | WGS-84 decimal degrees  |
| `south`   | number | WGS-84 decimal degrees  |
| `east`    | number | WGS-84 decimal degrees  |
| `north`   | number | WGS-84 decimal degrees  |

**Responses:**

| Status | Error code             | Meaning                        |
|--------|------------------------|--------------------------------|
| 200    | —                      | GeoJSON FeatureCollection      |
| 400    | `INVALID_PARAMS`       | Bad or missing query params    |
| 413    | `AREA_TOO_DENSE`       | Raw response > 4 MB            |
| 502    | `OVERPASS_UPSTREAM`    | Overpass 5xx                   |
| 503    | `OVERPASS_RATE_LIMITED`| Overpass 429                   |
| 504    | `OVERPASS_UPSTREAM`    | Overpass timeout               |
| 500    | `INTERNAL_ERROR`       | Unexpected failure             |

Successful responses include `Cache-Control: public, max-age=3600` and an
`X-Cache: HIT | MISS` header reflecting Upstash Redis cache state.

---

## Setup / Dev

### Prerequisites

- **Node.js 20+** (enforced by `engines` in `package.json`)
- **pnpm 9+** — recommended; npm works but the lockfile is pnpm-format
- **Cesium Ion account** (free tier) — needed for terrain elevation and satellite imagery

### Clone and install

```bash
git clone https://github.com/<your-fork>/terrain-visualization.git
cd terrain-visualization
pnpm install
```

### Environment variables

**`apps/web/.env.local`** (required to run the frontend):

```
VITE_CESIUM_ION_TOKEN=<your token from ion.cesium.com>
```

**API environment** — read by the serverless functions (all optional in local dev):

| Variable                  | Purpose                                      | Default              |
|---------------------------|----------------------------------------------|----------------------|
| `UPSTASH_REDIS_REST_URL`  | Upstash Redis endpoint for API response cache| in-memory fallback   |
| `UPSTASH_REDIS_REST_TOKEN`| Upstash Redis auth token                     | in-memory fallback   |
| `OVERPASS_ENDPOINT`       | Override the Overpass API URL                | public Overpass API  |

When Upstash credentials are absent the cache falls back to a process-scoped in-memory Map.
This is sufficient for local development but will not persist across serverless invocations.

### Run the dev server

```bash
pnpm --filter @terrain/web dev
```

Opens at `http://localhost:5173`. The Vite dev middleware auto-proxies `/api/<name>` requests
to `apps/web/api/<name>.ts`, so the full stack (frontend + API functions) runs from a single
command with no separate process required.

Alternatively, from the repo root:

```bash
pnpm dev   # alias defined in root package.json
```

### Stress-test URL deep link

App.tsx parses a `?bbox=west,south,east,north` query string on mount and pre-fills the
selection, which triggers all three data layers automatically. Useful for quick regression
tests without drawing on the map:

```
# Times Square ~2 km (should succeed, may trigger 5000-feature LOD cap)
http://localhost:5173/?bbox=-74.000,40.745,-73.975,40.770

# Manhattan 5×5 km (expected 413 AREA_TOO_DENSE)
http://localhost:5173/?bbox=-74.020,40.700,-73.960,40.760

# Lisbon sanity check (~5 km²)
http://localhost:5173/?bbox=-9.155,38.706,-9.131,38.726
```

See `apps/web/src/buildings/STRESS_TEST.md` for recorded run data and pass criteria.

---

## Build / Test / Lint

All commands run across every workspace package via pnpm's `-r` (recursive) flag.

```bash
pnpm -r typecheck   # TypeScript type-check (tsc --noEmit)
pnpm -r lint        # ESLint
pnpm -r test        # Vitest unit tests
pnpm -r build       # Production build (tsc + vite build)
```

**Continuous integration:** `.github/workflows/ci.yml` runs all four steps in order on
every push and pull request to `main` (Ubuntu latest, Node 20, pnpm 10).

---

## Deploy (Vercel)

The app is designed for Vercel. The Hobby tier is sufficient. The frontend and the API
deploy as a **single Vercel project**: the Vite app is the site, and the serverless
functions live in `apps/web/api/` — Vercel turns every file there into a `/api/*` route
on the same domain, so the browser keeps using relative `/api/...` paths.

1. Create a new Vercel project from the GitHub repo and set the **Root Directory** to
   `apps/web`. Vercel auto-detects Vite (Output Directory `dist`) and auto-detects the
   serverless functions in `apps/web/api/`.

   > Do **not** leave the Root Directory at the repo root — Vercel sees no framework
   > there, defaults the Output Directory to `public`, and the build fails.

2. Set the **environment variables** in the project dashboard:

   | Variable                   | Scope        | Where to get it                |
   |----------------------------|--------------|--------------------------------|
   | `VITE_CESIUM_ION_TOKEN`    | Build-time   | ion.cesium.com → Access Tokens |
   | `UPSTASH_REDIS_REST_URL`   | Runtime      | Upstash via Vercel Marketplace |
   | `UPSTASH_REDIS_REST_TOKEN` | Runtime      | Upstash via Vercel Marketplace |

3. Push to `main`. Vercel installs against the pnpm workspace (so `@terrain/shared`
   resolves), runs `pnpm build` in `apps/web`, and deploys the site plus the `/api`
   functions together.

> `VITE_CESIUM_ION_TOKEN` must be available at **build time** (it is embedded in the
> compiled JS bundle). The Upstash variables are only read at function invocation time.
>
> The server-side helper code the functions import (Overpass fetching, caching,
> geometry simplification) lives in `apps/web/server/` — outside `apps/web/api/`, so
> Vercel does not expose it as routes.

---

## Data Sources & Attribution

| Source | Used for | License | Attribution |
|--------|----------|---------|-------------|
| Cesium Ion / Cesium World Terrain | 3D terrain elevation | Cesium Ion ToS | © Cesium |
| Bing Maps Aerial (via Cesium Ion) | Satellite imagery drape | Cesium Ion / Bing ToS | © Microsoft / Bing Maps |
| ArcGIS World Hillshade | Hillshade imagery drape | ArcGIS Online ToS | © Esri, USGS, NOAA |
| OpenTopoMap | Topographic imagery drape | CC-BY-SA | Map data: © OpenStreetMap contributors, SRTM \| Map style: © OpenTopoMap (CC-BY-SA) |
| OpenStreetMap (via Overpass API) | Buildings, water bodies, roads | ODbL | © OpenStreetMap contributors |
| MapLibre demotiles | 2D selection map basemap | OpenMapTiles / ODbL | © MapLibre, © OpenStreetMap contributors |

Cesium's built-in credit overlay (bottom-left of the 3D viewport) surfaces additional
per-tile attributions automatically for Cesium Ion assets.

---

## Tech Stack

| Library | Version | Role |
|---------|---------|------|
| React | 19 | UI component tree |
| Vite | ^6 | Dev server + production bundler |
| TypeScript | ^5.8 | Type safety across all packages |
| Resium | ^1.21 | React bindings for CesiumJS |
| CesiumJS | ^1.140 | 3D globe rendering, terrain, imagery |
| Zustand | ^5 | Global app state (selection, layers, tools) |
| Tailwind CSS | ^3.4 | Utility-first styling |
| MapLibre GL | ^5 | 2D selection map |
| Recharts | ^3 | Elevation profile chart |
| Three.js | 0.184 | glTF (.glb) export |
| Vitest | ^2 | Unit test runner |
| ESLint | ^9 | Linting |
| Prettier | ^3 | Code formatting |
| @upstash/redis | ^1.34 | Redis cache client (API layer) |
| @vercel/node | ^5 | Vercel serverless function types (dev) |
| @turf/* | ^7.3 | Geodesic area, point-in-polygon, centroid |

---

## Limitations / Non-Goals (v1)

These are deliberate simplifications, not bugs. They may be addressed in future iterations.

- **Polygon clipping** — selection clipping is centroid-based. Buildings whose centroid falls
  outside the drawn polygon are dropped. Rare straddling buildings near the boundary may be
  excluded.
- **Building geometry** — only the first ring of MultiPolygon buildings is rendered. Interior
  courtyard holes are rendered as filled polygons without holes.
- **Road whitelist** — the Overpass query targets motorway through residential highway
  classes. Footways, cycleways, paths, and tracks are excluded from the road layer.
- **Viewshed** — uses a sampled-ray line-of-sight approximation (cast N rays from the
  observer point and test at regular intervals). This is not a true GPU shadow-map and may
  miss very narrow obstructions between sample points.
- **glTF export** — covers Cesium entities (buildings, water, roads, markers). The terrain
  mesh and imagery drape are not included in the export.
- **Selection cap** — 100 km² geodesic area. Larger selections are rejected client-side
  before any API request is made.
- **Mobile** — the sidebar layout collapses on narrow viewports. A real-device polish pass
  is pending.

---

## Project Structure

```
terrain-visualization/
├── apps/
│   ├── web/                    Vite + React frontend
│   │   └── src/
│   │       ├── components/     UI components (panels, overlays, controls)
│   │       ├── terrain/        Cesium imagery provider factory + drape logic
│   │       ├── buildings/      Buildings layer, simplifier, stress-test docs
│   │       ├── water/          Water layer + simplifier
│   │       ├── roads/          Roads layer, styles, simplifier
│   │       ├── tools/          Distance, elevation profile, slope/aspect, area/volume, viewshed
│   │       ├── export/         PNG screenshot + glTF export
│   │       └── store/          Zustand store (useAppStore.ts)
│   └── api/
│       ├── api/                Vercel serverless entry points (buildings.ts, water.ts, roads.ts)
│       └── lib/                Shared handler factory, Overpass client, simplifiers, cache
├── packages/
│   └── shared/                 BoundingBox type, Overpass QL builders, bbox/grid utilities
├── .github/
│   └── workflows/ci.yml        GitHub Actions: typecheck → lint → test → build
└── you-are-an-expert-purring-stonebraker.md   Master implementation plan (not for end users)
```

---

## Contributing / License

Issues and pull requests are welcome. Please open an issue before starting significant
feature work so the approach can be discussed first.

Code is MIT-licensed unless noted. Data attribution above remains with the original
sources — see the Data Sources table for per-source license details.
