// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { act } from 'react';
import { LoadingButton } from './LoadingButton.tsx';

afterEach(cleanup);

describe('LoadingButton', () => {
  it('renders its children as a primary button by default', () => {
    render(<LoadingButton onClick={() => {}}>Revoke</LoadingButton>);
    const button = screen.getByRole('button', { name: 'Revoke' });
    expect(button).toHaveClass('bg-[var(--color-accent)]');
    expect(button).toBeEnabled();
  });

  it('calls a synchronous onClick and stays enabled', () => {
    const onClick = vi.fn();
    render(<LoadingButton onClick={onClick}>Save</LoadingButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button')).toBeEnabled();
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
  });

  it('holds the busy state until the promise settles, then clears it', async () => {
    let release: (() => void) | undefined;
    const onClick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(<LoadingButton onClick={onClick}>Save</LoadingButton>);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    const busy = screen.getByRole('button');
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(onClick).toHaveBeenCalledTimes(1);

    // A second press while busy does not re-enter the action.
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
      await Promise.resolve();
    });
    expect(screen.getByRole('button')).toBeEnabled();
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
  });

  it('clears the busy state when the action rejects', async () => {
    const onClick = vi.fn(() => Promise.reject(new Error('nope')));
    render(<LoadingButton onClick={onClick}>Save</LoadingButton>);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('does not fire while disabled', () => {
    const onClick = vi.fn();
    render(
      <LoadingButton disabled onClick={onClick}>
        Save
      </LoadingButton>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('passes the variant, size and type through', () => {
    render(
      <LoadingButton variant="danger" size="sm" type="submit" onClick={() => {}}>
        Delete
      </LoadingButton>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-[var(--color-error-bg)]', 'px-3', 'text-xs');
    expect(button).toHaveAttribute('type', 'submit');
  });
});
