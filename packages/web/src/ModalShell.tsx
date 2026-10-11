import { useEffect, type ReactNode } from 'react';

/**
 * The modal frame every confirm dialog in the family sits inside.
 *
 * Converged from `components/modals/ModalShell.tsx` in Durable-DAV,
 * Durable-DAV-Router, Mail-Otter and Edge-Git, where the copies were
 * byte-identical apart from an import-order difference.
 *
 * ## Two decisions the copies made by accident, now made deliberately
 *
 * **It renders in a portal.** A dialog nested in a scrolling container is
 * clipped by it, and one nested inside a `position: fixed` ancestor is
 * positioned by that ancestor rather than the viewport. The portal is what makes
 * "centre of the screen" mean the same thing everywhere.
 *
 * **It closes on the backdrop but not on the panel.** The backdrop click closes;
 * a click inside the panel stops propagating so that selecting text in a
 * confirmation message does not dismiss the dialog the operator is reading. The
 * stop is on the panel, not the backdrop, so a click on the panel never closes
 * it and a click outside always does.
 *
 * ## Labels are props, not translations
 *
 * The copies called `useTranslation` for the close button and the default width.
 * A shared primitive that reaches into a translation library forces every
 * consumer to have one installed *and* configured, for a string it already has
 * — the caller rendering the dialog is the one that knows what it says. So
 * `closeLabel` and `ariaLabel` are ordinary props with no default, and a repo
 * passes `t('common.close')` when it wants them translated.
 */

/** Escape closes, and the initial focus lands on the dialog. */
interface ModalShellProps {
  onClose: () => void;
  children: ReactNode;
  /** Width utility class. Kept as a class so a repo themes it without forking. */
  widthClass?: string;
  /** Announced to assistive tech; there is no visible title in the frame itself. */
  ariaLabel: string;
  /**
   * Accessible name for the corner close button.
   *
   * Kept distinct from any cancel action in the body: a dialog whose close
   * button and cancel button share a name is announced as two identical
   * buttons, and the operator has to guess which one they are on.
   */
  closeLabel?: string;
  /** Close on Escape. Defaults to true. */
  closeOnEscape?: boolean;
}

function ModalShell({ onClose, children, widthClass = 'w-80', ariaLabel, closeLabel = 'Close', closeOnEscape = true }: ModalShellProps) {
  useEffect(() => {
    if (!closeOnEscape) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    globalThis.addEventListener('keydown', onKeyDown);
    // Removed on unmount: a dialog that closed by leaving a listener behind
    // would close its replacement too, on the next Escape anywhere.
    return (): void => globalThis.removeEventListener('keydown', onKeyDown);
  }, [closeOnEscape, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose} role="presentation">
      <div className="fixed inset-0 bg-black/60 animate-backdrop-in" aria-hidden="true" />
      <div
        className={`relative bg-[var(--color-surface-1)] border border-[var(--color-border-muted)] rounded-2xl shadow-2xl animate-fade-in ${widthClass}`}
        onClick={(event) => {
          // The one place a click inside the panel must not reach the backdrop.
          event.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute top-3 right-3 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          {closeLabel}
        </button>
        {children}
      </div>
    </div>
  );
}

export { ModalShell };
export type { ModalShellProps };
