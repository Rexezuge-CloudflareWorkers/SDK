// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Card, CardHeader, CardTitle } from './Card';

afterEach(cleanup);

describe('Card', () => {
  it('renders its children inside the card surface', () => {
    render(<Card>Card body</Card>);
    const card = screen.getByText('Card body');
    expect(card).toHaveClass('rounded-xl', 'border-[var(--color-border)]', 'bg-[var(--color-surface-1)]', 'p-5');
  });

  it('merges a caller class into the surface classes', () => {
    render(<Card className="mt-4">Card body</Card>);
    expect(screen.getByText('Card body')).toHaveClass('mt-4', 'p-5');
  });

  it('spreads arbitrary attributes onto the card element', () => {
    render(
      <Card id="accounts" role="region" data-testid="card">
        Card body
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card).toHaveAttribute('id', 'accounts');
    expect(card).toHaveAttribute('role', 'region');
  });

  it('renders a title as a level-two heading and keeps it out of the header flow', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
        </CardHeader>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Connected Accounts' })).toHaveClass(
      'text-lg',
      'font-semibold',
      'text-[var(--color-text-primary)]',
    );
  });

  it('lays the header out as a row with room between its two halves', () => {
    render(
      <Card>
        <CardHeader data-testid="header">Header</CardHeader>
      </Card>,
    );
    expect(screen.getByTestId('header')).toHaveClass('mb-4', 'flex', 'items-center', 'justify-between', 'gap-3');
  });
});
