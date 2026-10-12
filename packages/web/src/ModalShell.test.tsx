// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ModalShell } from './ModalShell.tsx';
import { ConfirmDeleteModal, EmptyState, LoadingSpinner } from './PageState.tsx';

afterEach(() => {
  cleanup();
});

describe('ModalShell', () => {
  it('renders as a labelled dialog', () => {
    render(
      <ModalShell ariaLabel="Confirm" onClose={() => undefined}>
        <p>body</p>
      </ModalShell>,
    );
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeDefined();
  });

  it('closes on a backdrop click but not on a click inside the panel', () => {
    const onClose = vi.fn();
    render(
      <ModalShell ariaLabel="Confirm" onClose={onClose}>
        <button type="button">inside</button>
      </ModalShell>,
    );

    // Selecting text in a confirmation message must not dismiss the dialog the
    // operator is reading.
    fireEvent.click(screen.getByRole('button', { name: 'inside' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('dialog', { name: 'Confirm' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on the backdrop element itself', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ModalShell ariaLabel="Confirm" onClose={onClose}>
        <p>body</p>
      </ModalShell>,
    );
    fireEvent.click(container.firstElementChild as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <ModalShell ariaLabel="Confirm" onClose={onClose}>
        <p>body</p>
      </ModalShell>,
    );
    fireEvent.keyDown(globalThis, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape when told not to', () => {
    const onClose = vi.fn();
    render(
      <ModalShell ariaLabel="Confirm" onClose={onClose} closeOnEscape={false}>
        <p>body</p>
      </ModalShell>,
    );
    fireEvent.keyDown(globalThis, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes its Escape listener on unmount', () => {
    // A dialog that left a listener behind would close its *replacement* on the
    // next Escape anywhere in the app.
    const first = vi.fn();
    const { unmount } = render(
      <ModalShell ariaLabel="First" onClose={first}>
        <p>body</p>
      </ModalShell>,
    );
    unmount();

    const second = vi.fn();
    render(
      <ModalShell ariaLabel="Second" onClose={second}>
        <p>body</p>
      </ModalShell>,
    );
    fireEvent.keyDown(globalThis, { key: 'Escape' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDeleteModal', () => {
  const props = {
    message: 'Delete support@example.com? This cannot be undone.',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    ariaLabel: 'Confirm delete',
  };

  it('names what will be deleted', () => {
    render(<ConfirmDeleteModal {...props} onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByText(/support@example\.com/)).toBeDefined();
  });

  it('does not name its close button the same as its cancel button', () => {
    // Two buttons announced as "Cancel" leave the operator guessing which one
    // they are on; this is the regression that shipped when the corner close
    // button borrowed the cancel label.
    render(<ConfirmDeleteModal {...props} onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
  });

  it('confirms and cancels through distinct handlers', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDeleteModal {...props} onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('is armed immediately — no confirm timer to wait out', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDeleteModal {...props} onConfirm={onConfirm} onCancel={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled();
  });
});

describe('PageState', () => {
  it('announces what is loading', () => {
    render(<LoadingSpinner label="Loading volumes" />);
    expect(screen.getByRole('status', { name: 'Loading volumes' })).toBeDefined();
  });

  it('renders an empty message with an optional icon', () => {
    const { rerender } = render(<EmptyState message="No volumes yet" />);
    expect(screen.getByText('No volumes yet')).toBeDefined();

    rerender(<EmptyState message="No volumes yet" icon={<span data-testid="icon">*</span>} />);
    expect(screen.getByTestId('icon')).toBeDefined();
  });
});
