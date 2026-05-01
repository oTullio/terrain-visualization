/**
 * Tests for the reducedScene slice in useAppStore (E5).
 *
 * Verifies:
 *   1. setReducedScene(true) sets reducedScene to true.
 *   2. setReducedScene(false) sets reducedScene to false.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore.js';

describe('useAppStore — reducedScene slice', () => {
  beforeEach(() => {
    // Reset to a known state regardless of window.matchMedia at test startup.
    useAppStore.setState({ reducedScene: false });
  });

  it('setReducedScene(true) enables reduced-scene mode', () => {
    useAppStore.getState().setReducedScene(true);
    expect(useAppStore.getState().reducedScene).toBe(true);
  });

  it('setReducedScene(false) disables reduced-scene mode', () => {
    // Start ON so the test actually exercises the toggle.
    useAppStore.setState({ reducedScene: true });
    useAppStore.getState().setReducedScene(false);
    expect(useAppStore.getState().reducedScene).toBe(false);
  });
});
