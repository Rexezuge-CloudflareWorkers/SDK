// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Button } from './Button';

afterEach(cleanup);

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('defaults to the secondary variant at the medium size', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-[var(--color-surface-3)]', 'px-4', 'py-2');
  });

  it('applies the variant and size classes it is given', () => {
    render(
      <Button variant="primary" size="lg">
        Continue
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-[var(--color-accent)]', 'text-[#0d1008]', 'px-5', 'py-2.5', 'text-base');
    expect(button).not.toHaveClass('bg-[var(--color-surface-3)]');
  });

  it('merges a caller class over the variant classes', () => {
    render(<Button className="px-6 w-full">Save</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('px-6', 'w-full');
    expect(button).not.toHaveClass('px-4');
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not submit the form it sits in unless asked to', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    cleanup();
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('blocks onClick while disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('blocks onClick while loading, even for a synthesized event', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button');
    // jsdom honours `disabled` for `fireEvent`, so dispatch straight at the
    // element: the handler has to refuse the click on its own.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows its loading state', () => {
    const { container } = render(
      <Button loading onClick={() => undefined}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Save');
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('is not marked busy when it is not loading', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('forwards arbitrary button attributes', () => {
    render(
      <Button aria-label="Close" data-testid="close" form="form-1">
        ×
      </Button>,
    );
    const button = screen.getByTestId('close');
    expect(button).toHaveAttribute('aria-label', 'Close');
    expect(button).toHaveAttribute('form', 'form-1');
  });
});
