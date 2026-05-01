# Mobile Test Plan — Terrain Visualizer

Manual checklist for the Phase E5 mobile pass. Execute these steps on real
hardware before marking the release done.

---

## Devices to test on

| Slot | Recommended device | Minimum requirement |
|------|-------------------|---------------------|
| Android | Google Pixel 6a or Samsung Galaxy A54 | Any mid-range Android released 2021 or later |
| iOS | iPhone 12 or later | Any iOS 15+ device |

Both slots must be covered before the pass is considered complete.

## Browsers

| Platform | Browser | Notes |
|----------|---------|-------|
| Android | Chrome (latest stable) | The dominant mobile browser on Android |
| iOS | Safari (latest) | Required — Mobile Safari is the only full-browser engine allowed on iOS |

Do **not** test only on Wi-Fi. See the Network section below.

## Network conditions

- Run at least one full test sequence over **4G LTE** (not home Wi-Fi).  
  Cesium tile fetches, Overpass API calls, and terrain sampling are all
  meaningfully slower on a mobile connection and may surface issues that
  never appear on a desktop or over broadband.
- You may use Chrome DevTools Network Throttling on desktop as a
  supplemental check, but it does not replace real-device 4G testing.

---

## Test cases

### 1. Page load

- [ ] App shell (header + Cesium viewer) renders within **5 seconds** of
      navigating to the URL on 4G LTE.
- [ ] No red console errors related to Cesium initialization
      (open DevTools → Console).
- [ ] The header shows the "Terrain Visualizer" wordmark and the
      "Selection", "Reduced scene", satellite/hillshade/topographic
      toggle buttons.

### 2. Selection map — mobile overlay

- [ ] Tap the **"Selection"** button in the header.
- [ ] The 2D MapLibre map opens as a full-width overlay on top of the
      Cesium scene.
- [ ] Tap **outside** the map panel (on the darkened backdrop) → overlay
      closes and the 3D scene is fully visible again.
- [ ] Reopen the overlay, then tap the **✕** close button → overlay closes.
- [ ] Reopen the overlay, then press **Escape** (hardware keyboard or
      on-screen if available) → overlay closes.

### 3. Selection — draw a rectangle

- [ ] Open the selection overlay (tap "Selection").
- [ ] Confirm "Rectangle" mode is active (default).
- [ ] Draw a small selection: tap-drag to define a rectangle approximately
      2 × 2 km (the area readout should show a value in that range).
- [ ] Tap **Confirm**. The overlay closes and the 3D scene begins loading
      data for the selected area.
- [ ] Confirm: no error toast appears.

### 4. Selection — draw a polygon

- [ ] Open the selection overlay.
- [ ] Switch to **Polygon** mode.
- [ ] Tap at least 4 vertices to draw a small polygon.
- [ ] Tap **Confirm**.
- [ ] Confirm: polygon selection registered (LayersStatus shows loading or
      ready state for visible layers).

### 5. 3D navigation — touch gestures

Cesium's default touch handlers are active. Verify each gesture works
with no input lag worse than ~250 ms:

- [ ] **Pinch to zoom**: two fingers, spread → zoom in; pinch → zoom out.
- [ ] **Two-finger drag to orbit** (tilt + rotate): two fingers, rotate
      or drag — the camera should orbit the terrain.
- [ ] **One-finger drag to pan**: single touch drag pans the scene.

If any gesture is unresponsive or causes an error, check the console for
`enableInputs` or `ScreenSpaceCameraController` related messages.

### 6. Surface drape

- [ ] Tap **Satellite** → Bing aerial imagery tiles load.
- [ ] Tap **Hillshade** → ArcGIS hillshade tiles load.
- [ ] Tap **Topographic** → OpenTopoMap tiles load.
- [ ] Switch back to **Satellite**.

Confirm tiles are visible within ~10 seconds on 4G. A brief grey globe
during loading is acceptable.

### 7. Reduced-scene toggle

- [ ] On first load on mobile, "Reduced scene" button should have its
      **amber** indicator (ON by default on mobile viewports).
- [ ] With Reduced scene **ON**: buildings and roads should NOT appear even
      after a selection is confirmed.
- [ ] Tap **Reduced scene** to toggle it OFF.
- [ ] Confirm a selection area. After loading, **buildings** should extrude
      as grey 3D prisms and **roads** should appear as colored polylines.
- [ ] Toggle Reduced scene back **ON** → buildings and roads disappear
      (the scene resets on next selection or page refresh; toggling mid-session
      is visible after the next selection).

### 8. Layers — buildings, water, roads

*(Requires Reduced scene OFF and an active selection.)*

- [ ] **Buildings**: grey extruded prisms are visible for areas with OSM
      building data.
