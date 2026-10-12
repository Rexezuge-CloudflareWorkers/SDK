// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Badge } from './Badge.tsx';

afterEach(cleanup);

describe('Badge', () => {
  it('renders its children on a neutral badge by default', () => {
    render(<Badge>Draft</Badge>);
    const badge = screen.getByText('Draft');
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveClass('inline-flex', 'shrink-0', 'items-center', 'rounded-md', 'text-xs', 'font-medium');
    expect(badge).toHaveClass('bg-[var(--color-neutral-bg)]', 'text-[var(--color-neutral-text)]');
  });

  it('paints the tone each variant names', () => {
    const cases = [
      { variant: 'success', background: 'bg-[var(--color-success-bg)]', foreground: 'text-[var(--color-success-text)]' },
      { variant: 'error', background: 'bg-[var(--color-error-bg)]', foreground: 'text-[var(--color-error-text)]' },
      { variant: 'warning', background: 'bg-[var(--color-warning-bg)]', foreground: 'text-[var(--color-warning-text)]' },
      { variant: 'info', background: 'bg-[var(--color-info-bg)]', foreground: 'text-[var(--color-info-text)]' },
      { variant: 'neutral', background: 'bg-[var(--color-neutral-bg)]', foreground: 'text-[var(--color-neutral-text)]' },
    ] as const;
    for (const { variant, background, foreground } of cases) {
      render(
        <Badge variant={variant} data-testid={`badge-${variant}`}>
          {variant}
        </Badge>,
      );
      const badge = screen.getByTestId(`badge-${variant}`);
      expect(badge).toHaveClass(background, foreground);
      cleanup();
    }
  });

  it('merges a caller class and spreads attributes', () => {
    render(
      <Badge variant="info" className="ml-2" id="status" role="note">
        Running
      </Badge>,
    );
    const badge = screen.getByRole('note');
    expect(badge).toHaveClass('bg-[var(--color-info-bg)]', 'ml-2');
    expect(badge).toHaveAttribute('id', 'status');
  });
});
