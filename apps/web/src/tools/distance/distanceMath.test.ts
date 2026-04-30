/**
 * Tests for distanceMath.
 *
 * Uses the real Cesium implementations of EllipsoidGeodesic and
 * Cartesian3.fromDegrees — these are pure math, no network or WebGL.
 *
 * Reference values:
 *   - Lisbon (38.7223, -9.1393) → Porto (41.1496, -8.6109): ~274 km
 *     (well-known geodesic distance — accept ±5%).
 */
import { describe, it, expect } from 'vitest';
import {
  planimetricDistanceMeters,
  surfaceDistanceMeters,
} from './distanceMath.js';
import type { AlongLineSample } from '../sampleAlongLine.js';

const LISBON = { lng: -9.1393, lat: 38.7223 };
const PORTO = { lng: -8.6109, lat: 41.1496 };

describe('planimetricDistanceMeters', () => {
  it('Lisbon → Porto is about 274 km (±5%)', () => {
    const meters = planimetricDistanceMeters(LISBON, PORTO);
    expect(meters).toBeGreaterThan(260_000);
    expect(meters).toBeLessThan(290_000);
  });

  it('returns 0 for two identical points', () => {
    expect(planimetricDistanceMeters(LISBON, { ...LISBON })).toBe(0);
  });

  it('is symmetric (a→b == b→a, within float tolerance)', () => {
    const ab = planimetricDistanceMeters(LISBON, PORTO);
    const ba = planimetricDistanceMeters(PORTO, LISBON);
    expect(Math.abs(ab - ba)).toBeLessThan(1); // <1 m diff
  });
});

describe('surfaceDistanceMeters', () => {
  it('returns 0 for fewer than 2 samples', () => {
    expect(surfaceDistanceMeters([])).toBe(0);
    expect(
      surfaceDistanceMeters([
        { lng: 0, lat: 0, height: 0, distance: 0 },
      ]),
    ).toBe(0);
  });

  it('a flat 1-km line has surface distance approximately equal to the planimetric (±1%)', () => {
    // A short E-W segment along the equator at constant height 0.
    // Distance over 1° of equator ≈ 111 km, so 0.009° ≈ ~1 km.
    const a = { lng: 0, lat: 0 };
    const b = { lng: 0.009, lat: 0 };
    const N = 30;
    const samples: AlongLineSample[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const lng = a.lng + (b.lng - a.lng) * t;
      const lat = a.lat + (b.lat - a.lat) * t;
      samples.push({ lng, lat, height: 0, distance: 0 });
    }
    const surf = surfaceDistanceMeters(samples);
    const planim = planimetricDistanceMeters(a, b);
    expect(surf).toBeGreaterThan(0);
    // Within 1% of the planimetric distance for a flat line.
    expect(Math.abs(surf - planim) / planim).toBeLessThan(0.01);
  });

  it('an uphill line has surface distance strictly greater than the planimetric', () => {
    const a = { lng: 0, lat: 0 };
    const b = { lng: 0.01, lat: 0 };
    const N = 30;
    const flat: AlongLineSample[] = [];
    const uphill: AlongLineSample[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const lng = a.lng + (b.lng - a.lng) * t;
      const lat = a.lat + (b.lat - a.lat) * t;
      flat.push({ lng, lat, height: 0, distance: 0 });
      // Sharp climb: 0 → 1000 m over the segment.
      uphill.push({ lng, lat, height: t * 1000, distance: 0 });
    }
    const surfFlat = surfaceDistanceMeters(flat);
    const surfUp = surfaceDistanceMeters(uphill);
    expect(surfUp).toBeGreaterThan(surfFlat);
  });

  it('order matters only in the sense that reversing the array gives the same total length', () => {
    const samples: AlongLineSample[] = [
      { lng: 0, lat: 0, height: 0, distance: 0 },
      { lng: 0.001, lat: 0, height: 50, distance: 0 },
      { lng: 0.002, lat: 0, height: 100, distance: 0 },
    ];
    const fwd = surfaceDistanceMeters(samples);
    const rev = surfaceDistanceMeters([...samples].reverse());
    expect(Math.abs(fwd - rev)).toBeLessThan(1e-3);
  });
});
