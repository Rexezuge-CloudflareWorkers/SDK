import { useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { Button } from './Button.tsx';
import { Input, Label } from './Input.tsx';
import { ModalShell } from './ModalShell.tsx';
import { useCopyToClipboard } from './useCopyToClipboard.ts';

/**
 * The "type the name to confirm this destructive action" dialog.
 *
 * ## Provenance
 *
 * `components/modals/TypeToConfirmModal.tsx` in **Durable-DAV**,
 * **Durable-DAV-Router**, **Edge-Git** and **Mail-Otter** — four copies that
 * agreed on the interaction and each carried its own clipboard handler.
 *
 * ## Why this exists alongside `ConfirmDeleteModal`
 *
 * The two are not interchangeable, and merging them would lose the distinction
 * that makes either useful. A confirmation whose button is always armed asks
 * nothing of the operator; this one requires typing the exact name, which is
 * the right price for deleting a volume, a branch, or a credential. A repo
 * that wants the cheap one uses {@link ConfirmDeleteModal}; a repo that wants
 * this one names the thing twice.
 *
 * ## The match is exact, not case-insensitive
 *
 * All four copies compared `input.trim() === expectedName`. That is
 * intentional and is kept: a confirmation the operator has to get exactly right
 * is a confirmation they read. Trimming is allowed because it is invisible; case
 * folding is not, because a name differing only in case may well be a different
 * resource on a case-insensitive backend.
 */

interface TypeToConfirmModalProps {
  /** The dialog's heading, and its accessible name. */
  title: string;
  /** The line under the heading, explaining what happens on confirm. */
  description: string;
  /** The string the operator must type. Shown, and offered as a copy. */
  expectedName: string;
  confirmLabel: string;
  cancelLabel: string;
  /** The copy button's accessible name and tooltip. */
  copyLabel: string;
  /** The prompt over the input. Name the thing: `Type "prod" to confirm`. */
  promptLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

function TypeToConfirmModal({
  title,
  description,
  expectedName,
  confirmLabel,
  cancelLabel,
  copyLabel,
  promptLabel,
  onConfirm,
  onCancel,
  loading = false,
}: Readonly<TypeToConfirmModalProps>) {
  const [input, setInput] = useState('');
  const { copied, copy } = useCopyToClipboard();

  const matched = input.trim() === expectedName;

  return (
    // `closeLabel` is deliberately not `cancelLabel`: a dialog whose corner
    // close button and body cancel button share a name is announced as two
    // identical buttons. `ModalShell` defaults it to "Close" for that reason.
    <ModalShell onClose={onCancel} widthClass="w-full max-w-md mx-4" ariaLabel={title}>
      <div className="p-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-error-bg)] mb-4 mx-auto">
          <AlertTriangle className="h-5 w-5 text-[var(--color-error-text)]" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] text-center mb-2">{title}</h2>
        <p className="text-sm text-[var(--color-text-secondary)] text-center mb-4">{description}</p>
        <div className="flex items-center justify-center gap-2 mb-4">
          <code className="px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)] text-sm font-mono text-[var(--color-text-primary)] break-all">
            {expectedName}
          </code>
          <button
            type="button"
            onClick={() => copy(expectedName)}
            title={copyLabel}
            aria-label={copyLabel}
            className="px-2.5 py-2 rounded-lg bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors duration-150"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--color-success-text)]" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="space-y-1.5 mb-6">
          <Label htmlFor="danger-confirm-input">{promptLabel}</Label>
          <Input
            id="danger-confirm-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={expectedName}
            autoComplete="off"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={(event) => {
              event.stopPropagation();
              onCancel();
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            // Armed only on an exact match. `loading` is forwarded separately
            // so a confirm already in flight cannot be fired a second time.
            disabled={!matched}
            loading={loading}
            onClick={(event) => {
              event.stopPropagation();
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

export { TypeToConfirmModal };
export type { TypeToConfirmModalProps };
