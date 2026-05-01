/**
 * Tests for the tools slice in useAppStore.
 *
 * Covers:
 *   1. Initial state — no active tool, empty point arrays, null samples.
 *   2. setActiveTool clears the *previous* tool's points.
 *   3. addDistancePoint is bounded to 2 (a 3rd point resets to [newPoint]).
 *   4. addElevationProfilePoint is bounded to 2 and clears stale samples.
 *   5. clearActiveToolPoints clears the active tool only.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore.js';

const P1 = { lng: -9, lat: 38, height: 100 };
const P2 = { lng: -8.99, lat: 38.01, height: 110 };
const P3 = { lng: -8.98, lat: 38.02, height: 120 };

describe('useAppStore — tools slice', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeTool: null,
      distance: { points: [] },
      elevationProfile: { points: [], samples: null },
      slopeAspect: { mode: 'slope', status: { status: 'idle' } },
    });
  });

  it('starts with no active tool and empty points', () => {
    const s = useAppStore.getState();
    expect(s.activeTool).toBeNull();
    expect(s.distance.points).toEqual([]);
    expect(s.elevationProfile.points).toEqual([]);
    expect(s.elevationProfile.samples).toBeNull();
  });

  it('setActiveTool sets the active tool', () => {
    useAppStore.getState().setActiveTool('distance');
    expect(useAppStore.getState().activeTool).toBe('distance');
    useAppStore.getState().setActiveTool(null);
    expect(useAppStore.getState().activeTool).toBeNull();
  });

  it('switching tools clears the previous tool\'s points', () => {
    const { setActiveTool, addDistancePoint, addElevationProfilePoint } =
      useAppStore.getState();
    setActiveTool('distance');
    addDistancePoint(P1);
    expect(useAppStore.getState().distance.points).toHaveLength(1);

    // Switch to elevation-profile → distance.points should be cleared.
    setActiveTool('elevation-profile');
    expect(useAppStore.getState().distance.points).toEqual([]);

    addElevationProfilePoint(P1);
    addElevationProfilePoint(P2);
    expect(useAppStore.getState().elevationProfile.points).toHaveLength(2);

    // Switch back to distance → elevationProfile cleared.
    setActiveTool('distance');
    expect(useAppStore.getState().elevationProfile.points).toEqual([]);
    expect(useAppStore.getState().elevationProfile.samples).toBeNull();
  });

  it('addDistancePoint is bounded to 2 (a 3rd point resets to [newPoint])', () => {
    const { addDistancePoint } = useAppStore.getState();
    addDistancePoint(P1);
    addDistancePoint(P2);
    expect(useAppStore.getState().distance.points).toEqual([P1, P2]);
    addDistancePoint(P3);
    expect(useAppStore.getState().distance.points).toEqual([P3]);
  });

  it('addElevationProfilePoint is bounded to 2 and clears stale samples', () => {
    const { addElevationProfilePoint, setElevationSamples } = useAppStore.getState();
    addElevationProfilePoint(P1);
    addElevationProfilePoint(P2);
    setElevationSamples([{ lng: 0, lat: 0, height: 0, distance: 0 }]);
    expect(useAppStore.getState().elevationProfile.samples).toHaveLength(1);

    addElevationProfilePoint(P3);
    expect(useAppStore.getState().elevationProfile.points).toEqual([P3]);
    expect(useAppStore.getState().elevationProfile.samples).toBeNull();
  });

  it('clearActiveToolPoints clears only the active tool\'s points', () => {
    const {
      setActiveTool,
      addDistancePoint,
      addElevationProfilePoint,
      clearActiveToolPoints,
    } = useAppStore.getState();

    addDistancePoint(P1);
    addElevationProfilePoint(P2);

    setActiveTool('distance');
    // setActiveTool('distance') from null should NOT have cleared anything
    // (since the *previous* active tool was null), but our setActiveTool
    // implementation only clears when the previous activeTool was a tool.
    // After this call distance.points may have been cleared by the slice's
    // switch logic — re-add to ensure deterministic state for the assertion.
    useAppStore.setState({
      distance: { points: [P1] },
      elevationProfile: { points: [P2], samples: null },
      activeTool: 'distance',
    });

    clearActiveToolPoints();
    expect(useAppStore.getState().distance.points).toEqual([]);
    // elevationProfile.points was untouched.
    expect(useAppStore.getState().elevationProfile.points).toEqual([P2]);
  });

  it('slopeAspect: defaults to mode="slope" + status idle', () => {
    const s = useAppStore.getState();
    expect(s.slopeAspect.mode).toBe('slope');
    expect(s.slopeAspect.status).toEqual({ status: 'idle' });
  });

  it('setSlopeAspectMode toggles between slope and aspect without touching status', () => {
    const { setSlopeAspectMode, setSlopeAspectStatus } = useAppStore.getState();
    setSlopeAspectStatus({ status: 'loading', cols: 100, rows: 80 });
    setSlopeAspectMode('aspect');
    const s = useAppStore.getState();
    expect(s.slopeAspect.mode).toBe('aspect');
    expect(s.slopeAspect.status).toEqual({ status: 'loading', cols: 100, rows: 80 });
  });

  it('switching away from slope-aspect resets its status to idle but keeps the mode', () => {
    const { setActiveTool, setSlopeAspectMode, setSlopeAspectStatus } =
      useAppStore.getState();
    setActiveTool('slope-aspect');
    setSlopeAspectMode('aspect');
    setSlopeAspectStatus({ status: 'ready', cols: 64, rows: 64, resolutionM: 30 });

    setActiveTool('distance');
    const s = useAppStore.getState();
    expect(s.activeTool).toBe('distance');
    expect(s.slopeAspect.mode).toBe('aspect'); // mode is sticky across tool switches
    expect(s.slopeAspect.status).toEqual({ status: 'idle' });
  });

  it('resetDistance and resetElevationProfile clear their respective slices', () => {
    const { addDistancePoint, addElevationProfilePoint, resetDistance, resetElevationProfile } =
      useAppStore.getState();
    addDistancePoint(P1);
    addElevationProfilePoint(P2);
    resetDistance();
    expect(useAppStore.getState().distance.points).toEqual([]);
    resetElevationProfile();
    expect(useAppStore.getState().elevationProfile.points).toEqual([]);
    expect(useAppStore.getState().elevationProfile.samples).toBeNull();
  });
});