- [ ] **Water polygons**: blue-tinted water bodies render correctly.
- [ ] **Roads**: polylines appear with appropriate colors
      (motorways orange/red, residential streets lighter).

### 9. Tools sidebar

- [ ] Tap each tool button in the left-hand tools panel in turn:
      Distance, Elevation profile, Slope/aspect, Area/volume, Viewshed.
- [ ] For each, confirm the tool panel becomes visible below (or overlapping)
      the tool button.
- [ ] Deactivate each tool by tapping its button again.

### 10. Distance tool

- [ ] Activate the **Distance** tool.
- [ ] Tap two points on the terrain.
- [ ] Confirm: both a planimetric distance (m or km) and a 3D
      surface distance appear in the panel.
- [ ] Numbers are non-zero and plausible for the chosen points.

### 11. Elevation profile

- [ ] Activate the **Elevation profile** tool.
- [ ] Tap two points.
- [ ] Confirm: the chart renders with a profile line.
- [ ] The y-axis shows elevation in metres; the x-axis shows distance.

### 12. Slope/aspect overlay

*(Requires Reduced scene OFF.)*

- [ ] Activate the **Slope/aspect** tool.
- [ ] Confirm an active selection exists; if not, draw one first.
- [ ] The status indicator shows "loading" then transitions to "ready"
      within ~10 seconds on 4G.
- [ ] The slope/aspect raster overlay is visible draped over the terrain.
- [ ] Toggle between Slope and Aspect modes; confirm the overlay redraws.

### 13. Area/volume

- [ ] Activate the **Area/volume** tool.
- [ ] Tap at least 4 vertices on the terrain.
- [ ] Double-tap to close the polygon.
- [ ] Confirm: cut volume and fill volume numbers appear in the panel
      (values may be 0 on flat terrain, which is correct).

### 14. Viewshed

*(Requires Reduced scene OFF.)*

- [ ] Activate the **Viewshed** tool.
- [ ] Tap an observer point on the terrain.
- [ ] Confirm the viewshed overlay renders (green = visible, red = not
      visible) within ~15 seconds on 4G.
- [ ] A yellow dot marks the observer position.

### 15. Export — PNG

- [ ] Tap the **Export PNG** button in the header.
- [ ] Confirm a PNG file is downloaded to the device.
- [ ] Open the downloaded file and confirm it shows the 3D scene.

### 16. Export — glTF

- [ ] Tap the **Export glTF** button in the header.
- [ ] Confirm a `.glb` or `.gltf` file is downloaded.

### 17. About panel

- [ ] Tap **About** in the header.
- [ ] Panel opens; scroll through the content.
- [ ] Tap the **✕** close button → panel closes.
- [ ] Reopen; tap the dark backdrop → panel closes.

### 18. Attribution overlay

- [ ] Confirm the attribution overlay is visible at the bottom-right of
      the 3D scene.
- [ ] Switch between drape modes; confirm the credit text updates to match
      the current imagery provider.

---

## Pass criteria

The mobile pass is **DONE** when all checkboxes above are ticked without:

- A page crash or white screen.
- A visible JavaScript error in the browser console (warnings are acceptable).
- A gesture that is completely unresponsive (brief latency is fine).
- A tool panel that never appears after activation.
- A download that never starts.

---

## Known limitations (carry forward from previous phases)

- **MultiPolygon courtyards/holes**: only the outer ring of each building
  polygon is rendered. Holes (e.g., courtyard buildings) are omitted.
- **glTF export**: the exported file contains building geometry only; the
  terrain mesh is not included.
- **Viewshed algorithm**: sampled-ray line-of-sight approximation, not a
  GPU shadow map. Results may miss narrow hidden/visible corridors between
  sample points.
- **Area/volume grid**: computed on a regular lat/lon grid; cells near
  poles are not equal-area (not a concern for the mid-latitude use cases
  the app targets).
- **Slope/aspect resolution**: capped at 30 m per cell (256 × 256 grid
  maximum). Very large selections will have coarser resolution.
- **Reduced-scene toggle mid-session**: toggling after a selection is
  confirmed does not immediately remove/re-add layers. The change takes
  effect on the next selection or page refresh.

---

## Reporting a failed test case

1. **Take a screenshot** of the failure state (full screen, including the
   browser chrome so the URL is visible).
2. **Note the following:**
   - Device model and OS version (e.g., "Pixel 6a, Android 14")
   - Browser and version (e.g., "Chrome 124.0.6367")
   - Network type (4G LTE, Wi-Fi, etc.)
   - Which test case number and step failed
   - Console error text if available (screenshot or copy-paste)
3. **Open a new GitHub issue** with the title format:
   `[Mobile] <test case #> — <short description>`
   Paste the screenshot and the notes above into the issue body.

Example issue title: `[Mobile] #5 — Two-finger orbit unresponsive on Safari iOS 17`
