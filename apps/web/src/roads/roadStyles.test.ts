/**
 * Tests for roadStyles.ts — pure style-lookup function.
 *
 * Cesium is mocked so tests run without a WebGL context.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock Cesium before importing roadStyles
vi.mock('cesium', () => ({
  Color: {
    fromCssColorString: vi.fn((hex: string) => ({ hex, _isCesiumColor: true })),
  },
}));

import { getRoadStyle } from './roadStyles.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function expectValidStyle(highway: string | undefined | null) {
  const style = getRoadStyle(highway);
  expect(style).toHaveProperty('color');
  expect(style).toHaveProperty('width');
  expect(typeof style.width).toBe('number');
  expect(style.width).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getRoadStyle', () => {
  // Major road classes
  it('motorway → width 6 (widest)', () => {
    const s = getRoadStyle('motorway');
    expect(s.width).toBe(6);
  });

  it('trunk → width 5', () => {
    const s = getRoadStyle('trunk');
    expect(s.width).toBe(5);
  });

  it('primary → width 4', () => {
    const s = getRoadStyle('primary');
    expect(s.width).toBe(4);
  });

  it('secondary → width 3.5', () => {
    const s = getRoadStyle('secondary');
    expect(s.width).toBe(3.5);
  });

  it('tertiary → width 3', () => {
    const s = getRoadStyle('tertiary');
    expect(s.width).toBe(3);
  });

  it('unclassified → width 2.5', () => {
    const s = getRoadStyle('unclassified');
    expect(s.width).toBe(2.5);
  });

  it('residential → width 2.5 (same as unclassified)', () => {
    const s = getRoadStyle('residential');
    expect(s.width).toBe(2.5);
  });

  it('service → width 2', () => {
    const s = getRoadStyle('service');
    expect(s.width).toBe(2);
  });

  it('living_street → width 2 (same as service)', () => {
    const s = getRoadStyle('living_street');
    expect(s.width).toBe(2);
  });

  it('pedestrian → width 1.5', () => {
    const s = getRoadStyle('pedestrian');
    expect(s.width).toBe(1.5);
  });

  // Link variants — same colour as parent, width × 0.8
  it('motorway_link → width 6 × 0.8 = 4.8', () => {
    const s = getRoadStyle('motorway_link');
    expect(s.width).toBeCloseTo(6 * 0.8, 5);
    // Same color object reference as motorway
    expect(s.color).toBe(getRoadStyle('motorway').color);
  });

  it('trunk_link → width 5 × 0.8 = 4.0', () => {
    const s = getRoadStyle('trunk_link');
    expect(s.width).toBeCloseTo(5 * 0.8, 5);
    expect(s.color).toBe(getRoadStyle('trunk').color);
  });

  it('primary_link → width 4 × 0.8 = 3.2', () => {
    const s = getRoadStyle('primary_link');
    expect(s.width).toBeCloseTo(4 * 0.8, 5);
    expect(s.color).toBe(getRoadStyle('primary').color);
  });

  it('secondary_link → width 3.5 × 0.8 = 2.8', () => {
    const s = getRoadStyle('secondary_link');
    expect(s.width).toBeCloseTo(3.5 * 0.8, 5);
  });

  it('tertiary_link → width 3 × 0.8 = 2.4', () => {
    const s = getRoadStyle('tertiary_link');
    expect(s.width).toBeCloseTo(3 * 0.8, 5);
  });

  // Fallback / unknown values
  it('unknown highway value → fallback style (width 2)', () => {
    const s = getRoadStyle('raceway');
    expect(s.width).toBe(2);
    expectValidStyle('raceway');
  });

  it('footway → fallback style (excluded from whitelist)', () => {
    const s = getRoadStyle('footway');
    expect(s.width).toBe(2);
  });

  it('cycleway → fallback style (excluded from whitelist)', () => {
    const s = getRoadStyle('cycleway');
    expect(s.width).toBe(2);
  });

  it('undefined → fallback style', () => {
    expectValidStyle(undefined);
  });

  it('null → fallback style', () => {
    expectValidStyle(null);
  });

  it('empty string → fallback style', () => {
    expectValidStyle('');
  });

  // Colour differentiation: motorway and residential must NOT share a colour
  it('motorway and residential have different colours', () => {
    const motorway = getRoadStyle('motorway');
    const residential = getRoadStyle('residential');
    expect(motorway.color).not.toBe(residential.color);
  });

  // All documented classes return valid styles
  const DOCUMENTED = [
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'unclassified', 'residential', 'service', 'living_street', 'pedestrian',
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
  ];
  for (const cls of DOCUMENTED) {
    it(`${cls} returns a valid style object`, () => {
      expectValidStyle(cls);
    });
  }
});
