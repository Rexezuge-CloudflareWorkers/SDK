// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Spinner } from './Spinner.tsx';

afterEach(cleanup);

/**
The ring is a bordered circle; read its declarations, not a computed style.
*/
function ringStyle(container: HTMLElement): string {
  const ring = container.querySelector('.animate-spin');
  expect(ring).not.toBeNull();
  return ring?.getAttribute('style') ?? '';
}

describe('Spinner', () => {
  it('renders the animated ring', () => {
    const { container } = render(<Spinner />);
    const ring = container.querySelector('.animate-spin');
    expect(ring).toHaveAttribute('aria-hidden', 'true');
    expect(ring).toHaveStyle({ width: '24px', height: '24px' });
  });

  it('takes a size and a colour', () => {
    const { container } = render(<Spinner size={16} color="currentColor" />);
    const style = ringStyle(container);
    expect(style).toContain('width: 16px');
    expect(style).toContain('height: 16px');
    // jsdom expands the shorthand into the four longhands.
    expect(style).toContain('border-width: 2px');
    expect(style).toContain('border-style: solid');
    expect(style).toContain('border-color: transparent currentcolor currentcolor');
  });

  it('defaults its colour to the theme spinner token', () => {
    const { container } = render(<Spinner />);
    const style = ringStyle(container);
    expect(style).toContain('border-width: 2px');
    expect(style).toContain('border-style: solid');
    // `#60a5fa` is `theme.spinnerBlue`.
    expect(style).toContain('rgb(96, 165, 250)');
  });

  it('renders a caption when it has one', () => {
    render(<Spinner label="Loading accounts" />);
    expect(screen.getByText('Loading accounts')).toBeInTheDocument();
    cleanup();
    render(<Spinner />);
    expect(screen.queryByText('Loading accounts')).toBeNull();
  });
});
