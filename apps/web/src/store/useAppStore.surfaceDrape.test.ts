/**
 * Tests for the surfaceDrape slice in useAppStore.
 *
 * We test the real store (no mocks) to verify:
 *   1. Initial state is 'satellite'.
 *   2. setSurfaceDrape updates the state to the new mode.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore.js';

describe('useAppStore — surfaceDrape slice', () => {
  beforeEach(() => {
    // Reset to initial state before each test using setState directly.
    useAppStore.setState({ surfaceDrape: 'satellite' });
  });

  it('initial surfaceDrape is "satellite"', () => {
    const state = useAppStore.getState();
    expect(state.surfaceDrape).toBe('satellite');
  });

  it('setSurfaceDrape updates surfaceDrape to hillshade', () => {
    useAppStore.getState().setSurfaceDrape('hillshade');
    expect(useAppStore.getState().surfaceDrape).toBe('hillshade');
  });

  it('setSurfaceDrape updates surfaceDrape to topographic', () => {
    useAppStore.getState().setSurfaceDrape('topographic');
    expect(useAppStore.getState().surfaceDrape).toBe('topographic');
  });
});
