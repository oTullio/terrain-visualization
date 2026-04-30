/**
 * Tests for pickCartographicAt.
 *
 * Strategy: build a fake `Cesium.Viewer` whose `scene.pickPosition`,
 * `camera.getPickRay`, and `globe.pick` we can stub on a per-test basis.
 * We don't mock the Cesium module wholesale — `Cartographic.fromCartesian`
 * and `Math.toDegrees` need to be the real implementations so the helper's
 * return values can be sanity-checked.
 *
 * Three tests cover:
 *   1. pickPosition succeeds → returns degrees + height from the cartesian.
 *   2. pickPosition returns undefined → globe.pick fallback path is used.
 *   3. Both pickPosition and globe.pick fail → returns null.
 */
import { describe, it, expect, vi } from 'vitest';
import * as Cesium from 'cesium';
import { pickCartographicAt } from './pickPosition.js';

// Pick a sentinel Cartesian3 from a known lng/lat/height so we can verify
// the helper round-trips through Cartographic correctly.
function cartesianFor(lng: number, lat: number, height: number): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(lng, lat, height);
}

interface FakeViewer {
  isDestroyed: () => boolean;
  scene: {
    pickPosition: ReturnType<typeof vi.fn>;
    camera: { getPickRay: ReturnType<typeof vi.fn> };
    globe: { pick: ReturnType<typeof vi.fn> };
  };
}

function makeViewer(opts: {
  pickPositionResult?: Cesium.Cartesian3 | undefined;
  rayResult?: object | undefined;
  globePickResult?: Cesium.Cartesian3 | undefined;
}): FakeViewer {
  return {
    isDestroyed: () => false,
    scene: {
      pickPosition: vi.fn(() => opts.pickPositionResult),
      camera: { getPickRay: vi.fn(() => opts.rayResult ?? {}) },
      globe: { pick: vi.fn(() => opts.globePickResult) },
    },
  };
}

const SCREEN = new Cesium.Cartesian2(100, 100);

describe('pickCartographicAt', () => {
  it('uses scene.pickPosition when it returns a Cartesian3', () => {
    const expectedLng = -9.13;
    const expectedLat = 38.71;
    const expectedHeight = 87;
    const fake = makeViewer({
      pickPositionResult: cartesianFor(expectedLng, expectedLat, expectedHeight),
    });

    const result = pickCartographicAt(fake as unknown as Cesium.Viewer, SCREEN);

    expect(result).not.toBeNull();
    expect(result!.lng).toBeCloseTo(expectedLng, 5);
    expect(result!.lat).toBeCloseTo(expectedLat, 5);
    expect(result!.height).toBeCloseTo(expectedHeight, 1);
    // globe.pick should not be invoked because the first strategy succeeded.
    expect(fake.scene.globe.pick).not.toHaveBeenCalled();
  });

  it('falls back to globe.pick when scene.pickPosition returns undefined', () => {
    const expectedLng = 1.5;
    const expectedLat = 50.25;
    const expectedHeight = 12;
    const fake = makeViewer({
      pickPositionResult: undefined,
      globePickResult: cartesianFor(expectedLng, expectedLat, expectedHeight),
    });

    const result = pickCartographicAt(fake as unknown as Cesium.Viewer, SCREEN);

    expect(result).not.toBeNull();
    expect(result!.lng).toBeCloseTo(expectedLng, 5);
    expect(result!.lat).toBeCloseTo(expectedLat, 5);
    expect(fake.scene.pickPosition).toHaveBeenCalledOnce();
    expect(fake.scene.globe.pick).toHaveBeenCalledOnce();
  });

  it('returns null when both pickPosition and globe.pick miss', () => {
    const fake = makeViewer({
      pickPositionResult: undefined,
      globePickResult: undefined,
    });

    const result = pickCartographicAt(fake as unknown as Cesium.Viewer, SCREEN);

    expect(result).toBeNull();
  });

  it('returns null when the viewer is destroyed', () => {
    const fake: FakeViewer = {
      isDestroyed: () => true,
      scene: {
        pickPosition: vi.fn(),
        camera: { getPickRay: vi.fn() },
        globe: { pick: vi.fn() },
      },
    };
    const result = pickCartographicAt(fake as unknown as Cesium.Viewer, SCREEN);
    expect(result).toBeNull();
    expect(fake.scene.pickPosition).not.toHaveBeenCalled();
  });
});
