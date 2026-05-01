/**
 * Tests for AboutButton.tsx.
 *
 * Verifies:
 *   1. Renders a button with text "About".
 *   2. Clicking the button calls the onClick handler.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import AboutButton from './AboutButton.js';

describe('AboutButton', () => {
  it('renders a button with text "About"', () => {
    render(<AboutButton onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: /about this app/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('About');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<AboutButton onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /about this app/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
