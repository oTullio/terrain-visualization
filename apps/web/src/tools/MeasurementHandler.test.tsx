/**
 * Tests for MeasurementHandler.
 *
 * `vi.mock` factories are hoisted, so we cannot reference module-scope
 * variables from inside them. Instead, the cesium mock attaches the
 * registered-callback queue to a global property; tests retrieve it back
 * out via that same global.
 *
 * Scenarios:
 *   1. LEFT_CLICK with activeTool='distance' → addDistancePoint dispatched.
 *   2. LEFT_CLICK with activeTool='elevation-profile' → addElevationProfilePoint.
 *   3. LEFT_CLICK with activeTool=null → no dispatch.
 *   4. Esc keydown with active tool → clearActiveToolPoints.
 *   5. Esc keydown with no active tool → no-op.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

interface RegisteredAction {
  cb: (movement: { position: unknown }) => void;
  type: number;
}

declare global {
  var __mhRegistered: RegisteredAction[];
}
globalThis.__mhRegistered = [];

vi.mock('cesium', async () => {
  const actual = (await vi.importActual('cesium')) as Record<string, unknown>;
  class FakeHandler {
    constructor(_canvas: unknown) {
      /* no-op */
    }
    setInputAction(cb: RegisteredAction['cb'], type: number) {
      globalThis.__mhRegistered.push({ cb, type });
    }
    destroy() {
      /* no-op */
    }
  }
  return {
    ...actual,
    ScreenSpaceEventHandler: FakeHandler,
    ScreenSpaceEventType: { LEFT_CLICK: 2 },
  };
});

const fakeViewer = {
  isDestroyed: () => false,
  canvas: { _isCanvas: true },
};
vi.mock('resium', () => ({
  useCesium: () => ({ viewer: fakeViewer }),
}));

const pickResult = { lng: -9, lat: 38, height: 50 };
vi.mock('./pickPosition.js', () => ({
  pickCartographicAt: vi.fn(() => pickResult),
}));

// Per-test mutable store stub.
const storeStub = {
  activeTool: null as 'distance' | 'elevation-profile' | null,
  addDistancePoint: vi.fn(),
  addElevationProfilePoint: vi.fn(),
  clearActiveToolPoints: vi.fn(),
};
vi.mock('../store/useAppStore.js', () => ({
  useAppStore: { getState: () => storeStub },
}));

import MeasurementHandler from './MeasurementHandler.js';

beforeEach(() => {
  globalThis.__mhRegistered = [];
  storeStub.activeTool = null;
  storeStub.addDistancePoint.mockReset();
  storeStub.addElevationProfilePoint.mockReset();
  storeStub.clearActiveToolPoints.mockReset();
});

function fireLeftClick() {
  const entry = globalThis.__mhRegistered[0];
  if (!entry) throw new Error('no input action registered');
  entry.cb({ position: { x: 100, y: 100 } });
}

describe('MeasurementHandler', () => {
  it('LEFT_CLICK with activeTool=distance dispatches addDistancePoint', () => {
    storeStub.activeTool = 'distance';
    render(<MeasurementHandler />);
    fireLeftClick();
    expect(storeStub.addDistancePoint).toHaveBeenCalledWith(pickResult);
    expect(storeStub.addElevationProfilePoint).not.toHaveBeenCalled();
  });

  it('LEFT_CLICK with activeTool=elevation-profile dispatches addElevationProfilePoint', () => {
    storeStub.activeTool = 'elevation-profile';
    render(<MeasurementHandler />);
    fireLeftClick();
    expect(storeStub.addElevationProfilePoint).toHaveBeenCalledWith(pickResult);
    expect(storeStub.addDistancePoint).not.toHaveBeenCalled();
  });

  it('LEFT_CLICK with no active tool is a no-op', () => {
    storeStub.activeTool = null;
    render(<MeasurementHandler />);
    fireLeftClick();
    expect(storeStub.addDistancePoint).not.toHaveBeenCalled();
    expect(storeStub.addElevationProfilePoint).not.toHaveBeenCalled();
  });

  it('Escape keydown clears active-tool points', () => {
    storeStub.activeTool = 'distance';
    render(<MeasurementHandler />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(storeStub.clearActiveToolPoints).toHaveBeenCalled();
  });

  it('Escape with no active tool is a no-op', () => {
    storeStub.activeTool = null;
    render(<MeasurementHandler />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(storeStub.clearActiveToolPoints).not.toHaveBeenCalled();
  });
});
