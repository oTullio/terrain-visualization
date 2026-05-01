/**
 * Tests for AboutPanel.tsx.
 *
 * Verifies:
 *   1. Panel is not rendered when open=false.
 *   2. Panel renders all expected sections when open=true.
 *   3. Esc key closes the panel (calls onClose).
 *   4. Backdrop click closes the panel (calls onClose).
 *   5. Close button click closes the panel (calls onClose).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import AboutPanel from './AboutPanel.js';

describe('AboutPanel', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render dialog content when open=false', () => {
    render(<AboutPanel open={false} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders all expected sections when open=true', () => {
    render(<AboutPanel open={true} onClose={onClose} />);

    // Dialog present
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Title
    expect(screen.getByText('About this app')).toBeInTheDocument();

    // Data sources section — check for key providers (multiple matches are fine)
    expect(screen.getAllByText(/OpenStreetMap/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cesium Ion/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/OpenTopoMap/).length).toBeGreaterThan(0);
    expect(screen.getByText('ArcGIS World Hillshade')).toBeInTheDocument();

    // Imagery providers section heading
    expect(screen.getByText('Imagery providers')).toBeInTheDocument();

    // Tech stack section
    expect(screen.getByText(/React 19/)).toBeInTheDocument();
    expect(screen.getByText(/Cesium \/ Resium/)).toBeInTheDocument();
    expect(screen.getByText(/MapLibre GL/)).toBeInTheDocument();
  });

  it('calls onClose when Esc is pressed', () => {
    render(<AboutPanel open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', () => {
    render(<AboutPanel open={true} onClose={onClose} />);
    // The backdrop is the absolute inset-0 div with aria-hidden
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', () => {
    render(<AboutPanel open={true} onClose={onClose} />);
    const closeBtn = screen.getByRole('button', { name: /close about panel/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
