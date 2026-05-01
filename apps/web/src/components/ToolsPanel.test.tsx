/**
 * Tests for ToolsPanel.
 *
 *   1. Renders Distance + Elevation profile buttons (the Phase D1 set).
 *   2. Active tool button has aria-pressed="true" and the emerald class.
 *   3. Clicking an inactive button calls setActiveTool with that id;
 *      clicking the active button calls setActiveTool(null).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

let mockActiveTool: string | null = null;
const mockSetActiveTool = vi.fn();

vi.mock('../store/useAppStore.js', () => ({
  useAppStore: (
    selector: (s: { activeTool: string | null; setActiveTool: typeof mockSetActiveTool }) => unknown,
  ) =>
    selector({ activeTool: mockActiveTool, setActiveTool: mockSetActiveTool }),
}));

import ToolsPanel from './ToolsPanel.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockActiveTool = null;
});

describe('ToolsPanel', () => {
  it('renders Distance, Elevation profile, Slope / aspect, Area / volume, and Viewshed buttons', () => {
    render(<ToolsPanel />);
    expect(screen.getByRole('button', { name: 'Distance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elevation profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slope / aspect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Area / volume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Viewshed' })).toBeInTheDocument();
  });

  it('marks the active tool button with aria-pressed="true" and the emerald background', () => {
    mockActiveTool = 'distance';
    render(<ToolsPanel />);
    const distance = screen.getByRole('button', { name: 'Distance' });
    const profile = screen.getByRole('button', { name: 'Elevation profile' });
    expect(distance).toHaveAttribute('aria-pressed', 'true');
    expect(profile).toHaveAttribute('aria-pressed', 'false');
    expect(distance.className).toContain('bg-emerald-600');
    expect(profile.className).not.toContain('bg-emerald-600');
  });

  it('clicking inactive tool calls setActiveTool with its id; clicking active tool calls setActiveTool(null)', () => {
    mockActiveTool = null;
    const { rerender } = render(<ToolsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Distance' }));
    expect(mockSetActiveTool).toHaveBeenCalledWith('distance');

    mockActiveTool = 'distance';
    rerender(<ToolsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Distance' }));
    expect(mockSetActiveTool).toHaveBeenLastCalledWith(null);
  });

  it('renders the panel slot only when a tool is active', () => {
    mockActiveTool = null;
    const { rerender } = render(<ToolsPanel />);
    expect(screen.queryByTestId('tools-panel-slot')).not.toBeInTheDocument();

    mockActiveTool = 'elevation-profile';
    rerender(<ToolsPanel />);
    expect(screen.getByTestId('tools-panel-slot')).toBeInTheDocument();
  });
});
