import type { ReactNode } from 'react';
import { ModalShell } from './ModalShell.tsx';

/**
 * The shared loading / empty / error states.
 *
 * Converged from `components/layout/PageState.tsx` (Durable-DAV,
 * Durable-DAV-Router) and `EmptyState` (CalDAV-Bridge), which were the same two
 * components under two names.
 *
 * Same reasoning as `ModalShell`: the label arrives as a prop rather than from
 * `useTranslation`, so a consumer is not required to run a translation library
 * to render a spinner.
 */

/** The shared spinner. `label` is announced, so it should say what is loading. */
function LoadingSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="min-h-64 flex items-center justify-center" role="status" aria-label={label}>
      <div className="h-10 w-10 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
    </div>
  );
}

/** The shared centered empty message, with an optional icon above it. */
function EmptyState({ icon, message }: { icon?: ReactNode; message: ReactNode }) {
  return (
    <div className="text-center text-[var(--color-text-muted)] py-10 text-sm">
      {icon && <div className="mb-3 flex justify-center">{icon}</div>}
      {message}
    </div>
  );
}

/**
 * A confirmation for a destructive action.
 *
 * `message` is required to **name the thing being deleted**, not to say "this
 * item" — the operator is the only one who can tell whether they meant to
 * delete it, so the dialog has to be specific. That is a contract on the
 * caller, not something the component can enforce, which is why `message` is a
 * `ReactNode` the caller composes rather than a template this fills in.
 *
 * No confirm timer: a dialog that arms itself makes the operator wait for a
 * decision they were already qualified to make.
 *
 * Both handlers stop propagation, because a confirm that fires twice deletes
 * two things.
 */
function ConfirmDeleteModal({
  message,
  confirmLabel,
  cancelLabel,
  ariaLabel,
  onConfirm,
  onCancel,
}: {
  /** The full question, naming what will be deleted. */
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  ariaLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalShell onClose={onCancel} widthClass="w-80" ariaLabel={ariaLabel}>
      <div className="p-6">
        <p className="text-sm text-[var(--color-text-secondary)] text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            type="button"
            className="flex-1"
            onClick={(event) => {
              event.stopPropagation();
              onCancel();
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="flex-1"
            onClick={(event) => {
              event.stopPropagation();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export { ConfirmDeleteModal, EmptyState, LoadingSpinner };
