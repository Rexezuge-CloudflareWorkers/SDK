import { useId } from 'react';
import { Check, Copy } from 'lucide-react';
import { Label } from './Input.tsx';
import { cn } from './utils.ts';
import { useCopyToClipboard } from './useCopyToClipboard.ts';

/**
 * A labelled, read-only value with an optional copy button.
 *
 * ## Provenance
 *
 * `components/shared/ReadOnlyField.tsx` in **Durable-DAV**, **Durable-DAV-Router**,
 * **Edge-Git** and **Mail-Otter** — four copies in two shapes. The three outside
 * Durable-DAV inlined the clipboard handler; Durable-DAV's called its
 * `useCopyToClipboard` hook, which is the version that converged into
 * `@rexezuge/web` and is the one this uses.
 *
 * ## The third bug, which all four copies carried
 *
 * Every copy rendered `<Label>{label}</Label>` with no `htmlFor`, so the value
 * input had **no accessible name** — announced as a bare "edit text" for a field
 * whose contents are, in every call site in the family, a credential or an
 * identifier. The click target and the name both depend on the `for`, and
 * neither is visible in the markup that omits it. `useId` pairs them here so a
 * caller cannot forget.
 *
 * The difference was not cosmetic. The inlined three called
 * `navigator.clipboard.writeText` unguarded, so on a plain-HTTP deployment the
 * handler threw synchronously before reporting anything — and where they did
 * guard it, a denied permission still showed the checkmark for a copy that never
 * happened. Every value this component is pointed at in the family is a secret
 * or an identifier, so the false success sends the operator away believing they
 * have something they do not. See `useCopyToClipboard` for both failures.
 */

interface ReadOnlyFieldProps {
  /**
  The field's label.
  */
  label: string;
  /**
  The value, shown verbatim and selectable.
  */
  value: string;
  /**
  Show the copy button. Defaults to false.
  */
  showCopy?: boolean;
  /**
   * The copy button's accessible name and tooltip.
   *
   * Required whenever `showCopy` is set — a copy button carrying only an icon is
   * announced as "button" with nothing else.
   */
  copyLabel?: string;
  /**
  Merged last onto the value's `<input>`.
  */
  className?: string;
}

function ReadOnlyField({ label, value, showCopy = false, copyLabel, className }: Readonly<ReadOnlyFieldProps>) {
  const { copied, copy } = useCopyToClipboard();
  // The four copies rendered `<Label>{label}</Label>` with no `htmlFor`, so the
  // value input had **no accessible name** — a screen reader announced a bare
  // "edit text" for a field holding a secret. The kit's own `Input.tsx` records
  // this hazard; `useId` pairs the label without asking a caller for an id.
  const inputId = useId();

  return (
    <div>
      <Label className="mb-1.5" htmlFor={inputId}>
        {label}
      </Label>
      <div className="flex">
        <input
          id={inputId}
          readOnly
          value={value}
          className={cn(
            'min-w-0 px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm flex-1',
            showCopy ? 'rounded-l-lg border-r-0' : 'rounded-lg',
            className,
          )}
        />
        {showCopy && (
          <button
            type="button"
            onClick={() => copy(value)}
            title={copyLabel}
            aria-label={copyLabel}
            // `aria-live` so the confirmation is announced. The icon swap alone
            // is invisible to a screen reader, which would make the success
            // state silent for exactly the users copying a secret by hand.
            aria-live="polite"
            className="px-3 py-2 rounded-r-lg bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors duration-150"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--color-success-text)]" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export { ReadOnlyField };
export type { ReadOnlyFieldProps };
