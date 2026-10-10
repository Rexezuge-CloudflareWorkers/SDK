// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Input, Label } from './Input';

afterEach(cleanup);

describe('Input', () => {
  it('renders a labelled field and forwards value and onChange', () => {
    const onChange = vi.fn();
    render(
      <>
        <Label htmlFor="account-name">Account Name</Label>
        <Input id="account-name" value="prod" onChange={onChange} />
      </>,
    );
    const field = screen.getByLabelText('Account Name');
    expect(field).toHaveValue('prod');
    fireEvent.change(field, { target: { value: 'staging' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('associates the label with the control it names', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" />
      </>,
    );
    expect(screen.getByText('Email')).toHaveAttribute('for', 'email');
  });

  it('applies the shared field classes and a caller override', () => {
    render(<Input className="max-w-xs" placeholder="you@example.test" />);
    const field = screen.getByPlaceholderText('you@example.test');
    expect(field).toHaveClass('w-full', 'rounded-lg', 'border-[var(--color-border)]', 'px-3', 'py-2', 'max-w-xs');
  });

  it('carries the error state the caller describes', () => {
    // The kit has no `error` prop — every consumer renders its own message and
    // its own border rule. What the element owes them is the pass-through.
    render(
      <>
        <Label htmlFor="token">Token</Label>
        <Input id="token" aria-invalid aria-describedby="token-error" className="border-[var(--color-error-text)]" />
        <p id="token-error">The token was rejected.</p>
      </>,
    );
    const field = screen.getByLabelText('Token');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', 'token-error');
    expect(field).toHaveClass('border-[var(--color-error-text)]');
    expect(screen.getByText('The token was rejected.')).toBeInTheDocument();
  });

  it('disables the field when told to', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
