import { useCallback, useState, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from './Button';

/**
 * A button that owns its own busy state.
 *
 * ## Provenance
 *
 * `components/ui/LoadingButton.tsx` in **AWS-AccessBridge**. `Button` absorbed
 * everything it does — the `loading` prop, the disabled-while-busy semantics,
 * the spinner — so a consumer that drives state itself should reach for
 * `Button`. This wrapper stays for the call sites that hand it an async
 * `onClick` and let it track the in-flight promise, which is the shape every
 * `LoadingButton` in that repo uses.
 *
 * Two normalizations from the original:
 *
 * - **Variant names.** `'blue' | 'green' | 'red'` became the kit's
 *   `'primary' | 'secondary' | 'danger' | 'ghost'`; the original's default
 *   (`'blue'`, the solid action colour) maps to `primary`, and that default is
 *   kept even though `Button` itself defaults to `secondary` — a caller that
 *   reaches for this component wants the action to be the loudest thing it can
 *   be, and the original's call sites all relied on it.
 * - **The handler is fire-and-forget with `void`.** `onClick` may return a
 *   promise; the button holds `loading` until it settles, and the promise is
 *   deliberately not awaited inside the handler so an `await`-less call site
 *   reads the same as an async one.
 */

interface LoadingButtonProps {
  /** Runs on activation; the button is busy until a returned promise settles. */
  onClick: () => Promise<void> | void;
  /** Blocks activation regardless of the busy state. */
  disabled?: boolean;
  /** Visual weight; defaults to `primary`. */
  variant?: ButtonVariant;
  /** Control size; defaults to `md`. */
  size?: ButtonSize;
  children: ReactNode;
  /** Defaults to `button`, matching `Button`. */
  type?: 'button' | 'submit' | 'reset';
  /** Extra classes, merged over the button's. */
  className?: string;
}

function LoadingButton({
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'md',
  children,
  type = 'button',
  className,
}: Readonly<LoadingButtonProps>): ReactElement {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) {
        return;
      }
      const result = onClick();
      if (result instanceof Promise) {
        setLoading(true);
        // The state flip is scheduled before the await, not after it: a caller
        // reading the tree right after the click must already see the spinner.
        //
        // A rejection clears the busy state and is deliberately *not*
        // re-thrown: the handler is fire-and-forget, so re-throwing would only
        // produce an unhandled rejection (and a failed test run under vitest).
        // The call site owns its error reporting — every AWS-AccessBridge call
        // site does exactly that inside its own `onClick`.
        const settle = (): void => {
          setLoading(false);
        };
        void result.then(settle, settle);
      }
    },
    [disabled, loading, onClick],
  );

  return (
    <Button variant={variant} size={size} type={type} className={className} loading={loading} disabled={disabled} onClick={handleClick}>
      {children}
    </Button>
  );
}

export { LoadingButton };
export type { LoadingButtonProps };
