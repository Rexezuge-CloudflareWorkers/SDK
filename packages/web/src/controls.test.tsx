// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RefreshButton } from './RefreshButton.tsx';
import { ReadOnlyField } from './ReadOnlyField.tsx';
import { TypeToConfirmModal } from './TypeToConfirmModal.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A clipboard double that resolves, so the success path is reachable. */
function grantingClipboard(): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => Promise.resolve() },
  });
}

/** A clipboard that rejects, as a denied permission does. */
function denyingClipboard(): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => Promise.reject(new Error('denied')) },
  });
}

describe('RefreshButton', () => {
  it('reports the click', () => {
    const onRefresh = vi.fn();
    render(<RefreshButton onRefresh={onRefresh} label="Refresh" />);
    fireEvent.click(screen.getByRole('button'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders the caller label, not an English default', () => {
    // The four copies hard-coded `t('common.refresh', 'Refresh')`.
    render(<RefreshButton onRefresh={() => undefined} label="Neu laden" />);
    expect(screen.getByRole('button')).toHaveTextContent('Neu laden');
  });

  it('blocks activation while the caller work is in flight', () => {
    render(<RefreshButton onRefresh={() => undefined} label="Refresh" loading />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('stays enabled when not loading', () => {
    render(<RefreshButton onRefresh={() => undefined} label="Refresh" />);
    expect(screen.getByRole('button')).toBeEnabled();
  });
});

describe('ReadOnlyField', () => {
  it('shows the value read-only', () => {
    render(<ReadOnlyField label="Volume" value="prod" />);
    expect(screen.getByLabelText('Volume')).toHaveValue('prod');
    expect(screen.getByLabelText('Volume')).toHaveAttribute('readonly');
  });

  it('hides the copy button unless asked for one', () => {
    render(<ReadOnlyField label="Volume" value="prod" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names the copy button, because a lone icon announces as "button"', () => {
    render(<ReadOnlyField label="Volume" value="prod" showCopy copyLabel="Copy to clipboard" />);
    expect(screen.getByRole('button', { name: 'Copy to clipboard' })).toBeDefined();
  });

  it('confirms a copy that actually resolved', async () => {
    grantingClipboard();
    render(<ReadOnlyField label="Volume" value="prod" showCopy copyLabel="Copy" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.getByTitle('Copy').querySelector('.text-\\[var\\(--color-success-text\\)\\]')).toBeDefined());
  });

  it('never confirms a copy that was denied', async () => {
    // The three inlined copies set `copied` unconditionally. This is the whole
    // reason the value is routed through `useCopyToClipboard`.
    denyingClipboard();
    render(<ReadOnlyField label="Volume" value="prod" showCopy copyLabel="Copy" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(globalThis.navigator.clipboard.writeText).toBeDefined());
    expect(screen.getByTitle('Copy').querySelector('.text-\\[var\\(--color-success-text\\)\\]')).toBeNull();
  });

  it('does not throw on a deployment with no clipboard', () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: undefined });
    render(<ReadOnlyField label="Volume" value="prod" showCopy copyLabel="Copy" />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Copy' }))).not.toThrow();
  });
});

describe('TypeToConfirmModal', () => {
  const props = {
    title: 'Delete volume',
    description: 'This cannot be undone.',
    expectedName: 'prod',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    copyLabel: 'Copy name',
    promptLabel: 'Type "prod" to confirm',
  };

  it('keeps confirm disarmed until the name is typed exactly', () => {
    render(<TypeToConfirmModal {...props} onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'prod' } });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('trims the input, since that is invisible to the operator', () => {
    render(<TypeToConfirmModal {...props} onConfirm={() => undefined} onCancel={() => undefined} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  prod  ' } });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('does not fold case, because a name differing in case may be a different resource', () => {
    render(<TypeToConfirmModal {...props} onConfirm={() => undefined} onCancel={() => undefined} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PROD' } });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('confirms once armed', () => {
    const onConfirm = vi.fn();
    render(<TypeToConfirmModal {...props} onConfirm={onConfirm} onCancel={() => undefined} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'prod' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels without arming anything', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<TypeToConfirmModal {...props} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not name its close button the same as its cancel button', () => {
    // The regression that shipped when the corner close button borrowed the
    // cancel label: two buttons announced as "Cancel".
    render(<TypeToConfirmModal {...props} onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined();
  });

  it('keeps a busy confirm from firing twice', () => {
    const onConfirm = vi.fn();
    render(<TypeToConfirmModal {...props} onConfirm={onConfirm} onCancel={() => undefined} loading />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'prod' } });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('copies the expected name', async () => {
    grantingClipboard();
    render(<TypeToConfirmModal {...props} onConfirm={() => undefined} onCancel={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy name' }));
    await waitFor(() => expect(screen.getByTitle('Copy name')).toBeDefined());
  });

  it('is announced as a dialog named by its title', () => {
    render(<TypeToConfirmModal {...props} onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByRole('dialog', { name: 'Delete volume' })).toBeDefined();
  });
});
