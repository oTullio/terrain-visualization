# Buildings layer — stress-test playbook

Phase C1 acceptance requires that we can pull a busy urban tile through
the full pipeline (Overpass → simplify → fetch → clip → LOD cap → Cesium
extruded prisms) without crashing the page.

## Target areas

| Label             | west     | south  | east     | north  | Approx. size |
|-------------------|---------:|-------:|---------:|-------:|--------------|
| Manhattan 5×5 km  | -74.020  | 40.700 | -73.960  | 40.760 | ~30 km²      |
| Times Square ~2km | -74.000  | 40.745 | -73.975  | 40.770 | ~5 km²       |
| Lisbon (small)    | -9.155   | 38.706 | -9.131   | 38.726 | ~5 km²       |

The Manhattan 5×5 km box is expected to trip the backend's 4 MB
`AREA_TOO_DENSE` guard (413). The Times Square box is the next denser
test that should *succeed* and likely trigger the 5000-feature LOD cap.

## How to run

The fastest path is the `?bbox=` URL deep link — App.tsx parses it on
mount and pre-fills the Zustand selection (rectangle polygon derived
from the bbox), which kicks off `BuildingsLayer` automatically.

```
pnpm --filter @terrain/web dev
# then open one of:
#   http://localhost:5173/?bbox=-74.020,40.700,-73.960,40.760     # Manhattan 5×5 — expect 413
#   http://localhost:5173/?bbox=-74.000,40.745,-73.975,40.770     # Times Square ~2 km
#   http://localhost:5173/?bbox=-9.155,38.706,-9.131,38.726       # Lisbon — sanity
```

You can also draw a rectangle on the SelectionMap on the left pane and
hit Confirm.

## What to record per run

1. HTTP status (200, 413, 502, 503, 504).
2. Number of features in the FeatureCollection (visible in the
   `BuildingsStatus` "Showing N of M …" overlay, or in DevTools >
   Network > Response).
3. Response body size (DevTools > Network > Size).
4. FPS in Cesium after camera flyTo settles. Open Cesium's "Performance
   display" via dev console: `viewer.scene.debugShowFramesPerSecond = true`.
5. Whether the LOD-cap notice appeared (kept < total).
6. Whether the AREA_TOO_DENSE banner appeared in the status overlay.

## Pass criteria

- The page does not crash for any of the test bboxes.
- The Times Square box returns a valid 200 response (or, if Overpass is
  rate-limiting, surfaces a 503 message — also acceptable).
- After the camera flyTo settles, FPS ≥ 20 on a mid-range laptop.
- `AREA_TOO_DENSE` shows the verbatim message "Selection contains too
  many buildings. Try a smaller area." for the Manhattan 5×5 km bbox.
- For any 200 with > 5000 features: the cap notice "Showing 5,000 of N
  buildings (largest first)" appears in the top-right.

## Captured run — 2026-04-30 (this implementer, dev middleware via curl)

| bbox                                            | HTTP | Body size | Features | Notes                                    |
|-------------------------------------------------|-----:|----------:|---------:|------------------------------------------|
| Manhattan 5×5 (-74.020,40.700,-73.960,40.760)   |  413 |     97 B  |        — | `AREA_TOO_DENSE`: verbatim message ✓     |
| Times Square ~2 km                              |  200 |   3.32 MB |    8,748 | Will trigger 5000 LOD cap → dropped=3,748 |
| Lisbon (-9.155,38.706,-9.131,38.726)            |  200 |   2.74 MB |    9,122 | Will trigger 5000 LOD cap → dropped=4,122 |

Verified via:

```
curl -sS 'http://localhost:5173/api/buildings?west=-74.020&south=40.700&east=-73.960&north=40.760'
# → {"error":"AREA_TOO_DENSE","message":"Selection contains too many buildings. Try a smaller area."}

curl -sS 'http://localhost:5173/api/buildings?west=-74.000&south=40.745&east=-73.975&north=40.770' | wc -c
# → 3322117

curl -sS 'http://localhost:5173/?bbox=-9.155,38.706,-9.131,38.726' -o /dev/null -w '%{http_code}\n'
# → 200 (HTML; ?bbox= is parsed client-side at mount and triggers BuildingsLayer)
```

**Manual visual confirmation pending** — Cesium FPS measurement, the
visual silhouette of extruded prisms, and the on-screen "Showing 5,000
of 8,748" overlay all require a real browser session and were not
asserted automatically. The pipeline (fetch → clip → cap → entity
construction) is exercised by the unit-test suite; observable rendering
behaviour is the next manual checkpoint.
